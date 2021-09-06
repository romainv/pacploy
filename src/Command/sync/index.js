import { existsSync, writeFileSync } from "fs"
import withTracker from "../../with-tracker/index.js"
import { available as availableStatuses } from "../statuses.js"
import getStackOutputs from "./getStackOutputs.js"
import getStatus from "../getStatus/index.js"

/**
 * Download outputs of a deployed stack into a local file
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} params.syncPath The file in which to save stack info
 * @param {Boolean} [params.noOverride=false] If provided, the command will not
 * override existing file
 */
async function sync({ region, stackName, syncPath, noOverride = false }) {
  if (noOverride && existsSync(syncPath)) {
    // If file already exists and shouldn't be overriden
    this.tracker.interruptInfo(`Stack info already exists at ${syncPath}`)
    return
  }
  // Check if stack is available
  const status = await getStatus.call(this, { region, stackName, quiet: true })
  if (!availableStatuses.includes(status)) {
    // If stack is in a non available status
    this.tracker.interruptError(
      `Stack ${stackName} is not available (${status})`
    )
    return
  }
  // Download stack outputs
  this.tracker.setStatus("syncing outputs")
  const outputs = await getStackOutputs.call(this, { region, stackName })
  // Save stack outputs locally
  writeFileSync(syncPath, JSON.stringify(outputs), "utf8")
  this.tracker.interruptInfo(`Stack outputs saved at ${syncPath}`)
  return outputs
}

export default withTracker()(sync)
