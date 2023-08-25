import tracker from "../tracker.js"
import {
  stable as stableStatuses,
  needsDelete as needsDeleteStatuses,
  canBeModified as canBeModifiedStatuses,
} from "../statuses.js"
import getStatus from "../getStatus/index.js"
import del from "../del/index.js"
import waitForStatus from "../waitForStatus/index.js"

/**
 * Prepares a stack for deployment: this will delete it if necessary
 * @param {import('../params/index.js').default} stack Stack parameters
 * @return {Promise<String>} The prepared stack status
 */
export default async function prepare(stack) {
  const { region, stackName, forceDelete = false } = stack
  // Check current stack status
  let status = await getStatus({ region, stackName })
  if (!stableStatuses.includes(status))
    // Wait for stack to be in a stable status
    await waitForStatus({
      region,
      arn: stackName,
      success: stableStatuses,
      msg: "",
    })
  if (needsDeleteStatuses.includes(status)) {
    if (!forceDelete)
      // Information on the delete prompt
      tracker.interruptWarn(
        [
          `Stack is in status ${status}`,
          `and needs to be deleted before attempting to create it again`,
        ].join(" "),
      )
    // Delete stack
    await del(stack, { warnAboutForceDelete: false })
    // Update status
    status = await getStatus({ region, stackName })
  }
  if (!canBeModifiedStatuses.includes(status)) {
    // If stack is not in a status that can be changed, abort the deployment
    const message = `Stack ${stackName} can't be modified (in status ${status})`
    tracker.interruptError(message)
    throw new Error(message)
  }
  return status
}
