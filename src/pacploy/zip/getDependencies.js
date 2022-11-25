import { join, dirname } from "path"
import { readFileSync, existsSync } from "fs"
import resolvePackage from "./resolvePackage.js"

/**
 * Retrieve the list of nested dependencies
 * @param {Array} depList The parent list of dependencies to check
 * @param {String} [cwd] The directory from which to resolve dependencies
 * @param {Set} [ignore] A list of files to ignore
 * @param {Map} [deps] The map of dependency names to their full path
 * @param {Array} [bundledDependencies] The original list of dependencies to
 * bundle: those will be included regardless of the ignored files
 * @return {Map} The map of dependency names to their full path
 */
export default function getDependencies(
  depList,
  cwd,
  ignore = new Set(),
  deps = new Map(),
  bundledDependencies = depList
) {
  depList.forEach((dep) => {
    // Retrieve the dependency location
    let depPath
    try {
      depPath = join(resolvePackage(dep, cwd), "package.json")
    } catch (err) {
      throw new Error(`Unable to locate dependency ${dep} from ${cwd}: ${err}`)
    }
    if (bundledDependencies.includes(dep) || !ignore.has(depPath)) {
      // If the current package is not ignored, or has been specified in the
      // list of dependencies to bundle
      deps.set(dep, dirname(depPath)) // Add dependency dir to the list
      // Recursively add sub-dependencies, if any (read from package.json)
      const { dependencies = {} } = existsSync(depPath)
        ? // We may have found the package, but it may not have package.json
          JSON.parse(readFileSync(depPath, "utf-8"))
        : {}
      getDependencies(
        Object.keys(dependencies),
        dirname(depPath),
        ignore,
        deps,
        depList // Preserve the original list of dependencies to bundle
      )
    }
  })
  return deps
}
