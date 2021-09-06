import withTracker from "../../with-tracker/index.js"
import errors from "../errors/index.js"
import {
  deploySuccess as deploySuccessStatuses,
  deployFailed as deployFailedStatuses,
} from "../statuses.js"
import prepare from "./prepare.js"
import validate from "./validate.js"
import sync from "../sync/index.js"
import pkg from "../pkg/index.js"
import createChangeSet from "../createChangeSet/index.js"
import waitForStatus from "../waitForStatus/index.js"
import getStackOutputs from "../sync/getStackOutputs.js"
import AWS from "../../aws-sdk-proxy/index.js"

/**
 * Check the status of a stack
 * @param {Object} params The function parameters
 * @param {String} params.region The region where to deploy
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.deployBucket] A S3 bucket name to package resources
 * @param {String} [params.deployEcr] An ECR repo URI to package docker images
 * @param {String} params.templatePath Path to the source template
 * @param {Object} [params.stackParameters] The stack parameters
 * @param {Object} [params.stackTags] The tags to apply to the stack
 * @param {Boolean} [params.forceDelete=false] If true, will delete the
 * existing stack before deploying the new one
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * resources even if they were not updated since last upload
 * @param {String} [params.syncPath] If provided, will sync the deployed infra
 * locally
 */
async function deploy({
  region,
  stackName,
  deployBucket,
  deployEcr,
  templatePath,
  stackParameters = {},
  stackTags = {},
  forceDelete = false,
  forceUpload = false,
  syncPath,
}) {
  const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", region })
  // Validate template
  if ((await validate.call(this, { region, templatePath })) !== true) {
    process.exitCode = 1
    return
  }
  // Prepare stack for deployment
  const stackStatus = await prepare.call(this, {
    region,
    stackName,
    forceDelete,
  })
  // Package and upload template to S3
  const templateURL = await pkg.call(this, {
    region,
    templatePath,
    deployBucket,
    deployEcr,
    forceUpload,
  })
  // Create root change set
  const { changeSetArn, hasChanges } = await createChangeSet.call(this, {
    region,
    templatePath: templateURL,
    stackName,
    stackStatus,
    stackParameters,
    stackTags,
  })
  if (hasChanges) {
    // If stack has changes to execute, deploy them
    await cf.executeChangeSet({ ChangeSetName: changeSetArn })
    const deployStatus = await waitForStatus.call(this, {
      region,
      arn: stackName,
      success: deploySuccessStatuses,
      failure: deployFailedStatuses,
      msg: "deploying",
    })
    if (deployStatus === true) {
      // If deployment succeeded
      this.tracker.interruptSuccess(`Successfully deployed stack ${stackName}`)
    } else {
      // If deployment failed
      this.tracker.interruptError(`Failed to deploy stack ${stackName}`)
      await errors.call(this, { region, stackName })
      process.exitCode = 1
      return false
    }
  }
  // Sync deployed infra if needed
  if (syncPath) {
    const outputs = await sync.call(this, { region, stackName, syncPath })
    return outputs
  } else {
    const outputs = await getStackOutputs.call(this, { region, stackName })
    return outputs
  }
}

export default withTracker()(deploy)
