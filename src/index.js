import yargs from "yargs"
import Command from "./Command/index.js"
import { dirname, join } from "path"
import addRootStackTag from "./middlewares/addRootStackTag.js"
import { fileURLToPath } from "url"
import { readdir } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))

const aliases = { package: "pkg", delete: "del", status: "getStatus" }

/**
 * Execute one or several commands with the specified configuration
 * @param {Array|Object} [confs] The configuration(s) for the command to execute
 * @param {Array} [cliArgs] The arguments passed by the CLI. If using in node
 * directly, pass the command to execute as follow: ['command']
 */
export default async function pacploy(confs = [], cliArgs = []) {
  if (!Array.isArray(confs)) confs = [confs] // Convert to array
  if (cliArgs.includes("--stack-name"))
    // If a --stack-name is specified, filter the configuration matching it
    confs = confs.filter(
      ({ stackName } = {}) =>
        stackName === cliArgs[cliArgs.indexOf("--stack-name") + 1]
    )
  // Keep at least an empty conf object to execute the below loop
  if (confs.length === 0) confs.push({})
  let results = [] // Will accumulate command results
  for (const curConf of confs) {
    // Replace any parameters passed as functions by their value
    for (const param of Object.keys(curConf).filter(
      (param) => typeof curConf[param] === "function"
    ))
      curConf[param] = curConf[param](results)
    // Define and retrieve CLI arguments and commands
    let args = yargs(cliArgs).config(curConf) // Provide user conf from the default location
    const commandDefs = await getCommands(join(__dirname, "commands"))
    for (const commandDef of commandDefs)
      args = args.command(
        commandDef.command,
        commandDef.describe,
        commandDef.builder || {},
        commandDef.handler
      )
    args = args.middleware(addRootStackTag).demandCommand().argv
    // Retrieve command name, decoding aliases
    let commandName = aliases[args._[0]] || args._[0]
    // Execute the command
    const res = await new Command()[commandName](args)
    if (!res && process.exitCode === 1) return
    if (typeof res === "string") console.log(res) // Print result if relevant
    results = results.concat(res) // Accumulate results
  }
}

/**
 * Retrieve the commands definition
 * FIXME: Use yarg's .commandDir when this is resolved:
 * https://github.com/yargs/yargs/issues/571 is
 * @param {String} commandDir The path containing the commands definitions
 * @return {Array} The list of commands
 */
async function getCommands(commandDir) {
  const files = await new Promise((res, rej) =>
    // Read all files from supplied directory
    readdir(commandDir, (err, files) => (err ? rej(err) : res(files)))
  )
  const commands = await Promise.all(
    files
      .filter((file) => file.endsWith(".js")) // Keep only JS files
      .map((file) => import(join(commandDir, file))) // Import module
  )
  return commands.map((module) => module.default) // Use default export
}
