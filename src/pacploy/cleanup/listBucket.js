import {
  S3Client,
  GetObjectTaggingCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3"
import { call } from "../throttle.js"

/**
 * List the objects of a bucket with pagination
 * @param {import('./prunePackagedFiles.js').PruningParams} params The pruning
 * parameters
 * @param {String} [versionIdMarker] The versionIdMarker from which to resume
 * listing
 * @param {String} [keyMarker] The keyMarker from which to resume listing
 * @return {Promise<[{Key: String, VersionId: String}[], String, String]>} The
 * list of matching key/versionId and the markers to use for the next page
 */
export default async function listBucket(
  { region, bucket, tagsFilter, exclude = [], pageSize = 1000 },
  versionIdMarker,
  keyMarker
) {
  const s3 = new S3Client({ apiVersion: "2006-03-01", region })

  // Retrieve object versions
  const {
    Versions: versionObjects = [],
    DeleteMarkers: deleteMarkerObjects = [],
    NextVersionIdMarker: nextVersionIdMarker,
    NextKeyMarker: nextKeyMarker,
  } = await call(
    s3,
    s3.send,
    new ListObjectVersionsCommand({
      Bucket: bucket,
      MaxKeys: pageSize,
      VersionIdMarker: versionIdMarker,
      KeyMarker: keyMarker,
    })
  )

  // Filter out keys that were excluded and format as expected
  let objects = versionObjects
    .concat(deleteMarkerObjects)
    .map(({ Key, VersionId }) => ({ Key, VersionId }))
    .filter(({ Key }) => !exclude.includes(Key))

  // Filter out objects by their tags, if a filter was specified
  if (tagsFilter && Object.keys(tagsFilter).length > 0) {
    // Retrieve the keys of objects whose tags match the supplied filter
    const filteredKeys = (
      await Promise.all(
        objects.map(async ({ Key }) => {
          // Retrieve the object's tags
          const tags = await getTags(region, bucket, Key)
          // Determine if the object tags match those in the filter
          const isFiltered = Object.entries(tagsFilter).reduce(
            (res, [key, value]) => res && (tags[key] || []).includes(value),
            true
          )
          // Include the object if tags match
          if (isFiltered) return Key
        })
      )
    ).filter(Boolean)
    // Remove the objects which don't match the tags filters
    objects = objects.filter(({ Key }) => filteredKeys.includes(Key))
  }

  return [objects, nextVersionIdMarker, nextKeyMarker]
}

/**
 * Get an object's tags in a deserialized format
 * @param {String} region The bucket's region
 * @param {String} bucket The bucket
 * @param {String} key The object's key
 * @return {Promise<Object<String, String[]>>} The object's tags
 */
async function getTags(region, bucket, key) {
  const s3 = new S3Client({ apiVersion: "2006-03-01", region })
  const { TagSet } = await call(
    s3,
    s3.send,
    new GetObjectTaggingCommand({ Bucket: bucket, Key: key })
  )
  // De-serialize the TagSet
  return TagSet.reduce((tags, { Key, Value }) => {
    tags[Key] = Value.split(":") // Handle multiple comma-separated values
    return tags
  }, {})
}
