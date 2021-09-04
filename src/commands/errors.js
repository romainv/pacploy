const AWS = require("../aws-sdk-proxy")

module.exports = {
  command: "errors",
  describe: "Display the latest errors on the stack",
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
  },
}
