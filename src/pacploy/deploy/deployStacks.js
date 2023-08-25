import deployStack from "./deployStack.js"
import tracker from "../tracker.js"

/**
 * @typedef {Object} StackToDeploy Additional properties specific to the
 * deployment of a stack
 * @property {String} [deploymentStatus] The deletion status
 */

/**
 * Recursively deploy stacks while respecting their dependencies
 * @param {(import('../params/index.js').default & StackToDeploy)[]} stacks
 * The stacks to deploy
 */
export default async function deployStacks(stacks) {
  // Select the stacks which are ready to deploy
  const stacksReadyToDeploy = getStacksReadyToDeploy(stacks)
  if (stacksReadyToDeploy.length === 0) return
  // Deploy all the stacks which are ready to
  await Promise.all(
    stacksReadyToDeploy.map(async (stack) => {
      const { index, region, stackName } = stack
      // Indicate the stack is being deployed
      stacks[index].deploymentStatus = "in progress"
      updateTracker(stacks)
      // Deploy each ready stack
      const res = await deployStack(stack)
      if (!res) {
        // If the deployment failed
        stacks[index].deploymentStatus = "failed"
        updateTracker(stacks)
        const dependents = getDependents({ region, stackName }, stacks)
        if (dependents.length > 0) {
          // If stack had dependents, warn they won't be deployed
          const uniqueNames = new Set(
            dependents.map(({ stackName }) => stackName),
          )
          const s = uniqueNames.size > 1 ? "s" : ""
          tracker.interruptWarn(
            `Skipped deployment of ${
              uniqueNames.size
            } dependent stack${s}: ${Array.from(uniqueNames).join(", ")}`,
          )
        }
        return // Don't process further stacks
      }
      // If the deployment was successful
      stacks[index].deploymentStatus = "success"
      updateTracker(stacks)
      // Recursively deploy stacks that may depend on the current one
      return deployStacks(stacks)
    }),
  )
}

/**
 * Update the tracker status to display the progress
 * @param {(import('../params/index.js').default & StackToDeploy)[]} stacks
 * The updated stacks info
 */
function updateTracker(stacks) {
  const total = stacks.length
  const left = stacks.filter(
    ({ deploymentStatus }) => !["success", "failed"].includes(deploymentStatus),
  ).length
  const inProgress = stacks.filter(
    ({ deploymentStatus }) => deploymentStatus === "in progress",
  ).length
  if (total > 1)
    tracker.setStatus(
      `deploying ${total} stacks (${left} left, ${inProgress} in progress)`,
    )
  else tracker.setStatus(`deploying stack`)
}

/**
 * Select the stacks which are ready to be deployed
 * @param {(import('../params/index.js').default & StackToDeploy)[]} stacks
 * The list of stack params
 * @return {(import('../params/index.js').default & StackToDeploy)[]} The
 * subset ready to be deployed
 */
function getStacksReadyToDeploy(stacks) {
  // Filter on the stacks ready to be deployed, i.e.:
  return stacks.filter(
    ({ deploymentStatus, dependsOn }) =>
      // Have not been deployed yet, or are not being deployed
      !deploymentStatus &&
      // And whose dependencies have all been deployed already
      getDependencies({ dependsOn }, stacks).reduce(
        (allDeployed, { deploymentStatus }) =>
          allDeployed && deploymentStatus === "success",
        true,
      ),
  )
}

/**
 * Retrieve the stack parameters of the stacks on which the supplied one
 * depends
 * @param {Object} stack The parameters of the stack to lookup
 * @param {(import('../params/index.js').default & StackToDeploy)[]} stacks
 * The list of stacks in which to lookup
 * @return {(import('../params/index.js').default & StackToDeploy)[]} The
 * subset of stacks on which the supplied one depends
 */
function getDependencies({ dependsOn = [] }, stacks) {
  // For all declared dependency, lookup in the stacks list the first matching
  // stack based on region and stack name
  const dependencies = []
  for (const { region, name: stackName } of dependsOn)
    for (const stack of stacks)
      if (stack.region === region && stack.stackName === stackName) {
        dependencies.push(stack)
        break
      }
  return dependencies
}

/**
 * Retrieve the stack parameters of the stacks that depend on the supplied one
 * @param {Object} stack The stack to lookup
 * @param {String} stack.region The stack's region
 * @param {String} stack.stackName The stack's name
 * @param {(import('../params/index.js').default & StackToDeploy)[]} stacks
 * The stack parameters to filter
 * @return {(import('../params/index.js').default & StackToDeploy)[]} The
 * subset of stacks that depend on the supplied one
 */
function getDependents({ region, stackName }, stacks) {
  // For all stacks, select those that depend on the supplied one
  return stacks.reduce((dependents, stack) => {
    if (Array.isArray(stack.dependsOn))
      for (const { region: curRegion, name: curStackName } of stack.dependsOn)
        if (curRegion === region && curStackName === stackName) {
          // Add the current stack as a dependent
          dependents.push(stack)
          // Add the dependent's dependents as well
          dependents = dependents.concat(
            getDependents(
              { region: stack.region, stackName: stack.stackName },
              stacks,
            ),
          )
          break
        }
    return dependents
  }, [])
}
