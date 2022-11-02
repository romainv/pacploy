import { readFileSync } from "fs"
import withTracker from "../../with-tracker/index.js"
import { call } from "../../throttle.js"
import {
  CloudFormationClient,
  ValidateTemplateCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Validate a local template
 * @param {Object} params Additional function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.templatePath The path to the template
 * @return {Boolean|String} True if the validation succeeded, or the error
 * message otherwise
 */
async function validate({ region, templatePath }) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  this.tracker.setStatus("validating template")
  let validation
  try {
    await call(
      cf.send,
      new ValidateTemplateCommand({
        // Open template as string
        TemplateBody: readFileSync(templatePath, "utf8"),
      })
    )
    validation = true
  } catch (err) {
    validation = err.message
  }
  if (validation !== true)
    this.tracker.interruptError(
      `failed to validate template ${templatePath}: ${validation}`
    )
  return validation
}

export default withTracker()(validate)
