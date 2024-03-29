import { findUp } from "find-up"
import isDir from "../pkg/isDir.js"
import { resolve, basename, dirname } from "path"
import { createRequire } from "module"

const require = createRequire(import.meta.url)

/**
 * Generate a base name for a zip/tar file, based on the directories or files
 * to archive
 * @param {String|Map} paths The directory of file path, or a list of those
 * @return {Promise<String>} The base name for the archive
 */
export default async function getArchiveBasename(paths) {
  // Convert to array
  const pathsArray = typeof paths === "string" ? [paths] : Array.from(paths)
  // Retrieve the root directory (absolute path) of all supplied paths
  const rootdir = pathsArray
    // Convert supplied path to an absolute directory
    .map((path) => resolve(isDir(path) ? path : dirname(path)))
    // The reduce callback is not executed for single-element arrays
    .reduce((rootdir, dir) => {
      // Choose the shortest path found so far
      return dir.length < rootdir.length ? dir : rootdir
    })
  // Retrieve package configuration, if any
  const packagePath = await findUp("package.json", { cwd: rootdir })
  const { name: prefix, version = "" } = packagePath
    ? require(packagePath)
    : { name: undefined }
  // Add a suffix if the directory is nested inside a package, or if no
  // prefix was defined
  const suffix =
    !prefix || (packagePath && dirname(packagePath) !== rootdir)
      ? basename(rootdir)
      : ""
  // Generate the base name
  return `${prefix ? `${prefix}-` : ""}${suffix ? `${suffix}-` : ""}${version}`
}
