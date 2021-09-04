const { existsSync, statSync } = require("fs")
const appendSlash = require("./appendSlash")

module.exports = isDir

/**
 * Check if a path is a directory
 * @param {String} path The path to check
 * @return {Boolean} Whether the path points to a directory
 */
function isDir(path) {
  // We need to append a trailing '/' to check if a path is a directory
  const dirPath = appendSlash(path)
  // We use stat instead of lstat in order to check the destination of symlinks
  return existsSync(dirPath) && statSync(dirPath).isDirectory()
}
