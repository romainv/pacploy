const command = {
  command: "cleanup",
  describe:
    "Delete retained resources and artifacts created by a stack but not associated with it anymore",
  builder: (yargs) => {
    yargs
      .option("stack-name", {
        type: "string",
        describe: "The stack name or stack id",
        demandOption: true,
      })
      .option("deploy-bucket", {
        type: "string",
        alias: "s3-bucket",
        describe: "A S3 bucket to store the template resources for deployment",
        default: "",
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
        describe:
          "If set, will not prune unused packaged files associated with supplied stack from deployment bucket",
        default: Boolean(process.argv.indexOf("--no-prune") > -1),
      })
      .option("no-retained", {
        type: "boolean",
        describe:
          "If set, will not delete retained resources assiciated with the supplied stack",
        default: Boolean(process.argv.indexOf("--no-retained") > -1),
      })
  },
}

export default command
