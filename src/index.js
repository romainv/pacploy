const yargs = require("yargs")
const Command = require("./Command")
const { join } = require("path")
const addRootStackTag = require("./middlewares/addRootStackTag")

const aliases = { package: "pkg", delete: "del" }

/**
 * Execute one or several commands with the specified configuration
 * @param {Array|Object} confs The configuration(s) for the command to execute
 * @param {Array} cliArgs The arguments passed by the CLI. If using in node
 * directly, pass the command to execute as follow: ['command']
 */
module.exports = async function cfn(confs, cliArgs) {
  if (!confs)
    // If no conf was passed
    confs = []
  else if (!Array.isArray(confs))
    // If conf was not provided as an array
    confs = [confs] // Convert to array
  if (cliArgs.includes("--stack-name"))
    // If a --stack-name is specified, filter the configuration to that which
    // matches the stack name
    confs = confs.filter(
      ({ stackName }) =>
        stackName === cliArgs[cliArgs.indexOf("--stack-name") + 1]
    )
  let results = [] // Will accumulate command results
  for (const curConf of confs) {
    // Extract special parameters used when running multiple commands
    // Replace any parameters passed as functions
    for (const param of Object.keys(curConf))
      if (typeof curConf[param] === "function")
        curConf[param] = curConf[param](results)
    // Define and retrieve CLI arguments and commands
    const args = yargs(cliArgs)
      .config(curConf) // Provide user conf from the default location
      .commandDir(join(__dirname, "commands"))
      .middleware(addRootStackTag)
      .demandCommand().argv
    // Retrieve command name, decoding aliases
    let commandName = aliases[args._[0]] || args._[0]
    // Execute the command
    const res = await new Command()[commandName](args)
    if (!res && process.exitCode === 1) return
    if (typeof res === "string")
      // Print result if relevant
      console.log(res)
    // Accumulate results
    results = results.concat(res)
  }
}
