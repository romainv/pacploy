import { call } from "../throttle.js"
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3"
import listBucket from "./listBucket.js"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Delete all objects inside a versioned S3 bucket
 * @param {import('./prunePackagedFiles.js').PruningParams} params The pruning
 * parameters
 * @return {Promise<String[]>} The list of deleted keys
 */
export default async function emptyBucket({
  region,
  bucket,
  tagsFilters,
  exclude = [],
}) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })
  // Remove object versions first, then delete markers
  let nextVersionIdMarker,
    nextKeyMarker,
    deleted = [] // Will keep track of deleted keys
  do {
    // Retrieve object versions
    let objects
    ;[objects, nextVersionIdMarker, nextKeyMarker] = await listBucket(
      {
        region,
        bucket,
        // Set the maximum number of objects to return on each page to the max
        // that can be deleted in a single API call
        pageSize: 1000,
        tagsFilters,
        exclude,
      },
      nextVersionIdMarker,
      nextKeyMarker
    )
    // Delete the object versions
    if (objects.length > 0) {
      await call(
        s3,
        s3.send,
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map(({ key, versionId }) => ({
              Key: key,
              VersionId: versionId,
            })),
          },
        })
      )
      deleted = deleted.concat(objects.map(({ key }) => key))
    }
  } while (nextVersionIdMarker || nextKeyMarker)
  return deleted
}
