const { readFileSync } = require("fs")
const withTracker = require("../../with-tracker")
const { CloudFormation } = require("../../aws-sdk-proxy")

/**
 * Validate a local template
 * @param {Object} params Additional function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.templatePath The path to the template
 * @return {Boolean|String} True if the validation succeeded, or the error
 * message otherwise
 */
async function validate({ region, templatePath }) {
  const cf = new CloudFormation({ apiVersion: "2010-05-15", region })
  this.tracker.setStatus("validating template")
  let validation
  try {
    await cf.validateTemplate({
      // Open template as string
      TemplateBody: readFileSync(templatePath, "utf8"),
    })
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

module.exports = withTracker()(validate)
