module.exports = appendSlash

/**
 * Append a trailing slash to the supplied path
 * @param {String} path The path
 * @return {String} The path with a trailing slash
 */
function appendSlash(path) {
  return path.replace(/\/?$/, "/")
}
