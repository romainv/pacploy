import packageFileToS3 from "./packageFileToS3.js"
import packageFileToECR from "./packageFileToECR.js"
import packageFileInline from "./packageFileInline.js"

/**
 * Package a local file to S3 if necessary
 * @param {Object} params Function parameters: see dedicated functions
 * @param {import('./File.js').default} params.file The file to package
 * @param {String} params.region The bucket's region
 * @param {String} params.deployBucket A S3 bucket name to package resources
 * @param {String} params.deployEcr An ECR repo URI to package docker images
 * @param {Object} params.dependencies The list of packaged files that the
 * current file depends on
 * @param {Object} [params.stackTags] The tags to apply
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * file even if it was not updated since last upload
 * @return {Promise<Object>} The location of the file and upload status
 */
export default async function packageFile({
  file,
  region,
  deployBucket,
  deployEcr,
  dependencies,
  forceUpload,
  stackTags,
}) {
  if (file.packageTo === "S3")
    return await packageFileToS3(file, {
      region,
      deployBucket,
      dependencies,
      forceUpload,
      stackTags,
    })
  else if (file.packageTo === "ECR")
    return await packageFileToECR(file, { region, deployEcr, forceUpload })
  else if (file.packageTo === "INLINE")
    return await packageFileInline(file, { forceUpload })
  // If packageTo was not recognized
  throw new Error(
    `Unable to determine where file '${file.path}' should be packaged` +
      ` (value '${file.packageTo}' not recognized)`,
  )
}
