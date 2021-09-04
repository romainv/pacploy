module.exports = getFilesToZip
const { join, resolve, relative, isAbsolute, dirname } = require("path")
const {
  alwaysInclude: alwaysIncludePatterns,
  alwaysIgnore: alwaysIgnorePatterns,
  defaultIgnore: defaultIgnorePatterns,
} = require("./defaults")
const findUp = require("find-up")
const locatePath = require("locate-path")
const { readFileSync, readFile, existsSync } = require("fs")
const getFilesMatching = require("./getFilesMatching")
const Module = require("module")

/**
 * Collect the list of files to add to the zip archive
 * @param {String} dir The path to the root folder containing the files
 * @param {String} [params.bundleDir="node_modules"] The parent folder under
 * which bundled dependencies should be added in the archive
 * @return {Map} A mapping of the full paths of files in the filesystem with
 * their path in the archive
 */
async function getFilesToZip(dir, bundleDir) {
  const files = new Map() // Will contain the list of files to bundle
  // Retrieve package configuration, if any
  const packagePath = await findUp([".pacployrc", "package.json"], { cwd: dir })
  const packageDir = dirname(packagePath)
  let {
    main, // Defined by npm's package.json
    files: includePatterns = ["*"], // Files to include
    root = ".", // Path relative to which includePatterns are matched
    bundledDependencies = [], // Dependencies to include
    ignore: ignorePatterns, // Paths to ignore
  } = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf-8"))
    : {}
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
 * @return {Array} The glob patterns
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
function getDependencies(
  depList,
  cwd,
  ignore = new Set(),
  deps = new Map(),
  bundledDependencies = depList
) {
  depList.forEach((dep) => {
    // Retrieve the dependency location by running require.resolve from the
    // package directory, and looking for package.json instead of the default
    // 'main' entry which may be nested further
    let depPath
    try {
      depPath = require.resolve(join(dep, "package.json"), {
        paths: Module._nodeModulePaths(cwd),
      })
    } catch (err) {
      throw new Error(
        `Unable to find dependency ${join(
          dep,
          "package.json"
        )} from ${cwd}: ${err}`
      )
    }
    if (bundledDependencies.includes(dep) || !ignore.has(depPath)) {
      // If the current package is not ignored, or has been specified in the
      // list of dependencies to bundle
      deps.set(dep, dirname(depPath)) // Add dependency dir to the list
      // Recursively add sub-dependencies, if any
      const { dependencies = {} } = require(depPath) // Read from package.json
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
