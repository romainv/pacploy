# pacploy
_Package and deploy CloudFormation templates with a simple CLI_

Pacploy is a command-line utility to deploy [AWS CloudFormation](https://aws.amazon.com/cloudformation) templates which supports packaging nested templates and local artifacts. It provides one-liner commands to manage infrastructure as code without enforcing an opinionated framework. Written in Node.js, it integrates smoothly with your existing npm/yarn projects.

<!-- START doctoc -->
## Table of Contents

<!-- END doctoc -->

## Getting started
Install pacploy using [`yarn`](https://yarnpkg.com/en/package/jest):
```bash
yarn add --dev pacploy
```
Or [`npm`](https://www.npmjs.com/package/jest):
```bash
npm install --save-dev pacploy
```

You can then deploy a local template using the following command (e.g. in a [npm script](https://docs.npmjs.com/cli/v7/using-npm/scripts)):
```bash
pacploy deploy --template-path 'template.yaml' --stack-name 'my-stack'
```
See below for all available commands and configuration.

## Usage

### Available commands
```bash
$ pacploy --help
pacploy <command>

Commands:
  pacploy deploy     Deploy a stack
  pacploy sync       Download stack outputs in JSON format
  pacploy delete     Delete a stack
  pacploy package    Package dependencies to S3 or ECR
  pacploy status     Retrieve the status of a stack
  pacploy errors     Display the latest errors on a stack
  pacploy cleanup    Delete retained resources and artifacts created by a stack but not associated with it anymore
  pacploy zip [dir]  Create a zip archive of a package
  
Options:
  --help     Show help [boolean]
  --version  Show version number [boolean]
  --config   The path to a config file [string]
```
See [deployment configuration](#deployment) for more information on the `--config` option, and below for details on each command.

### Deploy a stack
```bash
$ pacploy deploy --help

Options:
  --template-path               The local path to the template to deploy [string] [required]
  --stack-name                  The stack name or stack id [string] [required]
  --region                      The region in which the stack is deployed [string] [required]
  --force-delete                If set, will delete the existing stack before deploying [boolean] [default:false]
  --force-upload                If set, will upload local artifacts even if they are up-to-date [boolean] [default:false]
  --deploy-bucket, --s3-bucket  The name of a S3 bucket to upload the template resources [string]
  --deploy-ecr, --ecr           The URI of an Elastic Container Registry to deploy docker images [string]
  --sync-path                   Path to where stack outputs should be saved [string]
```
This command bundles several operations to go from a local template to a live infrastructure in a single command:  
- [`package`](#package-local-dependencies) local artifacts to S3 or ECR and update the templates with the uploaded location
- create a change set for the stack and execute it, then monitor the deployment
- if `--sync-path` is specified, [`sync`](#download-stack-outputs) the stack's outputs locally 
- if the stack is in a non-deployable [`status`](#retrieve-stack-status), propose to [`delete`](#delete-a-stack) it and [`cleanup`](#cleanup-retained-resources)
  
Check the [Configuration](#Configuration) section for additional options available only through config files.

### Download stack outputs
```bash
$ pacploy sync --help

Options:
  --stack-name       The stack name or stack id [string] [required]
  --region           The region in which the stack is deployed [string] [required]
  --sync-path, --to  Path to where stack outputs should be saved [string]
  --no-override      If provided, the command will not override existing file [boolean] [default: false]
```
Download a stack's outputs (as defined in the template's [`Outputs`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) section) into a local JSON file. This enables to access stack information such as deployed resource ids.  
You usually won't need to run this command separately as it is included in the [`deploy`](#deploy-a-stack) command when passing the `--sync-path` option.

### Delete a stack
```bash
$ pacploy delete --help

Options:
  --stack-name    The stack name or stack id [string] [required]
  --region        The region in which the stack is deployed [string] [required]
  --force-delete  If set, will not ask for confirmation to delete [boolean] [default: false]
```
Delete a stack, and optionally retained resources (see the [`cleanup`](#cleanup-retained-resources) command for more info).  
By default, the command assumes that it is running in an interactive environment and will ask for confirmation before deleting anything. If this is not the case, use `--force-delete` to skip the confirmation prompts.

### Retrieve stack status
```bash
$ pacploy status --help

Options:
  --stack-name  The stack name or stack id [string] [required]
  --region      The region in which the stack is deployed [string] [required]
  -q, --quiet   Don't format the status, only display the command output [boolean] [default: true]
```
Retrieve the current status of a stack. This is mostly used internally by other commands but also made available as is.

### Display errors
```bash
$ pacploy errors --help

Options:
  --stack-name  The stack name or stack id [string] [required]
  --region      The region in which the stack is deployed [string] [required]
```
Display the last error messages that occurred during deployment of the stack. This will recursively parse nested templates and display only resources with a meaningful error message. This enables to stay in the CLI to debug a failed deployment instead of switching back and forth with the AWS console and navigating across stacks to get that information.  
Usually you won't need to run this command as it is automatically invoked as part of the [`deploy`](#deploy-a-stack) command.

### Cleanup retained resources
```bash
$ pacploy cleanup --help

Options:
  --stack-name                  The stack name or stack id [string] [required]
  --region                      The region in which the stack is deployed [string] [required]
  --deploy-bucket, --s3-bucket  The name of a S3 bucket to upload the template resources [string]
  --force-delete                If set, will not ask for confirmation to delete [boolean] [default: false]
```
Certain resources are not deleted with the stack, such as S3 buckets which are often [marked to be retained](https://aws.amazon.com/premiumsupport/knowledge-center/delete-cf-stack-retain-resources/) as they need to be emptied first. This command automates the deletion of such resources.  
It also purges unused artifacts from the S3 bucket used to [`package`](#package-local-dependencies) them. This can reduce unnecessary storage costs as the bucket grows larger with each artifact update (the [`package`](#package-local-dependencies) command is able to check if an artifact already exists, but won't remove previous ones after updates).  
For a list of supported resources, check [supported.js](./src/Command/cleanup/supported.js).

### Package local dependencies
```bash
$ pacploy package --help

Options:
  --template-path               The local path to the template to deploy [string] [required]
  --deploy-bucket, --s3-bucket  The name of a S3 bucket to upload the artifacts [string]
  --deploy-ecr, --ecr           The URI of an Elastic Container Registry to deploy docker images [string]
  --region                      The region of the S3 bucket or the ECR [string] [required]
  --force-upload                If set, will upload local artifacts even if they are up-to-date [boolean] [default:false]
  --zip-to                      If provided, will also zip the packaged template to the specified path [string]
```
Parse the supplied template for resources that point to local artifacts, and package those to S3 or ECR. See [ResourceProperty.js](./src/Command/pkg/ResourceProperty.js) for the list of supported resources and packaging destinations: it extends on [the list supported by the aws-cli](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudformation/package.html). This command is invoked by [`deploy`](#deploy-a-stack) so you usually won't need to package your dependencies separately.  
S3 artifacts will be [`zip`](#zip-an-artifact)ped into an archive format supported by CloudFormation. If the archive hasn't been updated since the last packaging (based on its md5 hash), it won't be uploaded again unless `--force-upload` is specified.  
For Docker artifacts (i.e. either a `dockerfile`, a directory containing a `dockerfile` or a `tar` archive), docker images will be built and uploaded to the supplied ECR. Only updated layers will be re-uploaded unless `--force-upload` is specified. Note that your system must have [docker](https://www.docker.com/) installed to build images (check out [sys-dependencies](https://github.com/romainv/sys-dependencies) to automate the installation).  
If the supplied template includes nested templates, those will be parsed as well and transformed to point to the new location of their dependencies. Nested templates will in turn be uploaded to S3 and their parent updated to point to their S3 location, recursively.  
Optionally, with the `--zip-to` option the supplied template can also be zipped together with its parameters and tags in a format recognized by [AWS CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/integrations-action-type.html#integrations-deploy-CloudFormation) so you can deploy it as part of your CI/CD pipeline.  

Check the [Configuration](#packaging-local-artifacts) section for additional options available only through config files.

### Zip an artifact
```bash
$ pacploy zip --help
pacploy zip [dir]

Positionals:
  dir  Path to the package to zip [string] [default:pwd]
  
Options:
  --zip-to, --to  The destination path of the zip file. If omitted, will generate a name based on the package dir [string]
  --bundle-dir    The parent folder under which to add bundled dependencies [string] [default: "node_modules"]
  --format        The archive format to use ("zip" or "tar") [string] [default: "zip"]
```
Create an archive file from the current or supplied directory following the packaging configuration (see [Packaging local artifacts](#packaging-local-artifacts) to understand how to bundle npm dependencies or ignore certain files).  
You typically won't need this command as such, and rather use the [`package`](#package-local-dependencies) or the [`deploy`](#deploy-a-stack) commands directly, but this could be useful for debug purposes to verify which files get packaged.

## Configuration

### Deployment
Besides the CLI options described above for all [available commands](#available-commands), you can configure pacploy's deployment with a config file specified as follows, in order of precedence:
 - using the `--config` option
 - using a `pacploy.config.js` or `pacploy.config.json` file at the root of your project
 - using a `pacploy` entry in the `package.json` file of your npm/yarn project

The configuration object is a map of options in [camelCase](https://en.wikipedia.org/wiki/Camel_case).  
For [`deploy`](#deploy-a-stack), you can specify `stackParameters` and `stackTags` in JSON format besides the options listed in [usage](#usage). For example:
```json
{
  "region": "us-east-1",
  "stackName": "my-stack",
  "templatePath": "./template.yaml",
  "stackParameters": {
    "foo": "bar"
  },
  "stackTags": {
    "App": "MyApp"
  }
}
```

The configuration can also be a list of individual configurations. In this case you can specify options as functions, which will take as an argument the list of results from previous configurations. For instance the below config file enables to pass along the outputs of the first stack to the second when using the [`deploy`](#deploy-a-stack) command:
```js
// pacploy.config.js

// Sample config which deploys a first stack that creates a S3 bucket used in a second stack to package local artifacts
const region = "us-east-1"
module.exports = [
  {
    region,
    stackName: "deployment-resources",
    templatePath: "deployment_infra.yaml", // Outputs 'bucketName'
  },
  {
    region,
    stackName: "my-stack",
    templatePath: "app_infra.yaml",
    deployBucket: (results) => {
      const { bucketName } = results[results.length -1]
      return bucketName
    },
  },
]
```


### Packaging local artifacts
As described in the [`package`](#package-local-dependencies) command, you can point to local artifacts in [supported](./src/Command/pkg/ResourceProperty.js) resource properties of your template. To customize how these artifacts are packaged, you can, in order of precedence:
 - place a `.pacployrc` file in the target directory or higher in the tree
 - specify the packaging options directly in your npm/yarn's `package.json` (some options overlap with [npm's specifications](https://docs.npmjs.com/cli/v7/configuring-npm/package-json))

The options are specified as follows:
```json
{
  "main": "src/index.js",
  "files": ["*.js"],
  "bundledDependencies": [
    "cfn-response",
    "node-fetch"
  ],
  "ignore": ["node_modules/aws-sdk"],
  "dockerBuild": {
    "buildArgs": {
      "NODE_VERSION": "v14.17.6"
    }
  },
  "root": "."
}
```
Here is what these options do:
 - `main` (optional) is usually specified in npm's `package.json` and will always be included in the package
 - `files` (optional) is the list of glob patterns that should be included in the archive
 - `bundledDependencies` (optional) are the list of npm dependencies which should be bundled. By default, they will be nested under a `node_modules` folder in your package, unless your resource is a [Lambda layer](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html) in which case the dependencies will be nested under a `nodejs/node_modules` folder
 - `ignore` (optional) specifies the globs to exclude from the archive. If omitted, pacploy will look for the following files up in the directory, in order of precedence: `.pacployignore`, `.dockerignore`, `.npmignore`, `.gitignore`
 - `dockerBuild` (optional) provides options to build a docker image (see [Docker's documentation](https://docs.docker.com/engine/api/v1.37/#operation/ImageBuild) for available options)
 - `root` (optional) can be specified to change the default root folder used to resolve the relative paths specified in `files`. This can be useful to include files from parent folders in the package. If `ignore` is specified in `.pacployrc`, the ignored globs will be evaluated against the specified `root` but if `ignore` is not specified and a `.<prefix>ignore` file is used instead, the globs will be evaluated relative to that file

### AWS credentials
You will need sufficient permissions to deploy your CloudFormation template, including packaging local artifacts, performing actions to manage your stack as well as granting permissions to your stack resources.  
Pacploy uses the official [AWS JS SDK](https://aws.amazon.com/sdk-for-javascript/) to execute AWS commands, so it is compatible with all the supported ways to setup credentials in Node.js: please refer to the [official doc](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for more info.

## License
Pacploy is [MIT licensed](./LICENSE)
