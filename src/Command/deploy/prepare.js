import withTracker from "../../with-tracker/index.js"
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
 * @param {Boolean} [params.forceDelete=false] If true, will delete the
 * existing stack before deploying the new one
 * @return {String} The prepared stack status
 */
async function prepare({ region, stackName, forceDelete = false }) {
  if (forceDelete) this.tracker.interruptInfo("force-delete is set")
  // Check current stack status
  let status = await getStatus.call(this, { region, stackName })
  if (!stableStatuses.includes(status))
    // Wait for stack to be in a stable status
    await waitForStatus.call(this, {
      region,
      arn: stackName,
      success: stableStatuses,
    })
  if (forceDelete || needsDeleteStatuses.includes(status)) {
    if (!forceDelete)
      // Information on the delete prompt
      this.tracker.interruptWarn(
        [
          `Stack ${stackName} is in status ${status}`,
          `and needs to be deleted before attempting to create it again`,
        ].join(" ")
      )
    // Delete stack
    await del.call(this, { region, stackName, forceDelete })
    // Update status
    status = await getStatus.call(this, { region, stackName })
  }
  return status
}

export default withTracker()(prepare)
