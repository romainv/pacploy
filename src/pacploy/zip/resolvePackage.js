import { join, dirname } from "path"
import { statSync, realpathSync } from "fs"
import Module, { createRequire } from "module"

const require = createRequire(import.meta.url)

/**
 * Retrieve a dependency's location
 * For ESM modules, resolving package.json with require.resolve may fail if it
 * is not included in the module's exports (see
 * github.com/nodejs/node/issues/33460). This function provides an alternative
 * method to lookup the dependency path
 * @param {String} name The dependency name
 * @param {String} from The directory from which to lookup the dependency
 * @return {String} The path to the dependency
 */
export default function resolvePackage(name, from) {
  if (dirname(from) === from)
    throw new Error(`Cannot resolve ${name} from ${from}.`)
  const candidate = join(from, "node_modules", name)
  try {
    statSync(candidate) // Check if the path exists
    return realpathSync(candidate) // If it does, return the full path
  } catch (_) {
    try {
      // If the path didn't exist in local directory, try the parent folder
      return resolvePackage(name, dirname(from))
    } catch {
      // If we've checked all parent folders, fall back to require.resolve
      return require.resolve(name, { paths: Module._nodeModulePaths(from) })
    }
  }
}
