import AWS from "../aws-sdk-proxy/index.js"

const command = {
  command: "deploy",
  describe: "Deploy a template",
  builder: (yargs) => {
    yargs
      .option("template-path", {
        type: "string",
        describe: "The local path to the template to deploy",
        demandOption: true,
      })
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
        describe: "If set, will delete the existing stack before deploying",
        default: Boolean(process.argv.indexOf("--force-delete") > -1),
      })
      .option("force-upload", {
        type: "boolean",
        describe:
          "If set, will upload local resources even if they're up-to-date",
        default: Boolean(process.argv.indexOf("--force-upload") > -1),
      })
      .option("deploy-bucket", {
        alias: "s3-bucket",
        type: "string",
        describe:
          "The name of a S3 bucket to store the template resources for deployment",
      })
      .option("deploy-ecr", {
        alias: "ecr",
        type: "string",
        describe: "The URI of an ECR to deploy docker images",
      })
      .option("sync-path", {
        type: "string",
        describe: "Path to where stack info should be saved",
      })
  },
}

export default command
