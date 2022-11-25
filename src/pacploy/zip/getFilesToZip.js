import { join, resolve, relative, isAbsolute, dirname } from "path"
import {
  alwaysInclude as alwaysIncludePatterns,
  alwaysIgnore as alwaysIgnorePatterns,
  defaultIgnore as defaultIgnorePatterns,
} from "./defaults.js"
import { findUp } from "find-up"
import { locatePath } from "locate-path"
import { readFileSync, readFile, existsSync } from "fs"
import getFilesMatching from "./getFilesMatching.js"
import getDependencies from "./getDependencies.js"

/**
 * Collect the list of files to add to the zip archive
 * @param {String} dir The path to the root folder containing the files
 * @param {String} [bundleDir="node_modules"] The parent folder under
 * which bundled dependencies should be added in the archive
 * @return {Promise<Map>} A mapping of the full paths of files in the
 * filesystem with their path in the archive
 */
export default async function getFilesToZip(dir, bundleDir) {
  const files = new Map() // Will contain the list of files to bundle
  // Retrieve package configuration, if any
  const packagePath = await findUp([".pacployrc", "package.json"], { cwd: dir })
  const packageDir = dirname(packagePath)
  let {
    main, // Defined by npm's package.json
    files: includePatterns = ["*"], // Files to include
    root = ".", // Path relative to which includePatterns are matched
    bundledDependencies = [], // Dependencies to include
    bundleDependencies = [], // Alternative spelling
    ignore: ignorePatterns, // Paths to ignore
  } = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf-8") || "{}")
    : {
        main: undefined,
        files: undefined,
        root: undefined,
        bundleDependencies: undefined,
        bundledDependencies: undefined,
        ignore: undefined,
      }
  if (bundleDependencies.length)
    // Support for both spelling, giving priority to bundleDependencies
    bundledDependencies = bundleDependencies
  // Resolve root directory relative to the config file
  root = resolve(packageDir, root)
  // Add patterns that should always be included in the bundle
  includePatterns = includePatterns.concat(alwaysIncludePatterns)
  if (main) includePatterns.push(main)
  let ignorePath
  if (!ignorePatterns) {
    // If ignorePatterns was not provided in the config file
    // Retrieve ignored patterns up to the directory of the config file, in the
    // the order listed below. To resolve potential conflicts, consider moving
    // the config file in a nested directory
    ignorePath = await findUp(
      (currentDir) => {
        const relPath = relative(currentDir, packageDir)
        if (relPath && !relPath.startsWith("..") && !isAbsolute(relPath))
          // If we're reached the parent directory of the configuration file
          return findUp.stop
        else
          return locatePath(
            [".pacployignore", ".dockerignore", ".npmignore", ".gitignore"],
            { cwd: currentDir }
          )
      },
      { cwd: dir }
    )
    ignorePatterns = ignorePath
      ? await readGlobPatterns(ignorePath) // Glob patterns defined in the file
      : defaultIgnorePatterns // Use defaults if not file exists
  }
  const ignoreDir = ignorePath ? dirname(ignorePath) : root
  // Collect ignored files
  const ignore = await getFilesMatching(
    ignorePatterns.concat(alwaysIgnorePatterns),
    // If ignorePatterns was provided in the config file, use the root
    // specified in that config file, otherwise match the patterns relative to
    // the ignore file
    { cwd: ignoreDir }
  )
  // Retrieve files to bundle (map to absolute path)
  const matches = await getFilesMatching(includePatterns, { cwd: root, ignore })
  matches.forEach((path) => files.set(resolve(root, path), path))
  // Retrieve dependencies to bundle
  const dependencies = getDependencies(
    bundledDependencies,
    root,
    // NOTE: Without a ignore file, the ignorePatterns can be very
    // restrictive as they may include node_modules, which would prevent
    // bundling any other dependency than the ones specified (e.g. nested
    // dependencies may be ignored)
    await getFilesMatching(ignorePatterns, {
      cwd: ignoreDir,
      absolute: true, // Paths in getDependencies are absolute
      // Convert symlinks to their target path (same behavior as
      // require.resolve which is used to resolve dependency locations)
      realpath: true,
    })
  )
  // Retrieve files dependencies to bundle
  for (const [depName, depPath] of dependencies.entries()) {
    const matches = await getFilesMatching(join("**", "*"), {
      cwd: depPath,
      // NOTE 1: Without a .npmignore file, the ignore patterns would be the
      // current repository's .gitignore patterns, which may conflict with
      // external dependencies
      // NOTE 2: We use the always-ignored patterns (node_module) as the modules
      // we need should already have been captured by getDependencies. The
      // remaining ones are probably devDependencies or nested node_modules
      // folders in symlinked packages in a monorepo
      ignore: await getFilesMatching(
        ignorePatterns.concat(alwaysIgnorePatterns),
        { cwd: depPath }
      ),
    })
    matches.forEach((path) =>
      files.set(
        resolve(depPath, path),
        join(bundleDir, depName, path) // Nest under the right dir in archive
      )
    )
  }
  return files
}

/**
 * Read glob patterns from a file
 * @param {String} file The path to the file
 * @return {Promise<Array>} The glob patterns
 */
async function readGlobPatterns(file) {
  return await new Promise((res, rej) =>
    readFile(file, (err, data) =>
      err
        ? rej(err)
        : res(
            data
              .toString()
              .split("\n")
              .filter((line) => !line.startsWith("#") && line.length > 0)
          )
    )
  )
}
