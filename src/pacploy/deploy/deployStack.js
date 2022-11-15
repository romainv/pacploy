import tracker from "../tracker.js"
import sync from "../sync/index.js"
import pkg from "../pkg/index.js"
import createChangeSet from "./createChangeSet.js"
import waitForStatus from "../waitForStatus/index.js"
import resolveParams from "../params/index.js"
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
 * @param {import('../params/index.js').StackParams} stack The parameters of
 * the stack to deploy
 * @return {Promise<Boolean>} Whether the deployment was successful
 */
export default async function deployStack(stack) {
  let deployStarted = false // Will turn true once the deployment started
  try {
    // Resolve stack parameters
    const resolved = await resolveParams(stack)
    const { region, stackName, syncPath } = resolved

    // Package and upload template to S3
    const [templateURL] = await pkg(resolved, { quiet: true })

    // Create root change set
    const { changeSetArn, hasChanges } = await createChangeSet(
      { ...resolved, templatePath: templateURL },
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
      deployStarted = true
      const deployStatus = await waitForStatus({
        region,
        arn: stackName,
        success: deploySuccessStatuses,
        failure: deployFailedStatuses,
        msg: "",
      })
      if (typeof deployStatus !== "string") {
        // If deployment succeeded
        tracker.interruptSuccess(`Deployed stack ${stackName}`)
      } else {
        // If deployment failed
        throw new Error(deployStatus)
      }
    }

    // Sync deployed infra if needed
    if (syncPath) await sync(resolved, { quiet: true })

    // Indicate the deployment was successful
    return true
  } catch (err) {
    if (deployStarted)
      await errors({ region: stack.region, stackName: stack.stackName })
    else
      tracker.interruptError(
        `Failed to deploy stack ${stack.stackName}: ${err}`
      )
    process.exitCode = 1
    return false
  }
}
