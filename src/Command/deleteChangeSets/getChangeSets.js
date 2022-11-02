import withTracker from "../../with-tracker/index.js"
import { call } from "../../throttle.js"
import {
  CloudFormationClient,
  ListChangeSetsCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Retrieve the change sets associated with a stack
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} params.nextToken In case change sets are listed over
 * multiple pages
 * @param {Array} [params.changeSets] The full list of change sets accumulated
 * over multiple pages
 * @return {Array} The list of change set summaries
 */
async function getChangeSets({
  region,
  stackName,
  nextToken,
  changeSets = [],
}) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  // Retrieve the next page of change sets
  const { Summaries, NextToken } = await call(
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
    ? getChangeSets.call(this, {
        region,
        stackName,
        nextToken: NextToken,
        changeSets,
      })
    : changeSets
}

export default withTracker()(getChangeSets)
