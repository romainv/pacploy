import AWS from "../aws-sdk-proxy/index.js"

const command = {
  command: "package",
  describe: "Package dependencies to S3 or ECR",
  builder: (yargs) => {
    yargs
      .option("region", {
        type: "string",
        describe: "The region in which the stack is deployed",
        default: AWS.config.region,
        demandOption: true,
      })
      .option("template-path", {
        type: "string",
        describe: "the local path to the template to deploy",
        demandOption: true,
      })
      .option("force-upload", {
        type: "boolean",
        describe:
          "If set, will upload local resources even if they're up-to-date",
        default: Boolean(process.argv.indexOf("--force-upload") > -1),
      })
      .option("deploy-bucket", {
        type: "string",
        describe: "A S3 bucket to store the template resources for deployment",
        alias: "s3-bucket",
      })
      .option("deploy-ecr", {
        type: "string",
        describe: "The URI of an ECR to deploy docker images",
        alias: "ecr",
      })
      .option("zip-to", {
        type: "String",
        describe:
          "If provided, will also zip the packaged template to the specified path",
      })
  },
}

export default command
