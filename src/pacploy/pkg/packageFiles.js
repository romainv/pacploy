import packageFile from "./packageFile.js"
import resolveParams from "../params/index.js"

/**
 * Package local files of a single template to S3 or ECR
 * @param {Object<String, import('./File.js').default>} toPackage The files to
 * package
 * @param {import('../params/index.js').StackParams} stack The params
 * @return {Promise<Object<String, import('./File.js').default>>} The updated
 * set of files with packaged location for each of the supplied template
 */
export default async function packageFiles(toPackage, stack) {
  // Resolve deployment resources if needed
  const resolved = await resolveParams(stack)

  // Make sure an S3 bucket or an ECR repo are provided if needed
  for (const file of Object.values(toPackage))
    if (file.packageTo === "S3" && !resolved.deployBucket)
      // If the file's destination is S3 but a bucket was not found
      throw new Error(`A bucket is missing to package ${resolved.templatePath}`)
    else if (file.packageTo === "ECR" && !resolved.deployEcr)
      // If the file's destination is ECR but a repository is missing
      throw new Error(
        `A docker repository is missing to package ${resolved.templatePath}`
      )

  // Package all the files for all templates
  return _packageFiles(toPackage, resolved)
}

/**
 * Recursively package the files and their dependencies in concurrent threads
 * @param {Object<String, import('./File.js').default>} toPackage The files to
 * package
 * @param {import('../params/index.js').ResolvedStackParams} stack The stack
 * parameters
 * @return {Promise<Object<String, import('./File.js').default>>} The updated
 * set of files with packaged location
 */
async function _packageFiles(toPackage, stack) {
  const { region, deployBucket, deployEcr, forceUpload, stackTags } = stack
  // Select the files ready to be packaged
  const filesReadyToPackage = getFilesReadyToPackage(toPackage)
  // Package all the files which are ready
  await Promise.all(
    filesReadyToPackage.map(async ([filePath, file]) => {
      // Package each selected file and update its status
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
      // Recursively package files that may depend on the current file
      return _packageFiles(toPackage, stack)
    })
  )
  return toPackage
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
