import deployStack from "./deployStack.js"
import tracker from "../tracker.js"

/**
 * Recursively deploy stacks while respecting their dependencies
 * @param {import('./index.js').StackParam[]} stacks The stacks to deploy
 */
export default async function deployStacks(stacks) {
  // Select the stacks which are ready to deploy
  const stacksReadyToDeploy = getStacksReadyToDeploy(stacks)
  if (stacksReadyToDeploy.length === 0) return
  // Deploy all the stacks which are ready to
  await Promise.all(
    stacksReadyToDeploy.map(async (stack) => {
      const { index } = stack
      // Indicate the stack is being deployed
      stacks[index].deploymentStatus = "in progress"
      updateTracker(stacks)
      // Deploy each ready stack
      const res = await deployStack(stack)
      if (!res) {
        // If the deployment failed
        stacks[index].deploymentStatus = "failed"
        updateTracker(stacks)
        return // Don't process further stacks
      }
      // If the deployment was successful
      stacks[index].deploymentStatus = "success"
      updateTracker(stacks)
      // Recursively deploy stacks that may depend on the current one
      return deployStacks(stacks)
    })
  )
}

/**
 * Update the tracker status to display the progress
 * @param {import('./index.js').StackParam[]} stacks The updated stacks info
 */
function updateTracker(stacks) {
  const total = stacks.length
  const left = stacks.filter(
    ({ deploymentStatus }) => !["success", "failed"].includes(deploymentStatus)
  ).length
  const inProgress = stacks.filter(
    ({ deploymentStatus }) => deploymentStatus === "in progress"
  ).length
  tracker.setStatus(
    `deploying ${total} stacks (${left} left, ${inProgress} in progress)`
  )
}

/**
 * Select the stacks which are ready to be deployed
 * @param {import('./index.js').StackParam[]} stacks The list of stack params
 * @return {import('./index.js').StackParam[]} The subset ready to be deployed
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
        true
      )
  )
}

/**
 * Retrieve the stack parameters of the stacks on which the supplied one
 * depends
 * @param {Object} stack The parameters of the stack to lookup
 * @param {import('./index.js').StackParam[]} stacks The list of stacks in
 * which to lookup
 * @return {import('./index.js').StackParam[]} The subset of stacks on which
 * the supplied one depends
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
