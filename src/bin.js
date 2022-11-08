#!/usr/bin/env node

import pacploy from "./pacploy/index.js"
import { findUpSync } from "find-up" // Dependency of yargs
import yargs from "yargs"
import { resolve, dirname, join } from "path"
import addRootStackTag from "./middlewares/addRootStackTag.js"
import { fileURLToPath } from "url"
import { readFileSync, readdir } from "fs"

// Provide __dirname in a ES module
const __dirname = dirname(fileURLToPath(import.meta.url))
// Define command aliases (mapping between CLI alias and internal name)
const aliases = { package: "pkg", delete: "del", status: "getStatus" }
// Point at available commands
const commandDir = join(__dirname, "commands")
// Capture process arguments
const cliArgs = process.argv.slice(2)
// Identify the command to execute: it is defined in the cliArgs so will be
// unique for all user confs
const commandName = parseCommandName(cliArgs)
// Retrieve config file for compatible commands
const userConf = ["zip"].includes(commandName) ? [] : await getUserConf(cliArgs)

// Build the list of user-defined configuration(s) to use
let confs = Array.isArray(userConf) ? userConf : [userConf]
if (cliArgs.includes("--stack-name"))
  // If a specific stack name is specified in the CLI, filter the
  // configurations matching it
  confs = confs.filter(
    ({ stackName } = { stackName: undefined }) =>
      stackName === cliArgs[cliArgs.indexOf("--stack-name") + 1]
  )
// Keep at least an empty conf object to process the CLI args
if (confs.length === 0) confs.push({})

// Resolve the arguments to use for each user-defined configuration
const args = await Promise.all(
  confs.map((curConf) => parseCommandArgs(commandDir, curConf, cliArgs))
)
// Some commands are not compatible with a list of stacks
if (["zip", "errors"].includes(commandName) && args.length >= 1)
  throw new Error(`Command ${commandName} expects a single set of parameters`)
// Execute the requested command
const res = await pacploy[commandName](args)
// Print result if relevant
if (process.exitCode !== 1 && typeof res === "string") console.log(res)

/**
 * Retrieve user-defined configuration, which can be in the following
 * locations:
 * 	- the path to the config file passed by the --config argument
 * 	- a pacploy.config.js file up in the tree of the current working directory
 * 	- a pacploy.config.json file up in the tree of the current working directory
 * 	- a 'pacploy' entry in the package.json of the current npm package
 * 	The user configuration can be an object with the commands parameters, or an
 * 	array of objects to chain the commands
 * @param {Array} cliArgs The process arguments
 * @return {Promise<Object>} The configuration
 */
async function getUserConf(cliArgs) {
  let userConf
  const userConfPath = cliArgs.includes("--config")
    ? // If a specific configuration was passed, resolve its path from the
      // current working directory instead of from this file
      resolve(process.cwd(), cliArgs[cliArgs.indexOf("--config") + 1])
    : // Search for pacploy.config up in the tree
      findUpSync(["pacploy.config.js", "pacploy.config.json"])
  if (userConfPath) {
    userConf = await import(userConfPath)
    if (userConf.default) userConf = userConf.default
  } else {
    // Search for 'pacploy' entry in the package's package.json
    const packagePath = findUpSync("package.json")
    if (packagePath)
      ({ pacploy: userConf } = JSON.parse(readFileSync(packagePath, "utf8")))
  }
  return userConf
}

/**
 * Parse the CLI arguments and user config to determine the command to execute
 * and its arguments
 * @param {String} commandDir The path containing the commands definitions
 * @param {Object} userConf The user conf
 * @param {Array} cliArgs The CLI arguments
 * @return {Promise<Object>} The parsed command args
 */
async function parseCommandArgs(commandDir, userConf, cliArgs) {
  const args = (
    await applyCommandDir(commandDir, yargs(cliArgs).config(userConf))
  ).middleware(addRootStackTag).argv
  // Remove extra entries parsed by yarg
  delete args._
  delete args.$0
  return args
}

/**
 * Parse the command to execute from the CLI arguments
 * @param {Array} cliArgs The CLI arguments
 * @return {String} The command to execute
 */
function parseCommandName(cliArgs) {
  const args = yargs(cliArgs).demandCommand().argv
  // Retrieve command name, decoding aliases
  return aliases[args._[0]] || args._[0]
}

/**
 * Replacement function for yarg's .commandDir to define the available commands
 * FIXME: Use yarg's .commandDir when this is resolved:
 * https://github.com/yargs/yargs/issues/571
 * @param {String} commandDir The path containing the commands definitions
 * @param {Object} args Yarg's config object
 * @return {Promise<Object>} The yarg args completed with the defined commands
 */
async function applyCommandDir(commandDir, args) {
  // Retrieve the commands definitions
  const files = await new Promise((res, rej) =>
    // Read all files from supplied directory
    readdir(commandDir, (err, files) => (err ? rej(err) : res(files)))
  )
  const commands = await Promise.all(
    files
      .filter((file) => file.endsWith(".js")) // Keep only JS files
      .map((file) => import(join(commandDir, file))) // Import module
  )
  const commandDefs = commands.map((module) => module.default)

  // Apply the command definitions to yarg's arguments
  for (const commandDef of commandDefs)
    args = args.command(
      commandDef.command,
      commandDef.describe,
      commandDef.builder || {},
      commandDef.handler
    )
  return args
}
