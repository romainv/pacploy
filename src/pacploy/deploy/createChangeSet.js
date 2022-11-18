import tracker from "../tracker.js"
import { call } from "../throttle.js"
import {
  createSuccess as createSuccessStatuses,
  createFailed as createFailedStatuses,
} from "../statuses.js"
import getChangeSetArgs from "./getChangeSetArgs.js"
import waitForStatus from "../waitForStatus/index.js"
import deleteChangeSets from "./deleteChangeSets.js"
import {
  CloudFormationClient,
  CreateChangeSetCommand,
} from "@aws-sdk/client-cloudformation"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Create a change set for the supplied stack
 * @param {import('../params/index.js').ResolvedStackParams} stack The stack
 * parameters
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet] Whether to disable outputs
 * @param {Number} [params.attempts=0] Keep track of attempts to avoid infinite
 * recursions
 * @return {Promise<Object>} The arn of the change set and whether it contains
 * any changes
 */
export default async function createChangeSet(
  stack,
  { quiet = false, attempts = 0 }
) {
  const { region, stackName } = stack
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  if (!quiet) tracker.setStatus("creating change set")
  // Retrieve creation arguments
  const args = await getChangeSetArgs(stack)
  // Create the requested change set
  let changeSetArn
  try {
    ;({ Id: changeSetArn } = await call(
      cf,
      cf.send,
      new CreateChangeSetCommand(args)
    ))
  } catch (err) {
    if (
      err.code === "LimitExceededException" &&
      err.message.startsWith("ChangeSet limit exceeded")
    ) {
      // If we reach the limit of change sets allowed for the current stack
      tracker.interruptWarn(err.message)
      // Delete change sets
      await deleteChangeSets({ region, stackName })
      // Try again if less than 3 attempts
      if (attempts < 3)
        return createChangeSet(stack, { quiet, attempts: attempts + 1 })
      else throw err // Fail if too many attempts
    } else throw err // Unrecognized error
  }
  // Wait for the change set to be created
  const res = await waitForStatus({
    region,
    arn: changeSetArn,
    success: createSuccessStatuses,
    failure: createFailedStatuses,
    msg: "",
  })
  let hasChanges = true // Indicate whether the stack has any changes
  if (res !== true) {
    // If status is not successful
    if (
      typeof res === "string" &&
      (res.includes("The submitted information didn't contain changes") ||
        res.includes("No updates are to be performed."))
    ) {
      tracker.interruptInfo(`Stack ${stackName} is already up-to-date`)
      hasChanges = false
      // Failure is expected if there are no changes
    } else {
      // If an actual error occured
      tracker.interruptError(`Failed to create change set for ${stackName}`)
      throw new Error(res || "")
    }
  }
  return { changeSetArn, hasChanges }
}
