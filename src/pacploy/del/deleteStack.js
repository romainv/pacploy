import { call } from "../throttle.js"
import {
  deleteSuccess as deleteSuccessStatuses,
  deleteFailed as deleteFailedStatuses,
} from "../statuses.js"
import waitForStatus from "../waitForStatus/index.js"
import {
  CloudFormationClient,
  DescribeStacksCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Delete an existing stack (not its retained resources)
 * @param {Object} stack The stack parameters
 * @param {String} stack.region The stack's region
 * @param {String} stack.stackName The name of the deployed stack
 * @return {Promise<Boolean|String>} True if the stack was deleted, otherwise
 * the status reason for the failure
 */
export default async function deleteStack({ region, stackName }) {
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  // Retrieving stackId to identify the stack after it's been deleted
  const { Stacks: [{ StackId: stackId } = { StackId: undefined }] = [] } =
    await call(cf, cf.send, new DescribeStacksCommand({ StackName: stackName }))
  // Attempt to delete the stack
  await call(cf, cf.send, new DeleteStackCommand({ StackName: stackId }))
  return await waitForStatus({
    region,
    arn: stackId,
    success: deleteSuccessStatuses,
    failure: deleteFailedStatuses,
    msg: "",
  })
}
