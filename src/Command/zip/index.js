import { join } from "path"
import { existsSync, unlinkSync } from "fs"
import getFilesToZip from "./getFilesToZip.js"
import zipFiles from "./zipFiles.js"
import withTracker from "../../with-tracker/index.js"
import getArchiveBasename from "./getArchiveBasename.js"

/**
 * Zip a list of files or a package so it can be deployed to S3
 * For packages, this uses npm pack parameters in package.json to configure how
 * the package should be packed, and executes npm prepare before packing, but
 * it doesn't rely on npm pack
 * @param {Object} [params] Function parameters
 * @param {String} [params.dir] The path to the package root
 * @param {String} [params.bundleDir="node_modules"] The parent folder under
 * which bundled dependencies should be added in the archive
 * @param {Map} [params.files] A mapping of the full paths of files to zip in
 * the filesystem with their path in the archive. Either params.files or
 * params.dir should be provided
 * @param {String} [params.zipTo] The destination path of the zip file. If
 * omitted, will generated one from the package dir
 * @param {String} [format="zip"] The archive format to use ('zip' or 'tar')
 * @param {Object} [options] The zip or tar options
 * @return {String} The path to the zipped file
 */
async function zip({
  dir,
  bundleDir = "node_modules",
  files,
  zipTo,
  format = "zip",
  options = format === "zip" ? { zlib: { level: 9 } } : undefined,
} = {}) {
  // Generate target filename if needed
  if (!zipTo)
    zipTo = join(dir, `${await getArchiveBasename(dir || files)}.${format}`)
  // Remove previous file if needed (avoids recursively zipping it)
  if (existsSync(zipTo)) unlinkSync(zipTo)
  if (dir)
    // If a directory should be zipped, get the files to zip
    files = await getFilesToZip(dir, bundleDir)
  // Zip the files
  await zipFiles(zipTo, files, format, options)
  // Return the path to the zip file
  return zipTo
}

export default withTracker()(zip)
