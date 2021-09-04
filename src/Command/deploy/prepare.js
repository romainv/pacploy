const withTracker = require("../../with-tracker")
const statuses = require("../statuses")
const getStatus = require("../getStatus")
const del = require("../del")
const waitForStatus = require("../waitForStatus")

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
  if (!statuses.stable.includes(status))
    // Wait for stack to be in a stable status
    await waitForStatus.call(this, {
      region,
      arn: stackName,
      success: statuses.stable,
    })
  if (forceDelete || statuses.needsDelete.includes(status)) {
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

module.exports = withTracker()(prepare)
