import deleteStack from "./deleteStack.js"
import tracker from "../tracker.js"

/**
 * @typedef {Object} StackToDelete Additional properties specific to the
 * deletion of a stack
 * @property {String} [deleteStatus] The deletion status
 */

/**
 * Recursively delete stacks while respecting their dependencies
 * @param {Object<String, import('../params/index.js').StackParams & StackToDelete>} stacks
 * The stacks to delete
 */
export default async function deleteStacks(stacks) {
  // Determine which stacks are ready to be deleted
  const stacksReadyToDelete = getStacksReadyToDelete(stacks)
  if (Object.keys(stacksReadyToDelete).length === 0) return
  // Deploy all the stacks which are ready to
  await Promise.all(
    Object.entries(stacksReadyToDelete).map(
      async ([id, { region, stackName }]) => {
        // Deploy each ready stack
        stacks[id].deleteStatus = "in progress"
        updateTracker(stacks)
        const res = await deleteStack({ region, stackName })
        if (typeof res === "string") {
          tracker.interruptError(`Failed to delete stack ${stackName}`)
          stacks[id].deleteStatus = "failed"
          updateTracker(stacks)
          return // Don't process further stacks
        }
        // If the deletion succeeded
        tracker.interruptSuccess(`Deleted stack ${stackName}`)
        stacks[id].deleteStatus = "success"
        updateTracker(stacks)
        // Recursively delete stacks that may have depended on the current one
        return deleteStacks(stacks)
      }
    )
  )
}

/**
 * Update the tracker status to display the progress
 * @param {Object<String, import('../params/index.js').StackParams & StackToDelete>} stacks
 * The stacks
 */
function updateTracker(stacks) {
  const total = Object.keys(stacks).length
  const left = Object.values(stacks).filter(
    ({ deleteStatus }) => !["success", "failed"].includes(deleteStatus)
  ).length
  const inProgress = Object.values(stacks).filter(
    ({ deleteStatus }) => deleteStatus === "in progress"
  ).length
  if (total > 1)
    tracker.setStatus(
      `deleting ${total} stacks (${left} left, ${inProgress} in progress)`
    )
  else tracker.setStatus("deleting stack")
}

/**
 * Select the stacks which are ready to be deleted
 * @param {Object<string, import('../params/index.js').StackParams & StackToDelete>} stacks
 * The list of stack parameters
 * @return {Object<string, import('../params/index.js').StackParams & StackToDelete>}
 * The subset of those ready to be deleted
 */
function getStacksReadyToDelete(stacks) {
  // Filter on the stacks ready to be deleted, i.e.:
  return Object.entries(stacks).reduce((readyStacks, [id, stack]) => {
    const { deleteStatus, region, stackName } = stack
    if (
      // Have not been deleted yet or are not being deleted
      !deleteStatus &&
      // And whose dependents (if any) have all been deleted already
      getDependents({ region, stackName }, stacks).reduce(
        (allDeleted, { deleteStatus }) =>
          allDeleted && deleteStatus === "success",
        true
      )
    )
      readyStacks[id] = stack
    return readyStacks
  }, {})
}

/**
 * Retrieve the stack parameters of the stacks that depend on the supplied one
 * @param {Object} stack The stack to lookup
 * @param {String} stack.region The stack's region
 * @param {String} stack.stackName The stack's name
 * @param {Object<string, import('../params/index.js').StackParams & StackToDelete>} stacks
 * The stack parameters to filter
 * @return {(import('../params/index.js').StackParams & StackToDelete)[]} The
 * subset of stacks that depend on the supplied one
 */
function getDependents({ region, stackName }, stacks) {
  // For all stacks, select those that depend on the supplied one
  return Object.values(stacks).reduce((dependents, stack) => {
    if (Array.isArray(stack.dependsOn))
      for (const { region: curRegion, name: curStackName } of stack.dependsOn)
        if (curRegion === region && curStackName === stackName) {
          dependents.push(stack)
          break
        }
    return dependents
  }, [])
}
