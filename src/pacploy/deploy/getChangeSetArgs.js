import { readFileSync } from "fs"
import { call } from "../throttle.js"
import { isNew as isNewStatuses } from "../statuses.js"
import {
  CloudFormationClient,
  GetTemplateSummaryCommand,
} from "@aws-sdk/client-cloudformation"
import getStatus from "../getStatus/index.js"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Generate valid arguments to provide to the change set creation request
 * @param {import('../params/index.js').ResolvedStackParams} params Stack params
 * @return {Promise<Object>} The arguments to use to create the change set
 */
export default async function getChangeSetArgs({
  region,
  templatePath,
  stackName,
  stackParameters,
  stackTags,
}) {
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  // Convert templatePath to a Cloudformation argument
  const templateArg = templatePath.startsWith("http")
    ? { TemplateURL: templatePath }
    : { TemplateBody: readFileSync(templatePath, "utf8") }
  // Retrieving required capabilities and parameters
  const {
    Capabilities = [],
    Parameters: requiredParameters = [],
    DeclaredTransforms = [],
  } = await call(cf, cf.send, new GetTemplateSummaryCommand(templateArg))
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
            },
      ),
    )
    .filter(
      ({ ParameterKey }) =>
        requiredParameters
          .map(({ ParameterKey }) => ParameterKey) // Required param keys
          .includes(ParameterKey), // Current provided key
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
  // Check if stack is new
  const isNew = isNewStatuses.includes(await getStatus({ region, stackName }))
  // Return arguments
  return Object.assign(
    {
      ChangeSetName,
      StackName: stackName,
      Capabilities,
      ChangeSetType: isNew ? "CREATE" : "UPDATE",
      Parameters,
      Tags,
    },
    templateArg,
  )
}
