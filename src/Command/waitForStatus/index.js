import withTracker from "../../with-tracker/index.js"
import { call } from "../throttle.js"
import {
  CloudFormationClient,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Waits until a stack or a change set is in a particular status
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.arn The name or arn of the deployed stack or change
 * set
 * @param {Array<String>} params.success The list of status values to wait for
 * @param {Array<String>} [params.failure] The list of status values that fail
 * @param {Boolean} [params.quiet=false] If true, will not update status
 * @param {String} [params.msg="checking status"] The message to display while
 * waiting for the status. Current status will be appended. If falsy, will not
 * update status
 * @return {Boolean|String} True if the status is part of the success values,
 * otherwise the status reason for the failure
 */
async function waitForStatus({
  region,
  arn,
  success,
  failure = [],
  msg = "checking status",
}) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  // Check if the supplied arn is that of a change set or a stack
  const isChangeSet = /arn:aws:cloudformation:[^:]+:[^:]+:changeSet\/.+/.test(
    arn
  )
  try {
    let status, statusReason
    do {
      // Retrieve status
      if (isChangeSet) {
        // Retrieve status of a change set
        ;({ Status: status, StatusReason: statusReason } = await call(
          cf,
          cf.send,
          new DescribeChangeSetCommand({ ChangeSetName: arn })
        ))
      } else {
        // Retrieve status of a stack
        ;({
          Stacks: [
            { StackStatus: status, StackStatusReason: statusReason },
          ] = [],
        } = await call(
          cf,
          cf.send,
          new DescribeStacksCommand({ StackName: arn })
        ))
      }
      if (msg) this.tracker.setStatus(`${msg} (${status})`)
      // If we're about to go over the ticks budget, add some more
      // Wait until next check
      await new Promise((res) => setTimeout(res, 1000))
    } while (
      !status ||
      (!success.includes(status) && !failure.includes(status))
    )
    return success.includes(status) ? true : statusReason || status || ""
  } catch (err) {
    this.tracker.interruptError(err.message)
    return err.message
  }
}

export default withTracker()(waitForStatus)
