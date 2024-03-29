const command = {
  command: "status",
  describe: "Retrieve the status of a stack",
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
        demandOption: true,
      })
      .option("quiet", {
        describe: "Don't display the stack status",
        alias: "q",
        type: "boolean",
        default: true,
      })
  },
}

export default command
