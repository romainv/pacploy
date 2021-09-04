const withTracker = require("../../with-tracker")
const deleteResource = require("./deleteResource")
const listRetainedResources = require("./listRetainedResources")
const listStackResources = require("./listStackResources")
const listPackagedFiles = require("../pkg/listPackagedFiles")
const getStatus = require("../getStatus")
const emptyBucket = require("./emptyBucket")

/**
 * Delete retained resources created by a stack but not associated with it
 * anymore, and prune old files from deployment bucket
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.deployBucket] The name of the deployment bucket
 * @param {Boolean} [params.pruneDeployBucket=true] Whether the delete
 * inactive artifacts from the deployment bucket
 * @param {Boolean} [params.forceDelete=false] If true, will ask for
 * confirmation before deleting the stack and associated resources
 * @return {String} The stack status after attempting to delete it
 */
async function cleanup({
  region,
  stackName,
  forceDelete,
  deployBucket,
  pruneDeployBucket = true,
}) {
  // Collect live stack resources and active packaged files if stack exists
  let liveResources = []
  let packagedFiles = []
  if ((await getStatus.call(this, { region, stackName })) !== "NEW") {
    this.tracker.setStatus("retrieving stack resources")
    liveResources = await listStackResources.call(this, { region, stackName })
    if (pruneDeployBucket && deployBucket) {
      this.tracker.setStatus("retrieving packaged files")
      packagedFiles = await listPackagedFiles.call(this, { region, stackName })
    }
  }
  // Empty the deployment bucket if specified
  if (
    pruneDeployBucket &&
    deployBucket &&
    (forceDelete ||
      (await this.tracker.confirm(
        `Empty unused files from deployment bucket ${deployBucket}?`
      )))
  ) {
    this.tracker.setStatus("pruning old deployment files")
    await emptyBucket.call(this, {
      region,
      bucket: deployBucket,
      exclude: packagedFiles
        .filter(({ Bucket }) => Bucket === deployBucket)
        .map(({ Key }) => Key),
    })
  }
  // Collect retained resources
  this.tracker.setStatus("retrieving retained resources")
  const retainedResources = await listRetainedResources.call(this, {
    region,
    stackName,
    exclude: liveResources,
  })
  this.tracker.interruptInfo(
    `${retainedResources.length} retained resources left`
  )
  if (retainedResources.length > 0) {
    // Delete retained resources if any
    const { arnsToDelete } = forceDelete
      ? // If forceDelete is set, select all resources
        { arnsToDelete: retainedResources }
      : // If forceDelete is not set, ask which resources to delete
        await this.tracker.prompt({
          type: "multiselect",
          name: "arnsToDelete",
          message: "Do you want to delete any retained resources?",
          choices: retainedResources.map((arn) => ({ name: arn, value: arn })),
        })
    // Delete confirmed resources
    const deletedResources = Object.assign(
      {},
      ...arnsToDelete.map((arn) => ({ [arn]: undefined }))
    )
    await Promise.all(
      arnsToDelete.map(async (arn) => {
        deletedResources[arn] = await deleteResource.call(this, { region, arn })
        // Update progress
        if (deletedResources[arn] === true)
          this.tracker.interruptInfo(`Deleted ${arn}`)
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
  }
}

module.exports = withTracker()(cleanup)
