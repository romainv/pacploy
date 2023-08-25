import {
  S3Client,
  GetObjectTaggingCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3"
import { call } from "../throttle.js"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

// The character used to delimitate multiple values in a tag
export const tagDelimiter = ":"

/**
 * @typedef {Object} S3Object An S3 object
 * @property {String} key The object's key
 * @property {String} versionId The object's version id
 * @property {Object<String, String[]>} [tags] The object's tags (provided only
 * if tags filters were applied). Values are split using the configured
 * delimiter
 */

/**
 * List the objects of a bucket with pagination
 * @param {import('./prunePackagedFiles.js').PruningParams} params The pruning
 * parameters
 * @param {String} [versionIdMarker] The versionIdMarker from which to resume
 * listing
 * @param {String} [keyMarker] The keyMarker from which to resume listing
 * @return {Promise<[S3Object[], String, String]>} The list of matching objects
 * and the markers to use for the next page
 */
export default async function listBucket(
  { region, bucket, tagsFilters, exclude = [], pageSize = 1000 },
  versionIdMarker,
  keyMarker,
) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })

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
    }),
  )

  // Filter out keys that were excluded and format as expected
  let objects = versionObjects
    .concat(deleteMarkerObjects)
    .filter(({ Key }) => !exclude.includes(Key))
    .map(({ Key: key, VersionId: versionId }) => ({ key, versionId }))

  if (Array.isArray(tagsFilters) && tagsFilters.length > 0)
    // If tags filters were specified
    objects = (
      await Promise.all(
        objects.map(async (object) => {
          // Retrieve the object's tags
          const tags = await getTags(region, bucket, object.key)
          // Check if the object's tags match any of the supplied filter set
          for (const tagsFilter of tagsFilters)
            if (
              Object.entries(tagsFilter).reduce(
                (isMatch, [tagName, tagValue]) =>
                  isMatch && (tags[tagName] || []).includes(tagValue),
                true,
              )
            )
              // If the tags match the current set, include the object
              return { ...object, tags }
        }),
      )
    ).filter(Boolean) // Remove filtered-out objects

  return [objects, nextVersionIdMarker, nextKeyMarker]
}

/**
 * Get an object's tags in a deserialized format
 * @param {String} region The bucket's region
 * @param {String} bucket The bucket
 * @param {String} key The object's key
 * @return {Promise<Object<String, String[]>>} The object's tags
 */
export async function getTags(region, bucket, key) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })
  const { TagSet } = await call(
    s3,
    s3.send,
    new GetObjectTaggingCommand({ Bucket: bucket, Key: key }),
  )
  // De-serialize the TagSet
  return TagSet.reduce((tags, { Key, Value }) => {
    tags[Key] = Value.split(tagDelimiter) // Handle multiple values
    return tags
  }, {})
}
