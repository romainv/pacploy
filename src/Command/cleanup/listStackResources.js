import withTracker from "../../with-tracker/index.js"
import { call } from "../../throttle.js"
import supported from "./supported.js"
import {
  CloudFormationClient,
  ListStackResourcesCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Retrieve the resources associated with a live stack, recursively for nested
 * stacks. This is limited to the resources which are supported to be deleted
 * @param {Object} params The function parameters
 * @param {String} params.region The stack region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.nextToken] The pagination token, if any
 * @return {Array} The list of resource arns
 */
async function listStackResources({ region, stackName, nextToken }) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  this.tracker.setStatus("retrieving stack resources")
  // Retrieve list of resources for the current stack
  const { StackResourceSummaries, NextToken } = await call(
    cf.send,
    new ListStackResourcesCommand({
      StackName: stackName,
      NextToken: nextToken,
    })
  )
  // Retrieve region and account ID from the current stack arn
  const {
    Stacks: [{ StackId }],
  } = await call(cf.send, new DescribeStacksCommand({ StackName: stackName }))
  const accountId = StackId.split(":")[4]
  // Extract the resources arns, including those in nested stacks
  // Start with the current stack id
  const resources = [StackId].concat(
    await StackResourceSummaries.reduce(
      async (res, { ResourceType, PhysicalResourceId }) => {
        res = await res // Retrieve current value, as this is an async reducer
        if (ResourceType === "AWS::CloudFormation::Stack") {
          // If current resource is a nested stack
          res = res.concat(
            await listStackResources.call(this, {
              region,
              stackName: PhysicalResourceId,
            })
          )
        } else {
          if (Object.values(supported).includes(ResourceType)) {
            // If the resource is supported to be deleted (we ignore other
            // resources to avoid having to list all resource types that
            // don't support Tags (see default case below)
            switch (ResourceType) {
              // Build arn from the physical id
              case "AWS::IAM::Role":
                res.push(`arn:aws:iam::${accountId}:role/${PhysicalResourceId}`)
                break
              case "AWS::Lambda::Function":
                res.push(
                  `arn:aws:lambda:${region}:${accountId}:function:${PhysicalResourceId}`
                )
                break
              case "AWS::Cognito::IdentityPool":
                res.push(
                  `arn:aws:cognito-identity:${region}:${accountId}:identitypool/${PhysicalResourceId}`
                )
                break
              case "AWS::Cognito::UserPool":
                res.push(
                  `arn:aws:cognito-idp:${region}:${accountId}:userpool/${PhysicalResourceId}`
                )
                break
              case "AWS::S3::Bucket":
                res.push(`arn:aws:s3:::${PhysicalResourceId}`)
                break
              case "AWS::DynamoDB::Table":
                res.push(
                  `arn:aws:dynamodb:${region}:${accountId}:table/${PhysicalResourceId}`
                )
                break
              case "AWS::CloudFront::Distribution":
                res.push(
                  `arn:aws:cloudfront::${accountId}:distribution/${PhysicalResourceId}`
                )
                break
              case "AWS::SQS::Queue":
                res.push(
                  PhysicalResourceId.replace(
                    `https://sqs.${region}.amazonaws.com/${accountId}/`,
                    `arn:aws:sqs:${region}:${accountId}:`
                  )
                )
                break
              case "AWS::Events::Rule":
                res.push(
                  `arn:aws:events:${region}:${accountId}:rule/${PhysicalResourceId}`
                )
                break
              case "AWS::Athena::WorkGroup":
                res.push(
                  `arn:aws:athena:${region}:${accountId}:workgroup/${PhysicalResourceId}`
                )
                break
              default:
                if (PhysicalResourceId.startsWith("arn"))
                  // If resource id is already in arn format
                  res.push(PhysicalResourceId)
                // If resource is not recognized and may be deleted as it won't
                // be excluded from the list of retained resources
                else
                  throw new Error(
                    `The arn of resource ${ResourceType} ${PhysicalResourceId} could not be generated and the resource would be deleted inadvertently`
                  )
            }
          }
        }
        return res
      },
      Promise.resolve([])
    )
  )
  // If resources span multiple pages, recursively retrieve them
  return NextToken
    ? resources.concat(
        await listStackResources.call(this, {
          region,
          stackName,
          nextToken: NextToken,
        })
      )
    : resources
}

export default withTracker()(listStackResources)
