#!/usr/bin/env node

import pacploy from "./src/index.js"
import { findUpSync } from "find-up" // Dependency of yargs
import Module, { createRequire } from "module"

const require = createRequire(import.meta.url)

// Capture process arguments
const cliArgs = process.argv.slice(2)

// Retrieve user-defined configuration, which can be in the following
// locations:
// 	- the path to the config file passed by the --config argument
// 	- a pacploy.config.js file up in the tree of the current working directory
// 	- a pacploy.config.json file up in the tree of the current working directory
// 	- a 'pacploy' entry in the package.json of the current npm package
// 	The user configuration can be an object with the commands parameters, or an
// 	array of objects to chain the commands
let userConf
const userConfPath = cliArgs.includes("--config")
  ? // If a specific configuration was passed, resolve its path from the
    // current working directory instead of from this file
    require.resolve(cliArgs[cliArgs.indexOf("--config") + 1], {
      paths: Module._nodeModulePaths(process.cwd()).concat([process.cwd()]),
    })
  : // Search for pacploy.config up in the tree
    findUpSync(["pacploy.config.js", "pacploy.config.json"])
if (userConfPath) userConf = require(userConfPath)
else {
  // Search for 'pacploy' entry in the package's package.json
  const packagePath = findUpSync("package.json")
  if (packagePath) {
    ;({ pacploy: userConf } = require(packagePath))
  }
}

// Process the command
;(async () => {
  try {
    await pacploy(userConf, cliArgs)
  } catch (err) {
    console.log(err)
    process.exitCode = 1
  }
})()
