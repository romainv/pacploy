import tracker from "../tracker.js"
import emptyBucket from "./emptyBucket.js"
import listPackagedFiles from "../pkg/listPackagedFiles.js"
import getStatus from "../getStatus/index.js"
import resolveArgs from "../resolveArgs/index.js"

/**
 * Prune unused packaged files associated with stacks from their deployment
 * buckets
 * @param {import('./index.js').StackParam[]} stacks The stack parameters
 */
export default async function prunePackagedFiles(stacks) {
  // Remove potential duplicates and set an identifier for each stack
  const _stacks = stacks.reduce((res, stack) => {
    // De-duplicate stacks by their region and name
    const id = `${stack.region}|${stack.stackName}`
    // Keep only the first occurrence in case of duplicates
    if (!Object.keys(res).includes(id)) res[id] = stack
    return res
  }, {})

  // Resolve deployment bucket if needed
  await Promise.all(
    Object.entries(_stacks).map(async ([id, stack]) => {
      const { deployBucket } = await resolveArgs(stack)
      _stacks[id].deployBucket = deployBucket
    })
  )

  // Select the stacks which have a deployment bucket flagged to be pruned
  let prunableStackIds = Object.entries(_stacks)
    .filter(([, { noPrune, deployBucket }]) => !noPrune && deployBucket)
    .map(([id]) => id)
  // Auto-confirm stacks with the forceDelete flag
  const stackIdsToPrune = prunableStackIds.filter(
    (id) => _stacks[id].forceDelete
  )
  // Check which stacks require confirmation
  const stackIdsToConfirm = prunableStackIds.filter(
    (id) => !_stacks[id].forceDelete
  )
  if (stackIdsToConfirm.length > 0) {
    // Ask for user confirmation if needed
    const { confirmedIds } = await tracker.prompt({
      type: "multiselect",
      name: "confirmedIds",
      message: "Select stacks for which to prune deployment files",
      choices: stackIdsToConfirm.map((id) => ({
        name: `${_stacks[id].stackName} (${_stacks[id].region})`,
        value: id,
      })),
      result(names) {
        return this.map(names) // Return a map of name: value
      },
    })
    // Add the confirmed stacks to the list
    Object.values(confirmedIds).forEach((id) => stackIdsToPrune.push(id))
  }

  // Prune the selected stacks
  if (stackIdsToPrune.length > 0) {
    tracker.setStatus(
      `pruning old deployment files of ${stackIdsToPrune.length} stacks`
    )
    const prunedKeys = (
      await Promise.all(
        stackIdsToPrune.map(async (id) => {
          const { region, stackName, deployBucket } = _stacks[id]
          // Retrieve the list of packaged files still in use by the current
          // stack, if the stack exists
          const packagedFiles =
            (await getStatus({ region, stackName })) === "NEW"
              ? []
              : await listPackagedFiles({
                  region,
                  stackName,
                  deployBucket,
                })
          // Remove unused packaged files associated with the current stack
          return await emptyBucket({
            region,
            bucket: deployBucket,
            // Only delete amongst the stack's files
            tagsFilter: { RootStackName: stackName },
            // Don't delete packaged files still in use
            // DEBUG: What about files used in multiple stacks?
            exclude: packagedFiles
              .filter(({ Bucket }) => Bucket === deployBucket)
              .map(({ Key }) => Key),
          })
        })
      )
    ).flat()
    // Display the number of pruned files
    tracker[prunedKeys.length ? "interruptSuccess" : "interruptInfo"](
      `${prunedKeys.length ? prunedKeys.length : "No"} unused files pruned`
    )
  }
}
