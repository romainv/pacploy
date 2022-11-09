import tracker from "../tracker.js"
import emptyBucket from "./emptyBucket.js"
import listPackagedFiles from "../pkg/listPackagedFiles.js"
import getStatus from "../getStatus/index.js"
import resolveParams from "../params/index.js"
import listBucket from "./listBucket.js"

/**
 * @typedef {Object} PruningParams The pruning parameters
 * @property {String} region The bucket's region
 * @property {String} bucket The bucket name
 * @property {Object} [tagsFilter] S3 objects tags to filter which objects
 * to delete
 * @property {Array<String>} [exclude] A list of keys to keep
 * @property {Number} [pageSize=1000] The number of keys to return per page
 */

/**
 * Prune unused packaged files associated with stacks from their deployment
 * buckets
 * @param {import('../params/index.js').StackParams[]} stacks The list of stack
 * parameters to prune
 */
export default async function prunePackagedFiles(stacks) {
  // Resolve stacks parameters
  tracker.setStatus(`resolving stacks parameters`)
  const _stacks = (await Promise.all(stacks.map(resolveParams)))
    // Only consider stacks with a deployment bucket flagged to be pruned
    .filter(({ noPrune, deployBucket }) => !noPrune && deployBucket)
    // Remove potential duplicates and format as a map
    .reduce((res, stack) => {
      // Keep only the first occurrence in case of duplicates
      if (!Object.keys(res).includes(stack.id)) res[stack.id] = stack
      return res
    }, {})

  if (Object.keys(_stacks).length === 0) return

  // Select the stacks which have files to prune
  tracker.setStatus(`retrieving files to prune`)
  // Build the parameters used to list and empty the buckets
  const prunableStacks = Object.assign(
    {},
    ...(
      await Promise.all(
        Object.entries(_stacks).map(async ([id, stack]) => {
          const pruningParams = await getPruningParams(stack)
          // Check if the stack needs pruning, if so retain its params
          if (await needsPruning(pruningParams)) return { [id]: pruningParams }
        })
      )
    ).filter(Boolean)
  )

  if (Object.keys(prunableStacks).length === 0) {
    tracker.interruptInfo("No files to prune")
    return
  }

  // Auto-confirm stacks with the forceDelete flag
  const stackIdsToPrune = Object.keys(prunableStacks).filter(
    (id) => _stacks[id].forceDelete
  )
  // Check which stacks require confirmation
  const stackIdsToConfirm = Object.keys(prunableStacks).filter(
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
        stackIdsToPrune.map((id) => emptyBucket(prunableStacks[id]))
      )
    ).flat()
    // Display the number of pruned files
    tracker[prunedKeys.length ? "interruptSuccess" : "interruptInfo"](
      `${prunedKeys.length ? prunedKeys.length : "No"} unused files pruned`
    )
  }
}

/**
 * Retrieve the pruning parameters for a stack
 * @param {import('../params/index.js').ResolvedStackParams} params The stack's
 * parameters
 * @return {Promise<PruningParams>} The pruning parameters
 */
async function getPruningParams({ region, stackName, deployBucket }) {
  // Retrieve the list of packaged files still in use by the current
  // stack, if it exists
  const packagedFiles =
    (await getStatus({ region, stackName })) === "NEW"
      ? []
      : await listPackagedFiles({ region, stackName, deployBucket })
  // Build the pruning parameters
  const pruningParams = {
    region,
    bucket: deployBucket,
    // Only prune the stack's files
    tagsFilter: { RootStackName: stackName },
    // Don't delete packaged files still in use
    exclude: packagedFiles
      .filter(({ Bucket }) => Bucket === deployBucket)
      .map(({ Key }) => Key),
  }
  return pruningParams
}

/**
 * Checks if a stack has files that need to be pruned
 * @param {PruningParams} params The pruning parameters
 * @return {Promise<Boolean>} Whether the stack needs pruning
 */
async function needsPruning(params) {
  let needsPruning = false,
    nextVersionIdMarker,
    nextKeyMarker
  do {
    // Retrieve object versions
    let objects
    ;[objects, nextVersionIdMarker, nextKeyMarker] = await listBucket(
      params,
      nextVersionIdMarker,
      nextKeyMarker
    )
    if (objects.length > 0) {
      needsPruning = true
      break
    }
  } while (nextVersionIdMarker || nextKeyMarker)
  return needsPruning
}
