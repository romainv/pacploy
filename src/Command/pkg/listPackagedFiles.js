import { call } from "../throttle.js"
import ResourceProperty from "./ResourceProperty.js"
import parseRemoteTemplate from "./parseRemoteTemplate.js"
import {
  CloudFormationClient,
  GetTemplateCommand,
} from "@aws-sdk/client-cloudformation"
import md5 from "./md5.js"

/**
 * Retrieve the list of files that were packaged to S3 and are being used by
 * the supplied stack, including the stack's own template
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.deployBucket] The bucket to which the stack's
 * template was packaged. This is only used for the root template, all other
 * resources will include the reference to the bucket to which they were
 * packaged
 * @return {Promise<Array>} The {Bucket, Key} of packaged files
 */
export default async function listPackagedFiles({
  region,
  stackName,
  deployBucket,
}) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  const packaged = []
  // Retrieve the template of the provided stack
  const { TemplateBody } = await call(
    cf,
    cf.send,
    new GetTemplateCommand({
      StackName: stackName,
      TemplateStage: "Processed",
    })
  )
  if (deployBucket) {
    // If the template's deployBucket was passed, recalculate its key as it is
    // not linked to the stack anymore and add it to the list
    const { TemplateBody: originalContent } = await call(
      cf,
      cf.send,
      new GetTemplateCommand({
        StackName: stackName,
        // Use the original content as it was used to calculate the hash
        TemplateStage: "Original",
      })
    )
    packaged.push({
      Bucket: deployBucket,
      Key: `${await md5(originalContent)}.yaml`,
    })
  }
  // Recursively retrieve the template's packaged resources
  await parseRemoteTemplate({
    region,
    templateBody: TemplateBody,
    fn: ({ resourceType, propName, propValue }) => {
      const resourceProp = new ResourceProperty(
        resourceType,
        propName,
        propValue
      )
      if (resourceProp.packaged.S3) {
        // If current resource has files packaged to S3
        for (const { Bucket, Key } of resourceProp.packaged.S3) {
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
