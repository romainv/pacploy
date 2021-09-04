const { readFileSync } = require("fs")
const withTracker = require("../../with-tracker")
const statuses = require("../statuses")
const { CloudFormation } = require("../../aws-sdk-proxy")

/**
 * Generate valid arguments to provide to the change set creation request
 * @param {Object} params Additional function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.templatePath The path to the template (can be a URL)
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} params.stackStatus The stack status ('NEW' if doesn't exist)
 * @param {Object} [params.stackParameters] The stack parameters. Values can be
 * provided as a map with ParameterValue (String) and UsePreviousValue (Boolean)
 * or direclty a string which will be interpreted as ParameterValue
 * @param {Object} [params.stackTags] The tags to apply to the stack
 * @return {String} The arn of the change set
 */
async function getChangeSetArgs({
  region,
  templatePath,
  stackName,
  stackStatus,
  stackParameters = {},
  stackTags = {},
}) {
  const cf = new CloudFormation({ apiVersion: "2010-05-15", region })
  // Convert templatePath to a Cloudformation argument
  const templateArg = templatePath.startsWith("http")
    ? { TemplateURL: templatePath }
    : { TemplateBody: readFileSync(templatePath, "utf8") }
  // Retrieving required capabilities and parameters
  const {
    Capabilities,
    Parameters: requiredParameters,
    DeclaredTransforms,
  } = await cf.getTemplateSummary(templateArg)
  // Adjust capabilities when using macros as they're missing
  if (DeclaredTransforms.length > 0) {
    if (!Capabilities.includes("CAPABILITY_AUTO_EXPAND"))
      Capabilities.push("CAPABILITY_AUTO_EXPAND")
    if (!Capabilities.includes("CAPABILITY_IAM"))
      Capabilities.push("CAPABILITY_IAM")
  }
  // Build parameters (change format and filter out unused)
  const Parameters = Object.entries(stackParameters)
    .map(([ParameterKey, ParameterValue]) =>
      Object.assign(
        { ParameterKey },
        // If a value is provided, use it as ParameterValue, otherwise keep the
        // provided map
        typeof ParameterValue === "object" && !Array.isArray(ParameterValue)
          ? ParameterValue
          : {
              ParameterValue:
                // Provided value needs to be passed as a string
                typeof ParameterValue === "string"
                  ? ParameterValue
                  : Array.isArray(ParameterValue)
                  ? ParameterValue.join(",")
                  : JSON.stringify(ParameterValue),
            }
      )
    )
    .filter(
      ({ ParameterKey }) =>
        requiredParameters
          .map(({ ParameterKey }) => ParameterKey) // Required param keys
          .includes(ParameterKey) // Current provided key
    )
  // Build tags (change format)
  const Tags =
    Object.keys(stackTags).length === 0
      ? undefined
      : Object.entries(stackTags).map(([Key, Value]) => ({ Key, Value }))
  // Build a unique name that matches [a-zA-Z][-a-zA-Z0-9]* and has 128
  // characters max
  const ChangeSetName = `${stackName
    .replace(/[^-a-zA-Z0-9]/g, "")
    .substring(0, 100)}-${Date.now()}`
  // Return arguments
  return Object.assign(
    {
      ChangeSetName,
      StackName: stackName,
      Capabilities,
      ChangeSetType: statuses.isNew.includes(stackStatus) ? "CREATE" : "UPDATE",
      Parameters,
      Tags,
    },
    templateArg
  )
}

module.exports = withTracker()(getChangeSetArgs)
