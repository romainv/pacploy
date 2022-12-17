import tracker from "../tracker.js"
import prunePackagedFiles from "./prunePackagedFiles.js"
import pruneRetainedResources from "./pruneRetainedResources.js"

/**
 * Delete retained resources created by some stacks but not associated with
 * them anymore, and prune old files from deployment bucket
 * @param {import('../params/index.js').default[]} stacks The list of stack
 * parameters to cleanup
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.warnAboutForceDelete=true] Enable to deactivate the
 * warning about the forceDelete flag when it was already displayed
 */
export default async function cleanup(
  stacks,
  { warnAboutForceDelete = true } = {}
) {
  if (!Array.isArray(stacks)) stacks = [stacks] // Convert to array

  // Check if at least one forceDelete parameter is set
  if (
    warnAboutForceDelete &&
    stacks.reduce(
      (hasForceDelete, { forceDelete }) => hasForceDelete || forceDelete,
      false
    )
  )
    // Warn user that we may not ask for confirmation before deleting
    tracker.interruptWarn("force-delete is set")

  // Prune unused packaged files
  await prunePackagedFiles(stacks)

  // Delete retained resources associated with the stacks
  await pruneRetainedResources(stacks)
}
