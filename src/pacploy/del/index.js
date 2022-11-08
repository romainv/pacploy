import tracker from "../tracker.js"
import deleteStacks from "./deleteStacks.js"
import cleanup from "../cleanup/index.js"
import getStatus from "../getStatus/index.js"

/**
 * @typedef {Object} StackParam The parameters of the stack to delete
 * @property {String} region The stack's region
 * @property {String} stackName The name of the deployed stack
 * @property {{region: String, name: String}[]} [dependsOn] The dependent stacks
 * @property {Boolean} [forceDelete] Whether to force-delete stack and resources
 * @property {String} [deleteStatus] Track the deletion status
 */

/**
 * Delete stacks while respecting their dependencies
 * @param {StackParam|StackParam[]} stacks The stacks to delete
 */
export default async function del(stacks) {
  if (!Array.isArray(stacks)) stacks = [stacks] // Convert to array
  // Check if at least one forceDelete parameter is set
  if (
    stacks.reduce(
      (hasForceDelete, { forceDelete }) => hasForceDelete || forceDelete,
      false
    )
  )
    // Warn user that we'll not ask for confirmation before deleting
    tracker.interruptWarn("force-delete is set")

  // Check stack status
  tracker.setStatus("checking stacks status")
  const alreadyDeletedStackIds = (
    await Promise.all(
      stacks.map(async ({ region, stackName }) => {
        if ((await getStatus({ region, stackName })) === "NEW") {
          tracker.interruptInfo(`Stack ${stackName} already deleted`)
          return `${region}|${stackName}`
        }
      })
    )
  ).filter(Boolean)

  // Remove potential duplicates, already deleted stacks and set an identifier
  const _stacks = stacks.reduce((res, stack) => {
    // De-duplicate stacks by their region and name
    const id = `${stack.region}|${stack.stackName}`
    // Keep only the first occurrence in case of duplicates
    if (!Object.keys(res).includes(id) && !alreadyDeletedStackIds.includes(id))
      res[id] = stack
    return res
  }, {})

  // Auto-select the stacks flagged with forceDelete
  const stacksToDelete = Object.entries(_stacks)
    .filter(([, { forceDelete }]) => forceDelete)
    .reduce((res, [id, stack]) => {
      res[id] = stack
      return res
    }, {})

  // Check which stacks require confirmation
  const stackIdsToConfirm = Object.entries(_stacks)
    .filter(([, { forceDelete }]) => !forceDelete)
    .map(([id]) => id)
  if (stackIdsToConfirm.length > 0) {
    // Ask for user confirmation if needed
    const { confirmedIds } = await tracker.prompt({
      type: "multiselect",
      name: "confirmedIds",
      message: "Select stacks to delete",
      choices: stackIdsToConfirm.map((id) => ({
        name: `${_stacks[id].stackName} (${_stacks[id].region})`,
        value: id,
      })),
      result(names) {
        return this.map(names) // Return a map of name: value
      },
    })
    // Add the confirmed stacks to the list
    Object.values(confirmedIds).forEach(
      (id) => (stacksToDelete[id] = _stacks[id])
    )
  }

  // Delete the selected stacks
  if (Object.keys(stacksToDelete).length > 0) await deleteStacks(stacksToDelete)

  // Delete retained resources if any
  await cleanup(stacks)
}
