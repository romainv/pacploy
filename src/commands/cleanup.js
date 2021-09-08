import AWS from "../aws-sdk-proxy/index.js"

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

export default command
