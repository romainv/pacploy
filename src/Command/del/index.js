import withTracker from "../../with-tracker/index.js"
import {
  deleteSuccess as deleteSuccessStatuses,
  deleteFailed as deleteFailedStatuses,
} from "../statuses.js"
import getStatus from "../getStatus/index.js"
import waitForStatus from "../waitForStatus/index.js"
import cleanup from "../cleanup/index.js"
import AWS from "../../aws-sdk-proxy/index.js"

/**
 * Delete a stack and its retained resources
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {Boolean} [params.forceDelete=false] If true, will not ask for
 * confirmation before deleting the stack and associated resources
 * @return {String} The stack status after attempting to delete it
 */
async function del({ region, stackName, forceDelete }) {
  const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", region })
  // Check if stack exists
  const stackStatus = await getStatus.call(this, { region, stackName })
  // Ask user confirmation
  if (
    !forceDelete &&
    !(await this.tracker.confirm(`Delete stack ${stackName}?`))
  )
    return
  // Retrieving stackId to identify the stack after it's been deleted
  this.tracker.setStatus("retrieving stack id")
  let stackId, success1
  if (stackStatus !== "NEW") {
    ;({
      Stacks: [{ StackId: stackId }],
    } = await cf.describeStacks({ StackName: stackName }))
    // Attempt to delete the stack if it exists
    if (await _del.call(this, { region, stackId })) {
      success1 = true
      this.tracker.interruptSuccess(`Deleted stack ${stackName}`)
    }
  }
  // Delete retained resources if any
  await cleanup.call(this, { region, stackName, forceDelete })
  if (!success1 && stackStatus !== "NEW") {
    // If deletion failed earlier, try again now that retained resources have
    // been processed
    if (await _del.call(this, { region, stackId }))
      this.tracker.interruptSuccess(`Deleted stack ${stackName}`)
    else this.tracker.interruptError(`Failed to delete stack ${stackName}`)
  }
  // Return the latest stack status
  return await getStatus.call(this, { region, stackName })
}

/**
 * Helper function to request stack deletion. This won't delete resources
 * marked as 'Retain' and may fail in case Cloudformation is unable to
 * delete other resources
 * @param {Object} params Function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackId The stack Id
 * @return {Boolean} Whether the deletion succeeded
 */
async function _del({ region, stackId }) {
  const cf = new AWS.CloudFormation({ apiVersion: "2010-05-15", region })
  await cf.deleteStack({ StackName: stackId })
  const res = await waitForStatus.call(this, {
    region,
    arn: stackId,
    success: deleteSuccessStatuses,
    failure: deleteFailedStatuses,
    msg: "deleting stack",
  })
  return res === true ? res : false
}

export default withTracker()(del)
