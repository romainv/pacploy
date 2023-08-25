import tracker from "../tracker.js"
import { call } from "../throttle.js"
import { supported } from "./deleteResource.js"
import {
  CloudFormationClient,
  ListStackResourcesCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Retrieve the resources associated with a live stack, recursively for nested
 * stacks. This is limited to the resources which are supported to be deleted
 * @param {Object} params The function parameters
 * @param {String} params.region The stack region
 * @param {String} params.stackName The name of the deployed stack
 * @param {String} [params.nextToken] The pagination token, if any
 * @return {Promise<String[]>} The list of resource arns
 */
export default async function listLiveResourceArns({
  region,
  stackName,
  nextToken,
}) {
  const cf = new CloudFormationClient({
    apiVersion: "2010-05-15",
    region,
    credentialDefaultProvider,
  })
  tracker.setStatus("retrieving stack resources")
  // Retrieve list of resources for the current stack
  const { StackResourceSummaries = [], NextToken } = await call(
    cf,
    cf.send,
    new ListStackResourcesCommand({
      StackName: stackName,
      NextToken: nextToken,
    }),
  )
  // Retrieve region and account ID from the current stack arn
  const { Stacks: [{ StackId }] = [] } = await call(
    cf,
    cf.send,
    new DescribeStacksCommand({ StackName: stackName }),
  )
  const accountId = StackId.split(":")[4]
  // Extract the resources arns, including those in nested stacks
  // Start with the current stack id
  const resources = [StackId].concat(
    await StackResourceSummaries.reduce(
      async (
        res,
        { ResourceType: resourceType, PhysicalResourceId: physicalResourceId },
      ) => {
        res = await res // Retrieve current value, as this is an async reducer
        if (resourceType === "AWS::CloudFormation::Stack")
          // If current resource is a nested stack
          res = res.concat(
            await listLiveResourceArns({
              region,
              stackName: physicalResourceId,
            }),
          )
        else if (Object.values(supported).includes(resourceType))
          // If the resource is supported to be deleted. We ignore other
          // resources to avoid having to list all resource types that
          // don't support Tags (see default case below)
          res.push(
            getResourceArn({
              resourceType,
              physicalResourceId,
              accountId,
              region,
            }),
          )
        return res
      },
      Promise.resolve([]),
    ),
  )
  // If resources span multiple pages, recursively retrieve them
  return NextToken
    ? resources.concat(
        await listLiveResourceArns({
          region,
          stackName,
          nextToken: NextToken,
        }),
      )
    : resources
}

/**
 * Generate the ARN of a resource
 * @param {Object} params The parameters required to generate the ARN
 * @param {String} params.resourceType The resource type
 * @param {String} params.physicalResourceId The resource's PhysicalResourceId
 * @param {String} params.accountId The AWS account id
 * @param {String} params.region The resource's region
 * @return {String} The ARN
 */
function getResourceArn({
  resourceType,
  physicalResourceId,
  accountId,
  region,
}) {
  switch (resourceType) {
    // Build arn from the physical id
    case "AWS::IAM::Role":
      return `arn:aws:iam::${accountId}:role/${physicalResourceId}`
    case "AWS::Lambda::Function":
      return `arn:aws:lambda:${region}:${accountId}:function:${physicalResourceId}`
    case "AWS::Cognito::IdentityPool":
      return `arn:aws:cognito-identity:${region}:${accountId}:identitypool/${physicalResourceId}`
    case "AWS::Cognito::UserPool":
      return `arn:aws:cognito-idp:${region}:${accountId}:userpool/${physicalResourceId}`
    case "AWS::S3::Bucket":
      return `arn:aws:s3:::${physicalResourceId}`
    case "AWS::DynamoDB::Table":
      return `arn:aws:dynamodb:${region}:${accountId}:table/${physicalResourceId}`
    case "AWS::CloudFront::Distribution":
      return `arn:aws:cloudfront::${accountId}:distribution/${physicalResourceId}`
    case "AWS::SQS::Queue":
      return physicalResourceId.replace(
        `https://sqs.${region}.amazonaws.com/${accountId}/`,
        `arn:aws:sqs:${region}:${accountId}:`,
      )
    case "AWS::Events::Rule":
      return `arn:aws:events:${region}:${accountId}:rule/${physicalResourceId}`
    case "AWS::Athena::WorkGroup":
      return `arn:aws:athena:${region}:${accountId}:workgroup/${physicalResourceId}`
    case "AWS::ECR::Repository":
      return `arn:aws:ecr:${region}:${accountId}:repository/${physicalResourceId}`
    default:
      if (physicalResourceId.startsWith("arn"))
        // If resource id is already in arn format
        return physicalResourceId
      // If resource is not recognized and may be deleted as it won't
      // be excluded from the list of retained resources
      else
        throw new Error(
          `The arn of resource ${resourceType}` +
            ` ${physicalResourceId} could not be generated and the` +
            ` resource would be deleted inadvertently`,
        )
  }
}
