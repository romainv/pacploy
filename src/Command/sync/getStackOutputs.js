import { call } from "../throttle.js"
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Retrieve outputs of a deployed stack
 * @param {Object} params Function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @return {Promise<Object>} An object containing the stack information
 */
export default async function getStackInfo({ region, stackName }) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  // Retrieve stack outputs
  const { Stacks: [{ Outputs = [] }] = [] } = await call(
    cf,
    cf.send,
    new DescribeStacksCommand({ StackName: stackName })
  )
  // Serialize the output format
  return Outputs.reduce(
    (res, val) => Object.assign(res, { [val.OutputKey]: val.OutputValue }),
    {}
  )
}
