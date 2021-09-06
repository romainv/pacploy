/**
 * Append a trailing slash to the supplied path
 * @param {String} path The path
 * @return {String} The path with a trailing slash
 */
export default function appendSlash(path) {
  return path.replace(/\/?$/, "/")
}
