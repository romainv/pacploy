import { call } from "../throttle.js"
import supported from "./supported.js"
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from "@aws-sdk/client-resource-groups-tagging-api"

/**
 * Retrieve remaining resources based on their tags. This allows to identify
 * existing resources with conflicting name created by the stack, but it
 * doesn't capture name-conflicting resources created outside of the stack
 * An alternative (less efficient) would be to recursively parse the deleted
 * stack template and select resources set to 'Retain', then retrieve their
 * physical id. This doesn't enable to identify existing resources with
 * conflicting name
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {Array} [params.exclude] A list of resource ARNs to exclude
 * @param {String} [params.nextToken] The pagination token, if any
 * @return {Promise<Array>} The list of remaining resource ARNs
 */
export default async function listRetainedResources({
  region,
  stackName,
  exclude = [],
  nextToken,
}) {
  const rg = new ResourceGroupsTaggingAPIClient({
    apiVersion: "2017-01-26",
    region,
  })
  // Retrieve list of resources with the matching RootStackName tag
  const { ResourceTagMappingList = [], PaginationToken } = await call(
    rg,
    rg.send,
    new GetResourcesCommand({
      PaginationToken: nextToken,
      TagFilters: [{ Key: "RootStackName", Values: [stackName] }],
    })
  )
  // Extract resources ARN
  const resources = ResourceTagMappingList.map(
    ({ ResourceARN }) => ResourceARN
  ).filter(
    (arn) =>
      // Exclude resources that were explicitely requested to be excluded, or
      // whose type is not supported for deletion
      !exclude.includes(arn) &&
      Object.keys(supported).includes(arn.split(":")[2])
  )
  // If resources span multiple pages, recursively retrieve them
  return PaginationToken
    ? resources.concat(
        await listRetainedResources({
          region,
          stackName,
          nextToken: PaginationToken,
          exclude,
        })
      )
    : resources
}
