import tracker from "../tracker.js"
import { readFileSync } from "fs"
import { call } from "../throttle.js"
import {
  CloudFormationClient,
  ValidateTemplateCommand,
} from "@aws-sdk/client-cloudformation"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Validate a local template
 * @param {Object} params Additional function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.templatePath The path to the template
 * @return {Promise<Boolean|String>} True if the validation succeeded, or the
 * error message otherwise
 */
export default async function validate({ region, templatePath }) {
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  try {
    await call(
      cf,
      cf.send,
      new ValidateTemplateCommand({
        // Open template as string
        TemplateBody: readFileSync(templatePath, "utf8"),
      })
    )
    return true
  } catch (err) {
    tracker.interruptError(`failed to validate template ${templatePath}`)
    throw err
  }
}
