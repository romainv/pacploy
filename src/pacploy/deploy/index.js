import tracker from "../tracker.js"
import prepare from "./prepare.js"
import validate from "./validate.js"
import cleanup from "../cleanup/index.js"
import deployStacks from "./deployStacks.js"

/**
 * Deploy a list of stacks
 * @param {import('../params/index.js').default|import('../params/index.js').default[]} stacks
 * The list of stack parameters to deploy
 */
export default async function deploy(stacks) {
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

  // Assign to its stack its index to quickly identify them
  for (const index of stacks.keys()) Object.assign(stacks[index], { index })

  // Process arguments
  for (const { index, stackParameters, stackTags } of stacks) {
    // Convert JSON strings into JSON objects if needed
    if (typeof stackParameters === "string")
      stacks[index].stackParameters = JSON.parse(stackParameters)
    if (typeof stackTags === "string")
      stacks[index].stackTags = JSON.parse(stackTags)
  }

  const s = stacks.length > 1 ? "s" : ""

  // Validate templates
  tracker.setStatus(`validating template${s}`)
  await Promise.all(
    stacks.map(({ region, templatePath }) => validate({ region, templatePath }))
  )

  // Prepare stacks for deployment
  tracker.setStatus(`checking stack${s} status`)
  await Promise.all(
    stacks.map(async (stack) => {
      const stackStatus = await prepare(stack)
      stacks[stack.index].stackStatus = stackStatus
    })
  )

  // Deploy the stacks
  await deployStacks(stacks)

  // Cleanup retained resources
  await cleanup(stacks)
}
