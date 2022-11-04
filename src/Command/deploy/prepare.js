import tracker from "../tracker.js"
import {
  stable as stableStatuses,
  needsDelete as needsDeleteStatuses,
} from "../statuses.js"
import getStatus from "../getStatus/index.js"
import del from "../del/index.js"
import waitForStatus from "../waitForStatus/index.js"

/**
 * Prepares a stack for deployment: this will delete it if necessary
 * @param {Object} params Function parameters
 * @param {String} params.region The stack's region
 * @param {String} [params.stackName] The name of the deployed stack
 * @param {Boolean} [params.forceDelete=false] If true, will not ask for
 * confirmation to delete the stack and associated resources if needed
 * @return {Promise<String>} The prepared stack status
 */
export default async function prepare({
  region,
  stackName,
  forceDelete = false,
}) {
  // Check current stack status
  let status = await getStatus({ region, stackName })
  if (!stableStatuses.includes(status))
    // Wait for stack to be in a stable status
    await waitForStatus({
      region,
      arn: stackName,
      success: stableStatuses,
    })
  if (needsDeleteStatuses.includes(status)) {
    if (!forceDelete)
      // Information on the delete prompt
      tracker.interruptWarn(
        [
          `Stack is in status ${status}`,
          `and needs to be deleted before attempting to create it again`,
        ].join(" ")
      )
    // Delete stack
    await del({ region, stackName, forceDelete })
    // Update status
    status = await getStatus({ region, stackName })
  }
  return status
}
