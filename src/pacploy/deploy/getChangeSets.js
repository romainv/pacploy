import { call } from "../throttle.js"
import {
  CloudFormationClient,
  ListChangeSetsCommand,
} from "@aws-sdk/client-cloudformation"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Retrieve the change sets associated with a stack
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.nextToken] In case change sets are listed over
 * multiple pages
 * @param {Array} [params.changeSets] The full list of change sets accumulated
 * over multiple pages
 * @return {Promise<Array>} The list of change set summaries
 */
export default async function getChangeSets({
  region,
  stackName,
  nextToken,
  changeSets = [],
}) {
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  // Retrieve the next page of change sets
  const { Summaries = [], NextToken } = await call(
    cf,
    cf.send,
    new ListChangeSetsCommand({
      StackName: stackName,
      NextToken: nextToken,
    })
  )
  // Append the changes to the list
  changeSets = changeSets.concat(Summaries)
  // Update the next token
  return NextToken
    ? getChangeSets({
        region,
        stackName,
        nextToken: NextToken,
        changeSets,
      })
    : changeSets
}
