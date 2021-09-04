const { dirname, resolve } = require("path")
const isDir = require("./isDir")
const appendSlash = require("./appendSlash")

module.exports = getFullPath

/**
 * Convert a local path relative to another path into an absolute path
 * The typical use-case is a path specified as a template resource property:
 * the local path is the property value, and the relative path is the template
 * path
 * @param {String} path The path to convert
 * @param {String} [relToPath] The path to which the local path is related to.
 * This can point either to a directory or a file, in which case we'll use this
 * file's dirname. If ommitted, will use the current working directory
 * @return {String} The absolute path
 */
function getFullPath(path, relToPath = process.cwd()) {
  // Calculate the full path (use file's dirname if relevant)
  const fullPath = resolve(
    isDir(relToPath) ? relToPath : dirname(relToPath),
    path
  )
  // Append a trailing slash if result is a directory
  return isDir(fullPath) ? appendSlash(fullPath) : fullPath
}
