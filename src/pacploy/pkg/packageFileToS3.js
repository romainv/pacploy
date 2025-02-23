import { call } from "../throttle.js"
import { createReadStream, writeSync } from "fs"
import { extname, join } from "path"
import updateTemplate from "./updateTemplate.js"
import zip from "../zip/index.js"
import isDir from "./isDir.js"
import hashContents from "./hashContents.js"
import tmp from "tmp"
import {
  S3Client,
  PutObjectTaggingCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import credentialDefaultProvider from "../credentialDefaultProvider.js"
// The character used to delimitate multiple values in a tag
import { getTags, tagDelimiter } from "../cleanup/listBucket.js"

/**
 * Package a local file to S3 if necessary
 * @param {import('./File.js').default} file The file to package
 * @param {Object} params Additional function parameters
 * @param {String} params.region The bucket's region
 * @param {String} params.deployBucket A S3 bucket name to package resources
 * @param {Object} params.dependencies The list of packaged files that the
 * current file depends on
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * file even if it was not updated since last upload
 * @param {Object} [params.stackTags] The stack tags to be applied to packaged
 * files as well
 * @return {Promise<Object>} The S3 file URI and upload status
 */
export default async function packageFileToS3(
  file,
  { region, deployBucket, dependencies, forceUpload = false, stackTags = {} },
) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })
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
    file.path = await zip({
      zipTo: `${tmp.tmpNameSync()}.zip`,
      dir: file.path,
      bundleDir:
        file.resourceType === "AWS::Lambda::LayerVersion"
          ? join("nodejs", "node_modules")
          : "node_modules",
    })
  content = createReadStream(file.path) // This returns a Stream
  hash = await hashContents(file.path)

  // Check if object needs to be uploaded (checks if a key with the same
  // content hash already exists)
  const key = `${hash}${extname(file.path)}`
  let status,
    exists = false
  try {
    await call(
      s3,
      s3.send,
      new HeadObjectCommand({ Bucket: deployBucket, Key: key }),
    )
    exists = true
    status = "exists"
  } catch (err) {
    // Throw unexpected errors
    if (err.$metadata?.httpStatusCode !== 404) throw err
  }

  if (forceUpload || !exists) {
    // If object doesn't exist yet, or upload was forced: upload it
    await new Upload({
      client: s3,
      params: { Bucket: deployBucket, Key: key, Body: content },
    }).done()
    status = !exists ? "updated" : "forced"
  }

  // Apply stack tags
  await updateTags(stackTags, region, deployBucket, key)

  // Return the S3 location
  const regionPrefix = region === "us-east-1" ? "s3" : `s3-${region}`
  return {
    location: `https://${regionPrefix}.amazonaws.com/${deployBucket}/${key}`,
    status,
    hash,
  }
}

/**
 * Update the uploaded file's tags
 * @param {Object} stackTags The stacks to apply
 * @param {String} region The bucket's region
 * @param {String} bucket The file's bucket
 * @param {String} key The file's key
 */
async function updateTags(stackTags, region, bucket, key) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })

  // Retrieve existing tags if any, and deserialize them
  const existingTags = await getTags(region, bucket, key)

  // Merge values in case multiple stacks use the same file
  const allKeys = Array.from(
    new Set(Object.keys(existingTags).concat(Object.keys(stackTags))),
  )
  const tagsToApply = allKeys.reduce((merged, key) => {
    const existing = existingTags[key] || []
    const updated = stackTags[key] ? [stackTags[key]] : []
    merged[key] = Array.from(new Set(existing.concat(updated))).join(
      tagDelimiter,
    )
    return merged
  }, {})

  // Apply tags to file
  await call(
    s3,
    s3.send,
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: {
        TagSet: Object.entries(tagsToApply).map(([Key, Value]) => ({
          Key,
          Value,
        })),
      },
    }),
  )
}
