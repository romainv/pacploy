import tracker from "../tracker.js"
import getFilesToPackage from "./getFilesToPackage.js"
import packageFiles from "./packageFiles.js"
import StackParams from "../params/index.js"

/**
 * Package a template and its local resources to S3 for deployment
 * This aims to be equivalent to the 'aws cloudformation package' command of
 * AWS CLI, which doesn't exist in AWS JS SDK
 * @param {import('../params/index.js').default|import('../params/index.js').default[]} stacks
 * The list of stack parameters to package
 * @param {Object} [params] Additional parameters to configure the function
 * @param {Boolean} [params.quiet] If true, will disable outputs
 * @return {Promise<String[]>} The URLs of the packaged templates
 */
export default async function pkg(stacks, { quiet = false } = {}) {
  if (!Array.isArray(stacks)) stacks = [stacks] // Convert to array

  // Collect the files that need to be packaged and their dependencies for each
  // template. We don't attempt to de-duplicate as the local packages depend on
  // their destinations (e.g. reference to the S3 locations in templates), and
  // the same template could be packaged to different regions, or using
  // different buckets. Not impossible to bring some optimization in
  // de-duplication, but it is not worth the complexity at this stage
  if (!quiet) tracker.setStatus("retrieving files to package")
  const stacksToPackage = stacks.map((stack) => ({
    ...stack,
    toPackage: getFilesToPackage(stack.templatePath),
  }))

  // Package templates
  const filesCount = stacksToPackage.reduce(
    (count, { toPackage }) => count + Object.keys(toPackage).length,
    0,
  )
  if (!quiet) tracker.setStatus(`packaging ${filesCount} files`)
  const packagedTemplates = await Promise.all(
    stacksToPackage.map(({ toPackage, ...stack }) =>
      packageFiles(toPackage, new StackParams(stack)),
    ),
  )

  // Verify that all files were packaged
  for (const [index, { toPackage }] of stacksToPackage.entries()) {
    const expected = Object.keys(toPackage).length
    const actual = Object.keys(packagedTemplates[index]).length
    if (actual !== expected)
      throw new Error(
        `Expected to package ${expected} files, but ${actual} were packaged`,
      )
  }

  // Display packaging result
  const newCount = packagedTemplates.reduce(
    (count, packagedFiles) =>
      count +
      Object.values(packagedFiles).filter(({ status }) => status !== "exists")
        .length,
    0,
  )
  const totalCount = packagedTemplates.reduce(
    (count, packagedFiles) => count + Object.keys(packagedFiles).length,
    0,
  )
  if (!quiet)
    if (newCount > 0)
      tracker.interruptSuccess(
        `${newCount} new files packaged (${totalCount} in total)`,
      )
    else
      tracker.interruptInfo(`No new files to package (${totalCount} in total)`)

  // Return the paths to the packaged templates. If a template didn't need to
  // be packaged, return its original path
  const paths = []
  for (const [index, { templatePath }] of stacksToPackage.entries())
    paths.push(
      Object.keys(packagedTemplates[index]).includes(templatePath)
        ? packagedTemplates[index][templatePath].location
        : templatePath,
    )
  return paths
}
