import tracker from "../tracker.js"
import deleteResource from "./deleteResource.js"
import listRetainedResourceArns from "./listRetainedResourceArns.js"
import listLiveResourceArns from "./listLiveResourceArns.js"
import getStatus from "../getStatus/index.js"

/**
 * Delete retained resources created by some stacks but not associated with
 * them anymore, and prune old files from deployment bucket
 * @param {import('../params/index.js').StackParams[]} stacks The list of stack
 * parameters to prune
 */
export default async function pruneRetainedResources(stacks) {
  // Select and de-duplicate the stacks which have been flagged to be pruned
  let stacksToPrune = stacks
    .filter(({ noRetained }) => !noRetained)
    .reduce((dedup, stack) => {
      let isDuplicate = false
      for (const { region, stackName } of dedup) {
        if (region === stack.region && stackName === stack.stackName) {
          // If the current stack is a duplicate
          isDuplicate = true
          break
        }
      }
      if (!isDuplicate) dedup.push(stack)
      return dedup
    }, [])

  if (Object.keys(stacksToPrune).length === 0) return

  // Collect the Arns of live resources across all stacks
  tracker.setStatus(`retrieving live resources`)
  const liveResourceArns = (
    await Promise.all(
      stacksToPrune.map(async ({ region, stackName }) => {
        if ((await getStatus({ region, stackName })) !== "NEW")
          // Don't attempt to collect live resources if stack doesn't exist
          return await listLiveResourceArns({ region, stackName })
      })
    )
  ).flat() // Combine arns across all stacks (will remove inexisting stacks)

  // Collect the Arns of retained resources for each stack
  tracker.setStatus(`retrieving retained resources`)
  const retainedResources = (
    await Promise.all(
      stacksToPrune.map(async ({ region, stackName, forceDelete }) =>
        (
          await listRetainedResourceArns({
            region,
            stackName,
            exclude: liveResourceArns,
          })
        ).map((arn) => ({ region, arn, forceDelete }))
      )
    )
  ).flat()

  if (retainedResources.length === 0) {
    // If there are no retained resources
    tracker.interruptInfo(`No retained resources`)
    return
  }

  // Auto-select the resources flagged with forceDelete
  const resourcesToDelete = retainedResources.filter(
    ({ forceDelete }) => forceDelete
  )

  // Ask for confirmation for resources not flagged with forceDelete
  const resourcesToConfirm = retainedResources.filter(
    ({ forceDelete }) => !forceDelete
  )
  if (resourcesToConfirm.length > 0) {
    const { confirmedIds } = await tracker.prompt({
      type: "multiselect",
      name: "confirmedIds",
      message: "Do you want to delete any retained resources?",
      choices: resourcesToConfirm.map(({ region, arn }) => ({
        name: `${arn} (${region})`,
        // We use a separator which is not a valid character in either arn or
        // region to build a string id for each arn/region
        value: `${arn}|${region}`,
      })),
      result(names) {
        return this.map(names) // Return a map of name: value
      },
    })
    // Add all confirmed arns to the list of arns to delete
    Object.values(confirmedIds).forEach((id) => {
      const [arn, region] = id.split("|")
      resourcesToDelete.push({ region, arn, forceDelete: false })
    })
  }

  // Delete confirmed resources
  tracker.setStatus(`deleting retained resources`)
  const deletedResources = (
    await Promise.all(
      resourcesToDelete.map(async ({ region, arn }) => {
        const [isDeleted, error] = await deleteResource({ region, arn })
        if (isDeleted) {
          tracker.interruptSuccess(`Deleted ${arn}`)
          return { region, arn }
        }
        if (error) tracker.interruptWarn(`Failed to delete ${arn}: ${error}`)
        else tracker.interruptWarn(`Failed to delete ${arn}`)
      })
    )
  ).filter(Boolean) // Remove failed resources

  // Check how many resources are still retained after deletions
  tracker.setStatus(`checking retained resources after deletion`)
  const retainedResourcesLeft = (
    await Promise.all(
      stacksToPrune.map(({ region, stackName }) =>
        listRetainedResourceArns({
          region,
          stackName,
          exclude: liveResourceArns,
        })
      )
    )
  ).flat()
  tracker.interruptInfo(
    `Deleted ${deletedResources.length} retained resources, ${
      retainedResourcesLeft.length ? retainedResourcesLeft.length : "none"
    } left`
  )
}
