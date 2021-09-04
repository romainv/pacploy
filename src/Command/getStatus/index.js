const withTracker = require("../../with-tracker")
const { CloudFormation } = require("../../aws-sdk-proxy")

/**
 * Retrieve the status of a stack
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {Boolean} [params.quiet=true] Whether to display stack status
 */
async function getStatus({ region, stackName, quiet = true }) {
  const cf = new CloudFormation({ apiVersion: "2010-05-15", region })
  let status
  // Retrieve basic stack information, separating serialized values
  this.tracker.setStatus("retrieving stack status")
  try {
    const {
      Stacks: [{ StackStatus }],
    } = await cf.describeStacks({ StackName: stackName })
    status = StackStatus
  } catch (err) {
    // Capture case when stack doesn't exist as a specific status
    if (err.message.indexOf("does not exist") >= 0) status = "NEW"
    else throw err
  }
  if (!quiet)
    this.tracker.interruptInfo(`stack '${stackName}' is in status ${status}`)
  return status
}

module.exports = withTracker()(getStatus)
