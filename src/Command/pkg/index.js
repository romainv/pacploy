import getFilesToPackage from "./getFilesToPackage.js"
import withTracker from "../../with-tracker/index.js"
import packageFiles from "./packageFiles.js"
import zip from "../zip/index.js"
import tmp from "tmp"
import { writeSync } from "fs"

/**
 * Package a template and its local resources to S3 for deployment
 * This aims to be equivalent to the 'aws cloudformation package' command of
 * AWS CLI, which doesn't exist in AWS JS SDK
 * @param {Object} params Additional function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.templatePath The path to the template to package
 * @param {String} [params.deployBucket] A S3 bucket name to package resources
 * @param {String} [params.deployEcr] An ECR repo URI to package docker images
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * @param {String} [params.zipTo] If provided, will also zip the transformed
 * provided template to a local destination, besides uploading it to S3
 * resources even if they were not updated since last upload
 * @param {Object} [params.stackParameters] If zipTo is set, the stack
 * parameters will be added to the zip file in the format expected by AWS
 * @param {Object} [params.stackTags] If zipTo is set, the stack tags will be
 * added to the zip file in the format expected by AWS
 * @return {String} The URL of the packaged template
 */
async function pkg({
  region,
  templatePath,
  deployBucket,
  deployEcr,
  forceUpload = false,
  zipTo,
  stackParameters = {},
  stackTags = {},
}) {
  // Collect the files that need to be packaged and their dependencies
  this.tracker.setStatus("retrieving files to package")
  const toPackage = getFilesToPackage(templatePath)
  let packagedTemplatePath = templatePath // Will point to the packaged template
  let packagedFiles // Will contain packaged files info, if any
  if (Object.keys(toPackage).length > 0) {
    // If there are any files to package
    this.tracker.setStatus(`packaging ${Object.keys(toPackage).length} files`)
    // Package local files if they have been updated since last upload
    packagedFiles = await packageFiles.call(this, {
      region,
      toPackage,
      deployBucket,
      deployEcr,
      forceUpload,
      stackTags,
    })
    if (Object.keys(packagedFiles).length === 0)
      throw new Error(
        `Expected to package ${
          Object.keys(toPackage).length
        } files, but none were uploaded`
      )
    else {
      const newCount = Object.values(packagedFiles).filter(
        ({ status }) => status !== "exists"
      ).length
      const totalCount = Object.keys(packagedFiles).length
      if (newCount > 0)
        this.tracker.interruptSuccess(
          `${newCount} new files packaged (${totalCount} in total)`
        )
      else
        this.tracker.interruptInfo(
          `No new files to package (${totalCount} in total)`
        )
    }
    // Point to the packaged template, if anything was updated
    packagedTemplatePath = packagedFiles[templatePath].location
  }
  if (zipTo) {
    // If we requested to zip the produced template
    const files = new Map()
    // Add the packaged template, referencing resources uploaded to S3
    files.set(
      // Select based on the original path as the template may have changed,
      // but use the latest to zip the transformed file
      packagedFiles ? packagedFiles[templatePath].path : templatePath,
      "template.yaml" // Standard name that matches CodePipeline config
    )
    // Add the template configuration
    const config = { Parameters: stackParameters, Tags: stackTags }
    const tmpFile = tmp.fileSync({ postfix: ".json" })
    // Save config
    writeSync(tmpFile.fd, JSON.stringify(config, null, 2))
    files.set(tmpFile.name, "config.json") // Filename matches CodePipeline
    // Build the zip archive
    await zip.call(this, { zipTo, files })
  }
  return packagedTemplatePath
}

export default withTracker()(pkg)
