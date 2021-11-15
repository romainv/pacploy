import withTracker from "../../with-tracker/index.js"
import AWS from "../../aws-sdk-proxy/index.js"

/**
 * Delete all objects inside a versioned S3 bucket
 * @param {Object} params The function parameters
 * @param {String} params.region The bucket's region
 * @param {String} params.bucket The bucket name
 * @param {Object} [params.tagsFilter] S3 objects tags to filter which objects
 * to delete
 * @param {Array<String>} [params.exclude] A list of keys to keep
 * @return {Array} The list of deleted keys
 */
async function emptyBucket({ region, bucket, tagsFilter, exclude = [] }) {
  const s3 = new AWS.S3({ apiVersion: "2006-03-01", region })
  // Remove object versions first, then delete markers
  let nextVersionIdMarker,
    nextKeyMarker,
    deleted = [] // Will keep track of deleted keys
  do {
    // Retrieve object versions
    let versionObjects, deleteMarkerObjects
    ;({
      Versions: versionObjects,
      DeleteMarkers: deleteMarkerObjects,
      NextVersionIdMarker: nextVersionIdMarker,
      NextKeyMarker: nextKeyMarker,
    } = await s3.listObjectVersions({
      Bucket: bucket,
      MaxKeys: 1000, // Maximum objects to return on each page
      VersionIdMarker: nextVersionIdMarker,
      KeyMarker: nextKeyMarker,
    }))
    // Filter out keys that were excluded and format as expected
    let objects = versionObjects
      .concat(deleteMarkerObjects)
      .map(({ Key, VersionId }) => ({ Key, VersionId }))
      .filter(({ Key }) => !exclude.includes(Key))
    // Filter out objects by their tags, if a filter was specified
    if (tagsFilter && Object.keys(tagsFilter).length > 0) {
      // Retrieve the keys of objects whose tags match the supplied filter
      const filteredKeys = await Promise.all(
        objects.map(async ({ Key }) => {
          // Retrieve the object's tags
          const { TagSet } = await s3.getObjectTagging({
            Bucket: bucket,
            Key,
          })
          // De-serialize the TagSet
          const tags = TagSet.reduce((tags, { Key, Value }) => {
            tags[Key] = Value
            return tags
          }, {})
          // Determine if the object tags match those in the filter
          const isFiltered = Object.entries(tagsFilter).reduce(
            (res, [key, value]) => res && tags[key] === value,
            true
          )
          // Include the object if tags match
          if (isFiltered) return Key
        })
      )
      // Remove the objects who don't match the tags filters
      objects = objects.filter(({ Key }) => filteredKeys.includes(Key))
    }
    if (objects.length > 0) {
      await s3.deleteObjects({
        Bucket: bucket,
        Delete: { Objects: objects },
      })
      deleted = deleted.concat(objects.map(({ Key }) => Key))
    }
  } while (nextVersionIdMarker || nextKeyMarker)
  return deleted
}

export default withTracker()(emptyBucket)
