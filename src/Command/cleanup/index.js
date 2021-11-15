import withTracker from "../../with-tracker/index.js"
import deleteResource from "./deleteResource.js"
import listRetainedResources from "./listRetainedResources.js"
import listStackResources from "./listStackResources.js"
import listPackagedFiles from "../pkg/listPackagedFiles.js"
import getStatus from "../getStatus/index.js"
import emptyBucket from "./emptyBucket.js"

/**
 * Delete retained resources created by a stack but not associated with it
 * anymore, and prune old files from deployment bucket
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.deployBucket] The name of the deployment bucket
 * @param {Boolean} [params.noPrune=false] If true, will not prune unused
 * packaged files associated with supplied stack from deployment bucket
 * @param {Boolean} [params.noRetained=false] If true, will not delete retained
 * resources assiciated with the supplied stack
 * @param {Boolean} [params.forceDelete=false] If true, will not ask for
 * confirmation before deleting the stack and associated resources
 */
async function cleanup({
  region,
  stackName,
  forceDelete,
  deployBucket,
  noPrune,
  noRetained,
}) {
  // Prune unused packaged files associated with the stack
  if (!noPrune && deployBucket) {
    // If stack deployment files should be pruned
    let packagedFiles = []
    this.tracker.setStatus(`retrieving current packaged files`)
    packagedFiles = await listPackagedFiles.call(this, {
      region,
      stackName,
      deployBucket,
    })
    if (
      forceDelete ||
      (await this.tracker.confirm(
        `Prune unused files from deployment bucket ${deployBucket}?`
      ))
    ) {
      // If file deletion was confirmed
      this.tracker.setStatus(`pruning old deployment files`)
      const pruned = await emptyBucket.call(this, {
        region,
        bucket: deployBucket,
        // Only delete amongst the stack's files
        tagsFilter: { RootStackName: stackName },
        // Don't delete packaged files still in use
        exclude: packagedFiles
          .filter(({ Bucket }) => Bucket === deployBucket)
          .map(({ Key }) => Key),
      })
      this.tracker[pruned.length ? "interruptSuccess" : "interruptInfo"](
        `${pruned.length ? pruned.length : "No"} files pruned`
      )
    }
  }
  if (!noRetained) {
    // If retained resources should be deleted
    // Collect live stack resources and active packaged files if stack exists
    let liveResources = []
    if ((await getStatus.call(this, { region, stackName })) !== "NEW") {
      this.tracker.setStatus(`retrieving live resources`)
      liveResources = await listStackResources.call(this, { region, stackName })
    }
    // Collect retained resources
    this.tracker.setStatus(`retrieving retained resources`)
    const retainedResources = await listRetainedResources.call(this, {
      region,
      stackName,
      exclude: liveResources,
    })
    if (retainedResources.length === 0) {
      this.tracker.interruptInfo(`No retained resources`)
    } else {
      // Delete retained resources if any
      const { arnsToDelete } = forceDelete
        ? // If forceDelete is set, select all resources
          { arnsToDelete: retainedResources }
        : // If forceDelete is not set, ask which resources to delete
          await this.tracker.prompt({
            type: "multiselect",
            name: "arnsToDelete",
            message: "Do you want to delete any retained resources?",
            choices: retainedResources.map((arn) => ({
              name: arn,
              value: arn,
            })),
          })
      // Delete confirmed resources
      const deletedResources = Object.assign(
        {},
        ...arnsToDelete.map((arn) => ({ [arn]: undefined }))
      )
      await Promise.all(
        arnsToDelete.map(async (arn) => {
          deletedResources[arn] = await deleteResource.call(this, {
            region,
            arn,
          })
          // Update progress
          if (deletedResources[arn] === true)
            this.tracker.interruptSuccess(`Deleted ${arn}`)
          else if (deletedResources[arn])
            this.tracker.interruptError(
              `Failed to delete ${arn}: ${deletedResources[arn]}`
            )
          else this.tracker.interruptError(`Failed to delete ${arn}`)
          this.tracker.setStatus(
            `${Object.values(deletedResources).reduce(
              (total, val) => total + (val ? 1 : 0),
              0
            )}/${Object.keys(deletedResources).length} resources deleted`
          )
        })
      )
      // Check how many resources are still retained after deletions
      const retainedResourcesLeft = await listRetainedResources.call(this, {
        region,
        stackName,
        exclude: liveResources,
      })
      this.tracker.interruptInfo(
        `${
          retainedResourcesLeft.length ? retainedResourcesLeft.length : "No"
        } retained resources left`
      )
    }
  }
}

export default withTracker()(cleanup)
