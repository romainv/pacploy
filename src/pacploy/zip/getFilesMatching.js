import { glob } from "glob"
import { join, resolve } from "path"
import { stat } from "fs"

/**
 * Retrieve the list of files matched by patterns. This ignores directories as
 * they are created as 0-length entries in the zip and prevent getting a
 * consistent hash
 * @param {Array|String} patterns The glob patterns (a single one or a list)
 * @param {Object} [params] Additional parameters
 * @param {Set} [params.ignore] A list of files to ignore
 * @param {String} [params.cwd] The directory relative to which patterns apply
 * @param {Boolean} [params.absolute=false] Whether to return absolute paths
 * @param {Boolean} [params.nodir] Do not match directories, only files
 * @param {Boolean} [params.realpath] Convert symlinks to their target path
 * @return {Promise<Set>} The list of distinct relative paths to the matching
 * files
 */
export default async function getFilesMatching(
  patterns,
  { cwd, ignore = new Set(), ...options } = {},
) {
  if (!Array.isArray(patterns)) patterns = [patterns] // Convert to array
  const files = new Set() // Will contain the matching files
  for (let pattern of patterns) {
    // Retrieve paths matching the supplied pattern and not ignored
    const paths = (
      await glob(pattern, {
        cwd,
        follow: true, // Follow symlinks
        ...options,
      })
    ).filter((path) => !ignore.has(path))
    for (let path of paths) {
      if (await isDir(resolve(cwd, path))) {
        // If current match is a directory, expand it and get the nested files
        const subFiles = await getFilesMatching(join(path, "**", "*"), {
          cwd,
          ignore,
          nodir: true, // We captured all files, no need for further recursion
          ...options,
        })
        for (let subFile of subFiles) {
          files.add(subFile)
        }
      } else files.add(path) // If current match is a file, add it to the list
    }
  }
  return files
}

/**
 * Checks if a path is a directory
 * @param {String} path The path to check
 * @return {Promise<Boolean>} Whether the path is a directory
 */
async function isDir(path) {
  return await new Promise((res, rej) =>
    stat(path, (err, stats) => (err ? rej(err) : res(stats.isDirectory()))),
  )
}
