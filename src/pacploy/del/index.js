import tracker from "../tracker.js"
import deleteStacks from "./deleteStacks.js"
import cleanup from "../cleanup/index.js"
import getStatus from "../getStatus/index.js"

/**
 * Delete stacks while respecting their dependencies
 * @param {import('../params/index.js').default|import('../params/index.js').default[]} stacks
 * The list of stack parameters to delete
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.warnAboutForceDelete=true] Enable to deactivate the
 * warning about the forceDelete flag when it was already displayed
 */
export default async function del(
  stacks,
  { warnAboutForceDelete = true } = {},
) {
  if (!Array.isArray(stacks)) stacks = [stacks] // Convert to array

  // Check if at least one forceDelete parameter is set
  if (
    warnAboutForceDelete &&
    stacks.reduce(
      (hasForceDelete, { forceDelete }) => hasForceDelete || forceDelete,
      false,
    )
  )
    // Warn user that we'll not ask for confirmation before deleting
    tracker.interruptWarn("force-delete is set")

  // Resolve stack parameters
  tracker.setStatus("resolving stacks parameters")
  const resolvedStacks = await Promise.all(
    stacks.map((stack) => stack.resolve()),
  )

  // Check stack status
  tracker.setStatus("checking stacks status")
  const alreadyDeletedStackIds = (
    await Promise.all(
      resolvedStacks.map(async ({ id, region, stackName }) => {
        if ((await getStatus({ region, stackName })) === "NEW") {
          tracker.interruptInfo(`Stack ${stackName} already deleted`)
          return id
        }
      }),
    )
  ).filter(Boolean)

  // Remove potential duplicates, already deleted stacks and format as map
  const _stacks = resolvedStacks.reduce((res, stack) => {
    // Keep only the first occurrence in case of duplicates
    if (
      !Object.keys(res).includes(stack.id) &&
      !alreadyDeletedStackIds.includes(stack.id)
    )
      res[stack.id] = stack
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
      (id) => (stacksToDelete[id] = _stacks[id]),
    )
  }

  // Delete the selected stacks
  if (Object.keys(stacksToDelete).length > 0) await deleteStacks(stacksToDelete)

  // Delete retained resources if any
  await cleanup(stacks, { warnAboutForceDelete: false })
}
