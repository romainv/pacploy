import getStackOutputs from "../sync/getStackOutputs.js"
import getStatus from "../getStatus/index.js"

/**
 * @typedef {Object} StackParams The parameters to execute stack operations
 * @property {String} region The region where to deploy
 * @property {String} stackName The name of the deployed stack
 * @property {String} templatePath Path to the source template
 * @property {{region: String, name: String}[]} [dependsOn] The dependent stacks
 * @property {String|((Object) => String)} [deployBucket] A S3 bucket name to
 * package resources
 * @property {String|((Object) => String)} [deployEcr] An ECR repo URI to
 * package docker images
 * @property {String|Object|((Object) => Object<String, String>)} [stackParameters]
 * The stack parameters
 * @property {String|Object|((Object) => Object<String, String>)} [stackTags]
 * The tags to apply to the stack
 * @property {Boolean} [forceDelete=false] If true, will not ask for
 * confirmation to delete the stack and associated resources if needed
 * @property {Boolean} [forceUpload=false] If true, will re-upload
 * resources even if they were not updated since last upload
 * @property {Boolean} [noPrune=false] If true, will not prune unused
 * packaged files associated with supplied stack from deployment bucket
 * @property {Boolean} [noRetained=false] If true, will not delete
 * retained resources assiciated with the supplied stack
 * @property {Boolean} [cleanup=false] If true, will delete retained
 * resources associated with the stack
 * @property {String|String[]} [syncPath] If provided, will sync the deployed
 * infra outputs locally
 * @property {Boolean} [noOverride=false] If provided, the sync command will not
 * override existing file
 * @property {Number} [index] The stack's index in a list to stacks (set
 * dynamically in some functions)
 * @property {String} [id] A stack id generated dynamically in some functions
 */

/**
 * @typedef {Object} ResolvedStackParams The processed stack parameters after
 * resolving stack dependencies
 * @property {String} region The region where to deploy
 * @property {String} stackName The name of the deployed stack
 * @property {String} templatePath Path to the source template
 * @property {{region: String, name: String}[]} [dependsOn] The dependent stacks
 * @property {String} [deployBucket] A S3 bucket name to package resources
 * @property {String} [deployEcr] An ECR repo URI to package docker images
 * @property {Object} stackParameters The template parameters
 * @property {Object} stackTags The tags to apply to the stack
 * @property {Boolean} forceDelete If true, will not ask for
 * confirmation to delete the stack and associated resources if needed
 * @property {Boolean} forceUpload If true, will re-upload
 * resources even if they were not updated since last upload
 * @property {Boolean} noPrune If true, will not prune unused
 * packaged files associated with supplied stack from deployment bucket
 * @property {Boolean} noRetained If true, will not delete retained resources
 * associated with the supplied stack
 * @property {Boolean} cleanup If true, will delete retained resources 
 * associated with the stack
 * @property {String[]} syncPath If provided, will sync the deployed infra
 * locally
 * @property {Boolean} noOverride=false If provided, the command will not
 * override existing file
 * @property {Number} [index] The stack's index in a list to stacks (set
 * dynamically in some functions)
 * @property {String} id A stack id generated dynamically in some functions

/**
 * Process stack parameters passed as a function by providing the dependent
 * stacks outputs
 * @param {StackParams} stack The stack parameters
 * @return {Promise<ResolvedStackParams>} The processed arguments
 */
export default async function resolveParams({
  region,
  stackName,
  templatePath,
  dependsOn = [],
  deployBucket,
  deployEcr,
  stackParameters = {},
  stackTags = {},
  forceDelete = false,
  forceUpload = false,
  noPrune = false,
  cleanup = false,
  noRetained = !cleanup,
  syncPath = [],
  noOverride = false,
  index,
  id = `${region}|${stackName}`,
}) {
  // Convert JSON strings into JSON objects if needed
  if (typeof stackParameters === "string")
    stackParameters = JSON.parse(stackParameters)
  if (typeof stackTags === "string") stackTags = JSON.parse(stackTags)

  // Resolve parameters with dependencies if needed
  if (
    typeof stackParameters === "function" ||
    typeof deployBucket === "function" ||
    typeof deployEcr === "function"
  ) {
    // If some parameters need to be resolved via a function
    // Retrieve the outputs of stacks that depend on the current one
    const outputs = Object.assign(
      {},
      ...(
        await Promise.all(
          dependsOn.map(async ({ region, name: stackName }) => {
            if ((await getStatus({ region, stackName })) !== "NEW")
              // Only get stack outputs if the stack exists
              return {
                [stackName]: await getStackOutputs({ region, stackName }),
              }
          })
        )
      ).filter(Boolean)
    )
    // Resolve the parameters with the dependent stack outputs
    if (typeof stackParameters === "function")
      stackParameters = stackParameters(outputs)
    if (typeof deployBucket === "function") deployBucket = deployBucket(outputs)
    if (typeof deployEcr === "function") deployEcr = deployEcr(outputs)
  }
  // Convert syncPath to a list
  if (!Array.isArray(syncPath)) syncPath = [syncPath]

  // Return processed arguments
  return {
    region,
    stackName,
    templatePath,
    dependsOn,
    deployBucket,
    deployEcr,
    stackParameters,
    stackTags,
    forceDelete,
    forceUpload,
    noPrune,
    noRetained,
    cleanup,
    syncPath,
    noOverride,
    index,
    id,
  }
}
