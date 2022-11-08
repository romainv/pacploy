import prunePackagedFiles from "./prunePackagedFiles.js"
import pruneRetainedResources from "./pruneRetainedResources.js"

/**
 * @typedef {Object} StackParam The parameters of the stack to cleanup
 * @property {String} region The stack's region
 * @property {String} stackName The name of the deployed stack
 * @property {String|((Object) => String)} [deployBucket] A S3 bucket name to
 * package resources
 * @property {Boolean} [noPrune=false] If true, will not prune unused
 * packaged files associated with supplied stack from deployment bucket
 * @property {Boolean} [noRetained=false] If true, will not delete
 * retained resources assiciated with the supplied stack
 * @property {Boolean} [forceDelete=false] If true, will not ask for
 * confirmation before deleting the stack and associated resources
 * @param {Number} [index] The stack's index in the supplied list (dynamic)
 */

/**
 * Delete retained resources created by some stacks but not associated with
 * them anymore, and prune old files from deployment bucket
 * @param {StackParam|StackParam[]} stacks The stack parameters
 */
export default async function cleanup(stacks) {
  if (!Array.isArray(stacks)) stacks = [stacks] // Convert to array

  // Prune unused packaged files
  await prunePackagedFiles(
    stacks.map(({ region, stackName, deployBucket, noPrune, forceDelete }) => ({
      region,
      stackName,
      deployBucket,
      noPrune,
      forceDelete,
    }))
  )

  // Delete retained resources associated with the stacks
  await pruneRetainedResources(
    stacks.map(
      ({ region, stackName, deployBucket, noRetained, forceDelete }) => ({
        region,
        stackName,
        deployBucket,
        noRetained,
        forceDelete,
      })
    )
  )
}
