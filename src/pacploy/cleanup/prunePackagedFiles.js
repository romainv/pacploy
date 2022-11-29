import tracker from "../tracker.js"
import getPackagedFilesInUse from "./getPackagedFilesInUse.js"
import getPackagedFilesToPrune from "./getPackagedFilesToPrune.js"
import { call } from "../throttle.js"
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * @typedef {Object} PruningParams The pruning parameters
 * @property {String} region The bucket's region
 * @property {String} bucket The bucket name
 * @property {Object<String, String>[]} [tagsFilters] A list of S3 objects tags
 * to filter on. An object will be considered if it matches any of the supplied
 * filter sets.
 * For instance, with tagsFilter = [{foo: "bar", boo: "bla"}, {foo: "baz"}]:
 *  - Object with tags {foo: "bar"} will not be considered
 *  - Object with tags {foo: "bar", boo: "bla"} will be considered
 *  - Object with tags {foo: "baz"} will be considered
 *  - Object with tags {foo: "baz", boo: "bla"} will be considered
 * @property {Array<String>} [exclude] A list of keys to keep
 * @property {Number} [pageSize=1000] The number of keys to return per page
 */

/**
 * Prune unused packaged files associated with stacks from their deployment
 * buckets
 * @param {import('../params/index.js').default[]} stacks The list of stack
 * parameters to prune
 */
export default async function prunePackagedFiles(stacks) {
  // Select the stacks which have files to prune
  tracker.setStatus(`retrieving files to prune`)

  // Resolve stacks parameters
  const _stacks = (await Promise.all(stacks.map((stack) => stack.resolve())))
    // Only consider stacks with a deployment bucket
    .filter(({ deployBucket }) => Boolean(deployBucket))
    // Remove potential duplicates and format as a map
    .reduce((res, stack) => {
      // Keep only the first occurrence in case of duplicates
      if (!Object.keys(res).includes(stack.id)) res[stack.id] = stack
      return res
    }, {})

  // Group stacks that should be pruned (all except those flagged not to) by
  // their region / deployment bucket
  const stacksToPrune = Object.entries(_stacks).reduce(
    (grouped, [id, stack]) => {
      const { region, deployBucket, noPrune } = stack
      if (noPrune) return grouped // Exclude stacks flagged not to be pruned
      // Initialize the region's entry if needed
      if (!Object.keys(grouped).includes(region)) grouped[region] = {}
      // Initialize the bucket's entry if needed
      if (!Object.keys(grouped[region]).includes(deployBucket))
        grouped[region][deployBucket] = {}
      // Add the current stack to the region / bucket group
      grouped[region][deployBucket][id] = stack
      return grouped
    },
    {}
  )

  // If there are no stacks to prune, don't proceed further
  if (
    Object.values(stacksToPrune).reduce(
      (perRegionCount, buckets) =>
        perRegionCount +
        Object.values(buckets).reduce(
          (perBucketCount, stacks) =>
            perBucketCount + Object.keys(stacks).length,
          0
        ),
      0
    ) === 0
  )
    return

  // Retrieve the list of packaged files still in use by any of the stacks.
  // These files will be excluded from pruning for all stacks. We build an
  // exhaustive list (including stacks that shouldn't be pruned) to reduce the
  // number of files to check, otherwise we'd be retrieving the tags for each
  // which can get very slow)
  const filesInUse = await getPackagedFilesInUse(Object.values(_stacks))

  // Retrieve the region, bucket and list of files to prune for each stack
  const prunableStacks = await getPackagedFilesToPrune(
    stacksToPrune,
    filesInUse
  )
  if (Object.keys(prunableStacks).length === 0) {
    tracker.interruptInfo("No files to prune")
    return
  }

  // Auto-confirm stacks with the forceDelete flag and mark the others as
  // needing confirmation
  const stackIdsToPrune = []
  const stackIdsToConfirm = []
  Object.values(prunableStacks).forEach((buckets) =>
    Object.values(buckets).forEach((stacks) =>
      Object.keys(stacks).forEach((id) => {
        if (_stacks[id].forceDelete) stackIdsToPrune.push(id)
        else stackIdsToConfirm.push(id)
      })
    )
  )
  if (stackIdsToConfirm.length > 0) {
    // Ask for user confirmation if needed
    const { confirmedIds } = await tracker.prompt({
      type: "multiselect",
      name: "confirmedIds",
      message: "Select stacks for which to prune deployment files",
      choices: stackIdsToConfirm.map((id) => ({
        name: `${_stacks[id].stackName} (${
          prunableStacks[_stacks[id].region][_stacks[id].deployBucket][id]
            .length
        } files)`,
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
    const prunedKeysCount = await pruneFiles(prunableStacks, stackIdsToPrune)
    // Display the number of pruned files
    tracker[prunedKeysCount ? "interruptSuccess" : "interruptInfo"](
      `${prunedKeysCount ? prunedKeysCount : "No"} unused files pruned`
    )
  }
}

/**
 * Delete the supplied files
 * @param {Object<String, Object<String, Object<String, import('./listBucket.js').S3Object[]>>>} prunableStacks
 * The list of S3 objects to prune, mapped to the region / bucket / stack they
 * belong to
 * @param {String[]} stackIdsToPrune The ids of the stacks to prune
 * @return {Promise<Number>} The number of deleted keys
 */
async function pruneFiles(prunableStacks, stackIdsToPrune) {
  const countPerRegion = await Promise.all(
    Object.entries(prunableStacks).map(async ([region, buckets]) => {
      const s3 = new S3Client({
        apiVersion: "2006-03-01",
        region,
        credentialDefaultProvider,
      })
      const prunedObjects = await Promise.all(
        Object.entries(buckets).map(async ([bucket, stacks]) => {
          // Assemble the list of files to exclude: those associated with
          // stacks which have not been confirmed
          const keysToExclude = Object.entries(stacks)
            .filter(([id]) => !stackIdsToPrune.includes(id))
            .map(([, prunableFiles]) => prunableFiles)
            .flat()
            .map(({ key }) => key)
          // Assemble the list of files to prune: those associated with stacks
          // which have been confirmed, but not excluded (some files may be
          // used by multiple stacks)
          const objectsToPrune = Object.entries(stacks)
            .filter(([id]) => stackIdsToPrune.includes(id))
            .map(([, prunableFiles]) => prunableFiles)
            .flat()
            .filter(({ key }) => !keysToExclude.includes(key))
          // Prune the files (DeleteObjects supports 1000 keys max per request)
          await Promise.all(
            split(objectsToPrune, 1000).map((batch) =>
              call(
                s3,
                s3.send,
                new DeleteObjectsCommand({
                  Bucket: bucket,
                  Delete: {
                    Objects: batch.map(({ key, versionId }) => ({
                      Key: key,
                      VersionId: versionId,
                    })),
                  },
                })
              )
            )
          )
          // Return the list of pruned objects in the bucket
          return objectsToPrune
        })
      )
      // Return the count of pruned objects in the region
      return prunedObjects.reduce((count, objects) => count + objects.length, 0)
    })
  )
  // Return the count of pruned objects across regions
  return countPerRegion.reduce(
    (count, countPerBucket) => count + countPerBucket,
    0
  )
}

/**
 * Split an array into chunks of a given size
 * @param {Array} arr The array to split
 * @param {Number} chunkSize The max number of items in each chunk
 * @return {Array<Array>} The chunks
 */
function split(arr, chunkSize) {
  return Array(Math.ceil(arr.length / chunkSize))
    .fill()
    .map((_, index) => index * chunkSize)
    .map((begin) => arr.slice(begin, begin + chunkSize))
}
