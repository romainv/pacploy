import prunePackagedFiles from "./prunePackagedFiles.js"
import pruneRetainedResources from "./pruneRetainedResources.js"

/**
 * Delete retained resources created by some stacks but not associated with
 * them anymore, and prune old files from deployment bucket
 * @param {import('../params/index.js').default[]} stacks The list of stack
 * parameters to cleanup
 */
export default async function cleanup(stacks) {
  // Prune unused packaged files
  await prunePackagedFiles(stacks)

  // Delete retained resources associated with the stacks
  await pruneRetainedResources(stacks)
}
