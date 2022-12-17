const command = {
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
        demandOption: true,
      })
      .option("force-delete", {
        type: "boolean",
        describe: "If set, will not ask for confirmation delete",
        default: Boolean(process.argv.indexOf("--force-delete") > -1),
      })
      .option("no-prune", {
        type: "boolean",
        describe: "If set, will not prune unused packaged files",
        default: Boolean(process.argv.indexOf("--no-prune") > -1),
      })
      .option("cleanup", {
        type: "boolean",
        describe: "If set, will not delete retained resources",
        default: Boolean(process.argv.indexOf("--cleanup") > -1),
      })
  },
}

export default command
