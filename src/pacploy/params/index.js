import getStackOutputs from "../sync/getStackOutputs.js"
import getStatus from "../getStatus/index.js"

export default class StackParams {
  /**
   * @param {Object} params The parameters
   * @param {String} params.region The region where to deploy
   * @param {String} params.stackName The name of the deployed stack
   * @param {String} params.templatePath Path to the source template
   * @param {{region: String, name: String}[]} [params.dependsOn] The dependent
   * stacks
   * @param {String|((Object) => String)} [params.deployBucket] A S3 bucket name
   * to package resources
   * @param {String|((Object) => String)} [params.deployEcr] An ECR repo URI to
   * package docker images
   * @param {String|Object|((Object) => Object<String, String>)} [params.stackParameters]
   * The stack parameters
   * @param {String|Object|((Object) => Object<String, String>)} [params.stackTags]
   * The tags to apply to the stack
   * @param {Boolean} [params.forceDelete=false] If true, will not ask for
   * confirmation to delete the stack and associated resources if needed
   * @param {Boolean} [params.forceUpload=false] If true, will re-upload
   * resources even if they were not updated since last upload
   * @param {Boolean} [params.noPrune=false] If true, will not prune unused
   * packaged files associated with supplied stack from deployment bucket
   * @param {Boolean} [params.noRetained=false] If true, will not delete
   * retained resources assiciated with the supplied stack
   * @param {Boolean} [params.cleanup=false] If true, will delete retained
   * resources associated with the stack
   * @param {String|String[]} [params.syncPath] If provided, will sync the
   * deployed infra outputs locally
   * @param {Boolean} [params.noOverride=false] If provided, the sync command
   * will not override existing file
   * @param {Number} [params.index] The stack's index in a list to stacks (set
   * dynamically in some functions)
   * @param {String} [params.id] A stack id generated dynamically in some
   * functions
   */
  constructor({
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
    this.region = region
    this.stackName = stackName
    this.templatePath = templatePath
    this.dependsOn = dependsOn
    this.deployBucket = deployBucket
    this.deployEcr = deployEcr
    this.stackParameters = stackParameters
    this.stackTags = stackTags
    this.forceDelete = forceDelete
    this.forceUpload = forceUpload
    this.noPrune = noPrune
    this.noRetained = noRetained
    this.cleanup = cleanup
    this.syncPath = syncPath
    this.noOverride = noOverride
    this.index = index
    this.id = id
  }

  /**
   * Process stack parameters passed as a function by providing the dependent
   * stacks outputs
   * @return {Promise<ResolvedStackParams>} The processed arguments
   */
  async resolve() {
    // Resolve parameters with dependencies if needed
    const outputs =
      typeof this.stackParameters === "function" ||
      typeof this.deployBucket === "function" ||
      typeof this.deployEcr === "function"
        ? // If some parameters need to be resolved via a function
          // Retrieve the outputs of stacks that depend on the current one
          Object.assign(
            {},
            ...(
              await Promise.all(
                this.dependsOn.map(async ({ region, name: stackName }) => {
                  if ((await getStatus({ region, stackName })) !== "NEW")
                    // Only get stack outputs if the stack exists
                    return {
                      [stackName]: await getStackOutputs({ region, stackName }),
                    }
                }),
              )
            ).filter(Boolean),
          )
        : {}
    // Return processed arguments
    return new ResolvedStackParams({
      region: this.region,
      stackName: this.stackName,
      templatePath: this.templatePath,
      dependsOn: this.dependsOn,
      // Resolve function with dependent outputs if needed
      deployBucket:
        typeof this.deployBucket === "function"
          ? this.deployBucket(outputs)
          : this.deployBucket,
      // Resolve function with dependent outputs if needed
      deployEcr:
        typeof this.deployEcr === "function"
          ? this.deployEcr(outputs)
          : this.deployEcr,
      // Convert JSON string into JSON object if needed
      stackParameters:
        typeof this.stackParameters === "function"
          ? this.stackParameters(outputs)
          : typeof this.stackParameters === "string"
            ? JSON.parse(this.stackParameters)
            : this.stackParameters,
      // Convert JSON string into JSON object if needed
      stackTags:
        typeof this.stackTags === "string"
          ? JSON.parse(this.stackTags)
          : this.stackTags,
      forceDelete: this.forceDelete,
      forceUpload: this.forceUpload,
      noPrune: this.noPrune,
      noRetained: this.noRetained,
      cleanup: this.cleanup,
      // Convert syncPath to a list
      syncPath: Array.isArray(this.syncPath) ? this.syncPath : [this.syncPath],
      noOverride: this.noOverride,
      index: this.index,
      id: this.id,
    })
  }
}

/**
 * The processed stack parameters after resolving stack dependencies
 */
export class ResolvedStackParams {
  /**
   * @param {Object} params The resolved parameters
   * @param {String} params.region The region where to deploy
   * @param {String} params.stackName The name of the deployed stack
   * @param {String} params.templatePath Path to the source template
   * @param {{region: String, name: String}[]} [params.dependsOn] The dependent
   * stacks
   * @param {String} [params.deployBucket] A S3 bucket name to package resources
   * @param {String} [params.deployEcr] An ECR repo URI to package docker images
   * @param {Object} params.stackParameters The template parameters
   * @param {Object<String, String>} params.stackTags The tags to apply to the
   * stack
   * @param {Boolean} params.forceDelete If true, will not ask for
   * confirmation to delete the stack and associated resources if needed
   * @param {Boolean} params.forceUpload If true, will re-upload
   * resources even if they were not updated since last upload
   * @param {Boolean} params.noPrune If true, will not prune unused
   * packaged files associated with supplied stack from deployment bucket
   * @param {Boolean} params.noRetained If true, will not delete retained
   * resources associated with the supplied stack
   * @param {Boolean} params.cleanup If true, will delete retained resources
   * associated with the stack
   * @param {String[]} params.syncPath If provided, will sync the deployed infra
   * locally
   * @param {Boolean} params.noOverride If provided, the command will not
   * override existing file
   * @param {Number} [params.index] The stack's index in a list to stacks (set
   * dynamically in some functions)
   * @param {String} params.id A stack id generated dynamically in some
   * functions
   */
  constructor({
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
  }) {
    this.region = region
    this.stackName = stackName
    this.templatePath = templatePath
    this.dependsOn = dependsOn
    this.deployBucket = deployBucket
    this.deployEcr = deployEcr
    this.stackParameters = stackParameters
    this.stackTags = stackTags
    this.forceDelete = forceDelete
    this.forceUpload = forceUpload
    this.noPrune = noPrune
    this.noRetained = noRetained
    this.cleanup = cleanup
    this.syncPath = syncPath
    this.noOverride = noOverride
    this.index = index
    this.id = id
  }

  // Provided for compatibility with StackParams
  async resolve() {
    return this
  }
}
