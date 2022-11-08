import tracker from "../tracker.js"
import { existsSync, writeFileSync } from "fs"
import { available as availableStatuses } from "../statuses.js"
import getStackOutputs from "./getStackOutputs.js"
import getStatus from "../getStatus/index.js"
import md5 from "../pkg/md5.js"

/**
 * @typedef {Object} StackParam The parameters of the stack to sync
 * @property {String} region The stack's region
 * @property {String} stackName The name of the deployed stack
 * @property {String} syncPath The file in which to save stack info
 * @property {Boolean} [noOverride=false] If provided, the command will not
 * override existing file
 */

/**
 * Download outputs of a deployed stack(s) into a local file
 * @param {StackParam|StackParam[]} stacks The stack parameters
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet] Whether to turn off tracker status update
 */
export default async function sync(stacks, params) {
  if (!Array.isArray(stacks)) stacks = [stacks]
  // Sync outputs of all supplied stacks
  await Promise.all(stacks.map((stack) => syncStack(stack, params)))
}

/**
 * Download outputs of a deployed stack into a local file
 * @param {StackParam} stack The stack parameters
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet] Whether to turn off tracker status update
 */
async function syncStack(
  { region, stackName, syncPath, noOverride },
  { quiet = false } = {}
) {
  if (noOverride && existsSync(syncPath)) {
    // If file already exists and shouldn't be overriden
    tracker.interruptInfo(`Stack outputs already exists at ${syncPath}`)
    return
  }
  // Check if stack is available
  const status = await getStatus({ region, stackName })
  if (!availableStatuses.includes(status)) {
    // If stack is in a non available status
    tracker.interruptError(`Stack ${stackName} is not available (${status})`)
    return
  }
  // Download stack outputs
  if (!quiet) tracker.setStatus("syncing outputs")
  const outputs = await getStackOutputs({ region, stackName })
  // Save stack outputs locally
  const hashBefore = existsSync(syncPath) && (await md5(syncPath))
  writeFileSync(syncPath, JSON.stringify(outputs), "utf8")
  const hashAfter = await md5(syncPath)
  const isUpdated = hashAfter !== hashBefore
  if (isUpdated) tracker.interruptSuccess(`Stack outputs saved at ${syncPath}`)
  else tracker.interruptInfo(`Stack ${stackName} outputs already up-to-date`)
  return outputs
}
