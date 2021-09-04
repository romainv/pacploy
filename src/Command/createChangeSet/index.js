const withTracker = require("../../with-tracker")
const statuses = require("../statuses")
const getChangeSetArgs = require("./getChangeSetArgs")
const waitForStatus = require("../waitForStatus")
const deleteChangeSets = require("../deleteChangeSets")
const { CloudFormation } = require("../../aws-sdk-proxy")

/**
 * Create a change set for the supplied stack
 * @param {Object} params Function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.templatePath The path to the template (can be a URL)
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} params.stackStatus The stack status ('NEW' if doesn't exist)
 * @param {Object} [params.stackParameters] The stack parameters. Values can be
 * provided as a map with ParameterValue (String) and UsePreviousValue (Boolean)
 * or direclty a string which will be interpreted as ParameterValue
 * @param {Object} [params.stackTags] The tags to apply to the stack
 * @param {Boolean} [params.quiet=false] If true, will not update status
 * @param {Number} [params.attempts=0] Keep track of attempts to avoid infinite
 * recursions
 * @return {Object} The arn of the change set and whether it contains any
 * changes
 */
async function createChangeSet({
  region,
  templatePath,
  stackName,
  stackStatus,
  stackParameters = {},
  stackTags = {},
  quiet = false,
  attempts = 0,
}) {
  const cf = new CloudFormation({ apiVersion: "2010-05-15", region })
  if (!quiet) this.tracker.setStatus("creating change set")
  // Retrieve creation arguments
  const args = await getChangeSetArgs.call(this, {
    region,
    templatePath,
    stackName,
    stackStatus,
    stackParameters,
    stackTags,
  })
  // Create the requested change set
  let changeSetArn
  try {
    ;({ Id: changeSetArn } = await cf.createChangeSet(args))
  } catch (err) {
    if (
      err.code === "LimitExceededException" &&
      err.message.startsWith("ChangeSet limit exceeded")
    ) {
      // If we reach the limit of change sets allowed for the current stack
      this.tracker.interruptWarn(err.message)
      // Delete change sets
      await deleteChangeSets.call(this, { region, stackName })
      // Try again if less than 3 attempts
      if (attempts < 3)
        return createChangeSet.call(this, {
          region,
          templatePath,
          stackName,
          stackStatus,
          stackParameters,
          stackTags,
          quiet,
          attempts: attempts + 1,
        })
      else throw err // Fail if too many attempts
    } else throw err // Unrecognized error
  }
  // Wait for the change set to be created
  const res = await waitForStatus.call(this, {
    region,
    arn: changeSetArn,
    success: statuses.createSuccess,
    failure: statuses.createFailed,
    msg: "",
  })
  let hasChanges = true // Indicate whether the stack has any changes
  if (res !== true) {
    // If status is not successful
    if (
      res.includes("The submitted information didn't contain changes") ||
      res.includes("No updates are to be performed.")
    ) {
      this.tracker.interruptInfo(`Stack ${stackName} is up-to-date`)
      hasChanges = false
      // Failure is expected if there are no changes
    } else {
      // If an actual error occured
      this.tracker.interruptError(
        `Failed to create change set for ${stackName}`
      )
      throw new Error(res)
    }
  }
  return { changeSetArn, hasChanges }
}

module.exports = withTracker()(createChangeSet)
