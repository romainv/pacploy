const withTracker = require("../../with-tracker")
const { S3 } = require("../../aws-sdk-proxy")

/**
 * Delete all objects inside a versioned S3 bucket
 * @param {Object} params The function parameters
 * @param {String} params.region The bucket's region
 * @param {String} params.bucket The bucket name
 * @param {Array<String>} [params.exclude] A list of keys to keep
 * @return {Array} The list of deleted change set ids
 */
async function emptyBucket({ region, bucket, exclude = [] }) {
  const s3 = new S3({ apiVersion: "2006-03-01", region })
  for (const objectType of ["Versions", "DeleteMarkers"]) {
    // Remove object versions first, then delete markers
    let nextToken
    do {
      // Retrieve object versions
      let objects
      ;({
        [objectType]: objects,
        [objectType === "Versions" ? "NextVersionIdMarker" : "NextKeyMarker"]:
          nextToken,
      } = await s3.listObjectVersions({
        Bucket: bucket,
        MaxKeys: 1000, // Maximum objects to return on each page
        [objectType === "Versions" ? "VersionIdMarker" : "KeyMarker"]:
          nextToken,
      }))
      // Filter out keys that were excluded and format as expected
      objects = objects
        .map(({ Key, VersionId }) => ({ Key, VersionId }))
        .filter(({ Key }) => !exclude.includes(Key))
      if (objects.length > 0) {
        await s3.deleteObjects({
          Bucket: bucket,
          Delete: { Objects: objects },
        })
      }
    } while (nextToken)
  }
}

module.exports = withTracker()(emptyBucket)
