import withTracker from "../../with-tracker/index.js"
import AWS from "../../aws-sdk-proxy/index.js"

/**
 * Delete all objects inside a versioned S3 bucket
 * @param {Object} params The function parameters
 * @param {String} params.region The bucket's region
 * @param {String} params.bucket The bucket name
 * @param {Array<String>} [params.exclude] A list of keys to keep
 * @return {Array} The list of deleted change set ids
 */
async function emptyBucket({ region, bucket, exclude = [] }) {
  const s3 = new AWS.S3({ apiVersion: "2006-03-01", region })
  // Remove object versions first, then delete markers
  let nextVersionIdMarker, nextKeyMarker
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
    const objects = versionObjects
      .concat(deleteMarkerObjects)
      .map(({ Key, VersionId }) => ({ Key, VersionId }))
      .filter(({ Key }) => !exclude.includes(Key))
    if (objects.length > 0) {
      await s3.deleteObjects({
        Bucket: bucket,
        Delete: { Objects: objects },
      })
    }
  } while (nextVersionIdMarker || nextKeyMarker)
}

export default withTracker()(emptyBucket)
