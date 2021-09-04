const withTracker = require("../../with-tracker")
const { CloudFormation } = require("../../aws-sdk-proxy")

/**
 * Retrieve outputs of a deployed stack
 * @param {Object} params Function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @return {Object} An object containing the stack information
 */
async function getStackInfo({ region, stackName }) {
  const cf = new CloudFormation({ apiVersion: "2010-05-15", region })
  // Retrieve stack outputs
  const {
    Stacks: [{ Outputs }],
  } = await cf.describeStacks({ StackName: stackName })
  // Serialize the output format
  return Outputs.reduce(
    (res, val) => Object.assign(res, { [val.OutputKey]: val.OutputValue }),
    {}
  )
}

module.exports = withTracker()(getStackInfo)
