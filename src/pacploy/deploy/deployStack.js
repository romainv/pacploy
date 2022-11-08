import tracker from "../tracker.js"
import sync from "../sync/index.js"
import pkg from "../pkg/index.js"
import createChangeSet from "../createChangeSet/index.js"
import waitForStatus from "../waitForStatus/index.js"
import resolveArgs from "../resolveArgs/index.js"
import {
  CloudFormationClient,
  ExecuteChangeSetCommand,
} from "@aws-sdk/client-cloudformation"
import { call } from "../throttle.js"
import {
  deploySuccess as deploySuccessStatuses,
  deployFailed as deployFailedStatuses,
} from "../statuses.js"
import errors from "../errors/index.js"

/**
 * Deploy a single stack
 * @param {import('./index.js').StackParam} stack The parameters of the stack
 * to deploy
 * @return {Promise<Boolean>} Whether the deployment was successful
 */
export default async function deployStack({
  region,
  stackName,
  stackStatus,
  dependsOn = [],
  templatePath,
  deployBucket,
  deployEcr,
  stackParameters,
  stackTags,
  forceUpload,
  syncPath,
}) {
  // Resolve stack parameters
  ;({ stackParameters, deployBucket, deployEcr } = await resolveArgs({
    stackParameters,
    deployBucket,
    deployEcr,
    dependsOn,
  }))

  // Package and upload template to S3
  const [templateURL] = await pkg(
    {
      region,
      templatePath,
      deployBucket,
      deployEcr,
      forceUpload,
    },
    { quiet: true }
  )

  // Create root change set
  const { changeSetArn, hasChanges } = await createChangeSet(
    {
      region,
      templatePath: templateURL,
      stackName,
      stackStatus,
      stackParameters,
      stackTags,
    },
    { quiet: true }
  )
  if (hasChanges) {
    const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
    // If stack has changes to execute, deploy them
    await call(
      cf,
      cf.send,
      new ExecuteChangeSetCommand({ ChangeSetName: changeSetArn })
    )
    const deployStatus = await waitForStatus({
      region,
      arn: stackName,
      success: deploySuccessStatuses,
      failure: deployFailedStatuses,
      msg: "",
    })
    if (deployStatus === true) {
      // If deployment succeeded
      tracker.interruptSuccess(`Deployed stack ${stackName}`)
    } else {
      // If deployment failed
      tracker.interruptError(`Failed to deploy stack ${stackName}`)
      await errors({ region, stackName })
      process.exitCode = 1
      return false
    }
  }

  // Sync deployed infra if needed
  if (syncPath) await sync({ region, stackName, syncPath }, { quiet: true })

  // Indicate the deployment was successful
  return true
}
