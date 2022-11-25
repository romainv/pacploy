import tracker from "../tracker.js"
import { call } from "../throttle.js"
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Retrieve the status of a stack
 * @param {Object} stack The stack parameters
 * @param {String} stack.region The stack's region
 * @param {String} stack.stackName The name of the deployed stack
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet=true] Whether to display stack status
 */
export default async function getStatus(
  { region, stackName },
  { quiet = true } = {}
) {
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  let status
  // Retrieve basic stack information, separating serialized values
  if (!quiet) tracker.setStatus("retrieving stack status")
  try {
    const { Stacks: [{ StackStatus }] = [] } = await call(
      cf,
      cf.send,
      new DescribeStacksCommand({ StackName: stackName })
    )
    status = StackStatus
  } catch (err) {
    // Capture case when stack doesn't exist as a specific status
    if (err.message.indexOf("does not exist") >= 0) status = "NEW"
    else throw err
  }
  if (!quiet)
    tracker.interruptInfo(`stack '${stackName}' is in status ${status}`)
  return status
}
