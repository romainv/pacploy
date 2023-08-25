import listBucket from "./listBucket.js"

/**
 * Retrieve the list of files to prune across stacks
 * @param {Object<String, Object<String, Object<String, import('../params/index.js').ResolvedStackParams>>>} stacksToPrune
 * The list of stacks to prune grouped by region / bucket / id
 * @param {Object<String, Object<String, String[]>>} exclude A list of object
 * keys to exclude from the pruning, grouped by region / bucket
 * @return {Promise<Object<String, Object<String, Object<String, import('./listBucket.js').S3Object[]>>>>}
 * The list of S3 objects to prune, mapped to the region / bucket / stack they
 * belong to
 */
export default async function getPackagedFilesToPrune(stacksToPrune, exclude) {
  // List the files to prune in each region / bucket / stack
  return Object.assign(
    {},
    ...(await Promise.all(
      Object.entries(stacksToPrune).map(async ([region, buckets]) => {
        // List the files to prune in each region
        const filesToPruneInRegion = Object.assign(
          {},
          ...(await Promise.all(
            Object.entries(buckets).map(async ([bucket, stacks]) => {
              // List the files to prune in each bucket, grouped by stack
              const filesToPruneInBucket = await getFilesToPruneInBucket(
                region,
                bucket,
                stacks,
                (exclude[region] || {})[bucket],
              )
              if (Object.keys(filesToPruneInBucket).length > 0)
                // If there are any files to prune in the bucket
                return { [bucket]: filesToPruneInBucket }
            }),
          )),
        )
        if (Object.keys(filesToPruneInRegion).length > 0)
          // If there are any files to prune in the region
          return { [region]: filesToPruneInRegion }
      }),
    )),
  )
}

/**
 * Retrieve the list of files to prune for the supplied set of stacks in the
 * same region
 * @param {String} region The bucket and stacks region
 * @param {String} bucket The bucket name
 * @param {Object<String, import('../params/index.js').ResolvedStackParams>} stacks
 * The list of stacks to prune
 * @param {String[]} exclude A list of object keys to exclude from pruning
 * @return {Promise<Object<String, import('./listBucket.js').S3Object[]>>} The
 * files to prune, mapped to the stack(s) they belong to
 */
async function getFilesToPruneInBucket(region, bucket, stacks, exclude) {
  // Retrieve the list of files to prune in the current region/bucket
  let nextVersionIdMarker, nextKeyMarker
  let filesToPruneInBucket = []
  do {
    let objects
    ;[objects, nextVersionIdMarker, nextKeyMarker] = await listBucket(
      {
        region,
        bucket,
        // Only consider files pertaining to one of the stacks using
        // the bucket
        tagsFilters: Object.values(stacks).map(({ stackName }) => ({
          RootStackName: stackName,
        })),
        // Exclude files packaged to the bucket which are still in use
        exclude,
      },
      nextVersionIdMarker,
      nextKeyMarker,
    )
    filesToPruneInBucket = filesToPruneInBucket.concat(objects)
  } while (nextVersionIdMarker || nextKeyMarker)

  // Map the files to the stack(s) they pertain to
  return filesToPruneInBucket.reduce((perStack, { tags, ...object }) => {
    // Retrieve the list of stacks to which the file belongs (exclude empty
    // values that may have ended up in the file's tags)
    const stackNames =
      typeof tags === "object" ? tags.RootStackName.filter(Boolean) || [] : []
    for (const stackName of stackNames) {
      // Generate the stack's id in the expected format
      const id = `${region}|${stackName}`
      // Initialize the stack's entry if needed
      if (!Object.keys(perStack).includes(id)) perStack[id] = []
      // Map the file to prune to the stack
      perStack[id].push(object)
    }
    return perStack
  }, {})
}
