const withTracker = require("../../with-tracker")
const ResourceProperty = require("./ResourceProperty")
const parseRemoteTemplate = require("./parseRemoteTemplate")
const { CloudFormation } = require("../../aws-sdk-proxy")

/**
 * Retrieve the list of files that were packaged to S3 and are being used by
 * the supplied stack
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @return {Array} The {Bucket, Key} of packaged files
 */
async function listPackagedFiles({ region, stackName }) {
  const cf = new CloudFormation({ apiVersion: "2010-05-15", region })
  // Retrieve the template of the provided stack
  const { TemplateBody } = await cf.getTemplate({
    StackName: stackName,
    TemplateStage: "Processed",
  })
  const packaged = []
  await parseRemoteTemplate.call(this, {
    region,
    templateBody: TemplateBody,
    fn: ({ resourceType, propName, propValue }) => {
      const resourceProp = new ResourceProperty(
        resourceType,
        propName,
        propValue
      )
      if (resourceProp.toPackage.S3) {
        // If current resource has files packaged to S3
        for (const { Bucket, Key } of resourceProp.toPackage.S3) {
          if (
            !packaged.reduce(
              (res, { Bucket: curBucket, Key: curKey }) =>
                res || (Bucket === curBucket && Key === curKey),
              false
            )
          )
            // If current resource was not identified yet, add it to the list
            packaged.push({ Bucket, Key })
        }
      }
    },
  })
  return packaged
}

module.exports = withTracker()(listPackagedFiles)
