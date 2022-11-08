import tracker from "../tracker.js"
import getFilesToPackage from "./getFilesToPackage.js"
import packageFiles from "./packageFiles.js"

/**
 * @typedef {Object} TemplateParams The parameters of the stack to package
 * @param {String} region The stack's region
 * @param {String} templatePath The path to the template to package
 * @param {String|((Object) => String)} [deployBucket] A S3 bucket name to
 * package to
 * @param {String|((Object) => String)} [deployEcr] An ECR repo URI to package
 * images to
 * @param {Boolean} [forceUpload=false] If true, will re-upload
 * @param {Object} [stackTags] The stack tags will be applied to
 * the packaged file to enable mapping it to the stack it belongs to
 */

/**
 * Package a template and its local resources to S3 for deployment
 * This aims to be equivalent to the 'aws cloudformation package' command of
 * AWS CLI, which doesn't exist in AWS JS SDK
 * @param {TemplateParams|TemplateParams[]} templates The templates to package
 * @param {Object} [params] Additional parameters to configure the function
 * @param {Boolean} [params.quiet] If true, will disable outputs
 * @return {Promise<String[]>} The URLs of the packaged templates
 */
export default async function pkg(templates, { quiet = false } = {}) {
  if (!Array.isArray(templates)) templates = [templates]

  // Collect the files that need to be packaged and their dependencies for each
  // template. We don't attempt to de-duplicate as the local packages depend on
  // their destinations (e.g. reference to the S3 locations in templates), and
  // the same template could be packaged to different regions, or using
  // different buckets. Not impossible to bring some optimization in
  // de-duplication, but it is not worth the complexity at this stage
  if (!quiet) tracker.setStatus("retrieving files to package")
  const templatesToPackage = templates.map((template) => ({
    ...template,
    toPackage: getFilesToPackage(template.templatePath),
  }))

  // Package templates
  const filesCount = templatesToPackage.reduce(
    (count, { toPackage }) => count + Object.keys(toPackage).length,
    0
  )
  if (!quiet) tracker.setStatus(`packaging ${filesCount} files`)
  const packagedTemplates = await Promise.all(
    templatesToPackage.map((templateToPackage) =>
      packageFiles(templateToPackage)
    )
  )

  // Verify that all files were packaged
  for (const [index, { toPackage }] of templatesToPackage.entries()) {
    const expected = Object.keys(toPackage).length
    const actual = Object.keys(packagedTemplates[index]).length
    if (actual !== expected)
      throw new Error(
        `Expected to package ${expected} files, but ${actual} were packaged`
      )
  }

  // Display packaging result
  const newCount = packagedTemplates.reduce(
    (count, packagedFiles) =>
      count +
      Object.values(packagedFiles).filter(({ status }) => status !== "exists")
        .length,
    0
  )
  const totalCount = packagedTemplates.reduce(
    (count, packagedFiles) => count + Object.keys(packagedFiles).length,
    0
  )
  if (!quiet)
    if (newCount > 0)
      tracker.interruptSuccess(
        `${newCount} new files packaged (${totalCount} in total)`
      )
    else
      tracker.interruptInfo(`No new files to package (${totalCount} in total)`)

  // Return the paths to the packaged templates. If a template didn't need to
  // be packaged, return its original path
  const paths = []
  for (const [index, { templatePath }] of templatesToPackage.entries())
    paths.push(
      Object.keys(packagedTemplates[index]).includes(templatePath)
        ? packagedTemplates[index][templatePath].location
        : templatePath
    )
  return paths
}
