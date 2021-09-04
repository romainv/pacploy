const AWS = require("../aws-sdk-proxy")

module.exports = {
  command: "sync",
  describe:
    "Download stack information, including nested stacks and other resources",
  builder: (yargs) => {
    yargs
      .option("stack-name", {
        type: "string",
        describe: "The stack name or stack id",
        demandOption: true,
      })
      .option("region", {
        type: "string",
        describe: "The region in which the stack is deployed",
        default: AWS.config.region,
        demandOption: true,
      })
      .option("sync-path", {
        type: "string",
        describe: "Path to where stack info should be saved",
        alias: "save-to",
        demandOption: true,
      })
      .option("no-override", {
        type: "boolean",
        describe: "If provided, the command will not override existing file",
        default: Boolean(process.argv.indexOf("--no-override") > -1),
      })
  },
}
