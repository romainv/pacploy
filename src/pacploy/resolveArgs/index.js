import getStackOutputs from "../sync/getStackOutputs.js"

/**
 * @typedef {Object} StackParams The stack parameters
 * @property {{region: String, name: String}[]} [dependsOn] The dependent stacks
 * @property {Object|((Object) => Object<String, String>)} [stackParameters]
 * The stack parameters
 * @property {String|((Object) => String)} [deployBucket] The S3 bucket name to
 * package to
 * @property {String|((Object) => String)} [deployEcr] The ECR repo URI to
 * package images to
 */

/**
 * @typedef {Object} ResolvedArgs The structure of arguments after processing
 * @property {Object<String, String>} stackParameters The template parameters
 * @property {String} deployEcr The ECR repository name
 * @property {String} deployBucket The S3 bucket name
 */

/**
 * Process stack parameters passed as a function by providing the dependent
 * stacks outputs
 * @param {StackParams} stack The stack parameters
 * @return {Promise<ResolvedArgs>} The processed arguments
 */
export default async function resolveArgs({
  stackParameters,
  deployBucket,
  deployEcr,
  dependsOn = [],
}) {
  // Resolve parameters if needed
  if (
    typeof stackParameters === "function" ||
    typeof deployBucket === "function" ||
    typeof deployEcr === "function"
  ) {
    // If some parameters need to be resolved via a function
    // Retrieve the outputs of stacks that depend on the current one
    const outputs = Object.assign(
      {},
      ...(await Promise.all(
        dependsOn.map(async ({ region, name: stackName }) => ({
          [stackName]: await getStackOutputs({ region, stackName }),
        }))
      ))
    )
    // Resolve the parameters with the dependent stack outputs
    if (typeof stackParameters === "function")
      stackParameters = stackParameters(outputs)
    if (typeof deployBucket === "function") deployBucket = deployBucket(outputs)
    if (typeof deployEcr === "function") deployEcr = deployEcr(outputs)
  }
  return { stackParameters, deployBucket, deployEcr }
}
