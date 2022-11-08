import packageFile from "./packageFile.js"
import resolveArgs from "../resolveArgs/index.js"

/**
 * Package local files of a single template to S3 or ECR
 * @param {import('./index.js').TemplateParams} templateToPackage The parameters
 * @return {Promise<Object<String, import('./File.js').default>>} The updated
 * set of files with packaged location for each of the supplied template
 */
export default async function packageFiles({
  templatePath,
  region,
  toPackage,
  deployBucket,
  deployEcr,
  stackTags,
  forceUpload,
  dependsOn = [],
}) {
  // Resolve deployment resources if needed
  ;({ deployBucket, deployEcr } = await resolveArgs({
    deployBucket,
    deployEcr,
    dependsOn,
  }))

  // Make sure an S3 bucket or an ECR repo are provided if needed
  for (const file of Object.values(toPackage))
    if (file.packageTo === "S3" && !deployBucket)
      // If the file's destination is S3 but a bucket was not found
      throw new Error(`A bucket is missing to package ${templatePath}`)
    else if (file.packageTo === "ECR" && !deployEcr)
      // If the file's destination is ECR but a repository is missing
      throw new Error(
        `A docker repository is missing to package ${templatePath}`
      )

  // Package all the files for all templates
  return _packageFiles(toPackage, {
    region,
    deployBucket,
    deployEcr,
    forceUpload,
    stackTags,
  })
}

/**
 * Recursively package the files and their dependencies in concurrent threads
 * @param {Object} toPackage The files to package
 * @param {Object} params The packaging parameters
 * @param {String} params.region The destination region
 * @param {String} [params.deployBucket] The S3 bucket name
 * @param {String} [params.deployEcr] The ECR repo URI
 * @param {Object} [params.stackTags] The stack tags
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * resources even if they were not updated since last upload
 * @return {Promise<Object>} The updated set of files with packaged location
 */
async function _packageFiles(toPackage, params) {
  const { region, deployBucket, deployEcr, forceUpload, stackTags } = params
  const filesReadyToPackage = getFilesReadyToPackage(toPackage)
  await Promise.all(
    filesReadyToPackage.map(async ([filePath, file]) => {
      // Package each selected file and update file attributes with packaging
      // outcomes
      Object.assign(
        toPackage[filePath],
        await packageFile({
          file,
          region,
          deployBucket,
          deployEcr,
          dependencies: getDependencies(file, toPackage),
          stackTags,
          forceUpload,
        })
      )
    })
  )
  // If all files were packaged, return the updated files info
  if (allPackaged(toPackage)) return toPackage
  // If some files are yet to be packaged, continue resolving dependencies
  return _packageFiles(toPackage, params)
}

/**
 * Select the files ready to be packaged
 * @param {Object} toPackage The map between files' local paths and their
 * packaging status
 * @return {[String, import('./File.js').default][]} The entries of toPackage
 * which are ready to be packaged
 */
function getFilesReadyToPackage(toPackage) {
  return Object.entries(toPackage).filter(
    ([, file]) =>
      // Have not been packaged yet (i.e. has location set)
      !file.location &&
      // And whose dependencies have all been packaged already
      file.dependsOn.reduce(
        (allPackaged, path) => allPackaged && Boolean(toPackage[path].location),
        true
      )
  )
}

/**
 * Select the files who depend on the supplied one
 * @param {import('./File.js').default} file The file for which to get dependents
 * @param {Object} toPackage The map between files's local paths and their
 * packaging status, including the local paths they depend on
 * @return {Object} The subset of toPackage which depends on the supplied file
 */
function getDependencies(file, toPackage) {
  return Object.entries(toPackage)
    .filter(([path]) => file.dependsOn.includes(path))
    .reduce((dependencies, [path, dependentFile]) => {
      dependencies[path] = dependentFile
      return dependencies
    }, {})
}

/**
 * Determine if all files are packaged
 * @param {Object} toPackage The map between files's local paths and their
 * packaging status
 * @return {Boolean} True if all files were packaged
 */
function allPackaged(toPackage) {
  return Object.values(toPackage).reduce(
    (allPackaged, file) => allPackaged && Boolean(file.location),
    true
  )
}
