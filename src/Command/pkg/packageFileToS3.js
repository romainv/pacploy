import withTracker from "../../with-tracker/index.js"
import { call } from "../../throttle.js"
import { createReadStream, writeSync } from "fs"
import { extname, join } from "path"
import updateTemplate from "./updateTemplate.js"
import zip from "../zip/index.js"
import isDir from "./isDir.js"
import md5 from "./md5.js"
import tmp from "tmp"
import {
  S3Client,
  PutObjectTaggingCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

/**
 * Package a local file to S3 if necessary
 * @param {File} file The file to package
 * @param {Object} params Additional function parameters
 * @param {String} params.region The bucket's region
 * @param {String} params.deployBucket A S3 bucket name to package resources
 * @param {Object} params.dependencies The list of packaged files that the
 * current file depends on
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * file even if it was not updated since last upload
 * @param {Object} [params.stackTags] The stack tags to be applied to packaged
 * files as well
 * @return {Object} The S3 file URI and upload status
 */
async function packageFileToS3(
  file,
  { region, deployBucket, dependencies, forceUpload = false, stackTags = {} }
) {
  const s3 = new S3Client({ apiVersion: "2006-03-01", region })
  // Retrieve content to upload and its md5 hash
  let content, hash
  if (
    file.resourceType === "AWS::CloudFormation::Stack" &&
    file.propName === "TemplateURL"
  ) {
    // If resource is a nested stack, recursively update it and save it to a
    // temporary file (we could just keep the returned string, but using a file
    // enables us to zip it in CodeBuild later)
    content = await updateTemplate(file.path, { dependencies })
    const tmpFile = tmp.fileSync({ postfix: ".yaml" })
    file.path = tmpFile.name // Point at the transformed file path
    writeSync(tmpFile.fd, content) // Save file content
  } else if (isDir(file.path))
    // If current file is a directory, zip it and point to the zip instead
    file.path = await zip.call(this, {
      zipTo: `${tmp.tmpNameSync()}.zip`,
      dir: file.path,
      bundleDir:
        file.resourceType === "AWS::Lambda::LayerVersion"
          ? join("nodejs", "node_modules")
          : "node_modules",
    })
  content = createReadStream(file.path) // This returns a Stream
  hash = await md5(file.path)
  // Check if object needs to be uploaded (checks if a key with the same
  // content hash already exists)
  const key = `${hash}${extname(file.path)}`
  let status,
    exists = false
  try {
    await call(
      s3.send,
      new HeadObjectCommand({ Bucket: deployBucket, Key: key })
    )
    exists = true
    status = "exists"
  } catch (err) {
    if (err.code !== "NotFound") throw err // Throw unexpected errors
  }
  if (forceUpload || !exists) {
    // If object doesn't exist yet, or upload was forced: upload it
    await new Upload({
      client: s3,
      params: { Bucket: deployBucket, Key: key, Body: content },
    }).done()
    status = !exists ? "updated" : "forced"
    // Apply tags to file
    await call(
      s3.send,
      new PutObjectTaggingCommand({
        Bucket: deployBucket,
        Key: key,
        Tagging: {
          TagSet: Object.entries(stackTags).map(([Key, Value]) => ({
            Key,
            Value,
          })),
        },
      })
    )
  }
  // Return the S3 location
  const regionPrefix = region === "us-east-1" ? "s3" : `s3-${region}`
  return {
    location: `https://${regionPrefix}.amazonaws.com/${deployBucket}/${key}`,
    status,
    hash,
  }
}

export default withTracker()(packageFileToS3)
