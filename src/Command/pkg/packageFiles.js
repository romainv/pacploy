import withTracker from "../../with-tracker/index.js"
import packageFile from "./packageFile.js"

/**
 * Package local files to S3 or ECR given their dependency relation
 * @param {Object} params Additional function parameters
 * @param {String} params.region The destination region
 * @param {Object} params.toPackage The files to package
 * @param {String} [params.deployBucket] A S3 bucket name to package resources
 * @param {String} [params.deployEcr] An ECR repo URI to package docker images
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * resources even if they were not updated since last upload
 * @return {Object} The updated set of files with packaged location
 */
async function packageFiles({
  region,
  toPackage,
  deployBucket,
  deployEcr,
  forceUpload = false,
}) {
  // Make sure an S3 bucket or an ECR repo are provided if needed
  if (
    Object.values(toPackage).reduce(
      (hasS3Files, file) => hasS3Files || file.packageTo === "S3",
      false
    ) &&
    !deployBucket
  )
    throw new Error("A bucket is required to package files to S3")
  if (
    Object.values(toPackage).reduce(
      (hasDockerImages, file) => hasDockerImages || file.packageTo === "ECR",
      false
    ) &&
    !deployEcr
  )
    throw new Error("An ECR repo is required to package Docker images")
  const run = async () => {
    await Promise.all(
      // Loop through all files left to package
      Object.entries(toPackage)
        .filter(
          // Select all files which:
          ([, file]) =>
            // Have not been packaged yet (packaged <=> has location set)
            !file.location &&
            // Are not currently being packaged (as this can take some time)
            file.status !== "in progress" &&
            // And whose dependencies have all been packaged already
            file.dependsOn.reduce(
              (allPackaged, path) =>
                allPackaged && Boolean(toPackage[path].location),
              true
            )
        )
        .map(async ([filePath, file]) => {
          // Package each selected file
          toPackage[filePath].status = "in progress"
          // Update file attributes with packaging outcomes
          Object.assign(
            toPackage[filePath],
            await packageFile.call(this, {
              region,
              file,
              deployBucket,
              deployEcr,
              forceUpload,
              // At this stage, toPackage has the required dependencies updated
              dependencies: Object.keys(toPackage)
                .filter((path) => file.dependsOn.includes(path))
                .reduce((dependencies, path) => {
                  dependencies[path] = toPackage[path]
                  return dependencies
                }, {}),
            })
          )
          // Update packaging status
          this.tracker.setStatus(
            `${
              Object.values(toPackage).filter(({ location }) => location).length
            } of ${Object.keys(toPackage).length} files uploaded (${
              Object.values(toPackage).filter(
                ({ status }) => status === "exists"
              ).length
            } unchanged)`
          )
        })
    )
    // If there are files left to package, check again which files
    // can be packaged now that this dependency was resolved,
    // otherwise stop the recursion
    return Object.values(toPackage).reduce(
      (allPackaged, file) => allPackaged && Boolean(file.location),
      true
    )
      ? toPackage
      : run()
  }
  return await run()
}

export default withTracker()(packageFiles)
