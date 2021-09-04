const AWS = require("../aws-sdk-proxy")

module.exports = {
  command: "delete",
  describe: "Delete a stack",
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
      .option("force-delete", {
        type: "boolean",
        describe: "If set, will not ask for confirmation delete",
        default: Boolean(process.argv.indexOf("--force-delete") > -1),
      })
  },
}
