import tracker from "../tracker.js"
import prepare from "./prepare.js"
import validate from "./validate.js"
import cleanup from "../cleanup/index.js"
import deployStacks from "./deployStacks.js"

/**
 * @typedef {Object} StackParam Stack parameters for deployment
 * @property {String} region The region where to deploy
 * @property {String} stackName The name of the deployed stack
 * @property {String} templatePath Path to the source template
 * @property {{region: String, name: String}[]} [dependsOn] The dependent stacks
 * @property {String|((Object) => String)} [deployBucket] A S3 bucket name to
 * package resources
 * @property {String|((Object) => String)} [deployEcr] An ECR repo URI to
 * package docker images
 * @property {Object|((Object) => Object<String, String>)} [stackParameters]
 * The stack parameters
 * @property {Object} [stackTags] The tags to apply to the stack
 * @property {Boolean} [forceDelete=false] If true, will not ask for
 * confirmation to delete the stack and associated resources if needed
 * @property {Boolean} [forceUpload=false] If true, will re-upload
 * resources even if they were not updated since last upload
 * @property {Boolean} [noPrune=false] If true, will not prune unused
 * packaged files associated with supplied stack from deployment bucket
 * @property {Boolean} [cleanup=false] If true, will delete retained
 * resources assiciated with the stack
 * @property {String} [syncPath] If provided, will sync the deployed infra
 * locally
 * @property {Number} [index] The stack's index in the supplied list.
 * This will be set in the function, and is listed here to declare the type
 * @property {String} [deploymentStatus] Used to keep track of the deployment
 * status
 * @property {String} [stackStatus] The stack's status prior to deployment
 */

/**
 * Deploy a list of stacks
 * @param {StackParam|StackParam[]} stacks The stack parameters
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

  // Validate templates
  tracker.setStatus("validating templates")
  await Promise.all(
    stacks.map(({ region, templatePath }) => validate({ region, templatePath }))
  )

  // Prepare stacks for deployment
  tracker.setStatus("checking stacks status")
  await Promise.all(
    stacks.map(async (stack) => {
      const stackStatus = await prepare(stack)
      stacks[stack.index].stackStatus = stackStatus
    })
  )

  // Deploy the stacks
  await deployStacks(stacks)

  // Cleanup retained resources
  await cleanup(
    stacks.map(
      ({
        region,
        stackName,
        deployBucket,
        noPrune,
        cleanup = false,
        forceDelete,
      }) => ({
        region,
        stackName,
        deployBucket,
        noPrune,
        noRetained: !cleanup,
        forceDelete,
      })
    )
  )
}
