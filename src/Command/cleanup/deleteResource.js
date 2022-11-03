import withTracker from "../../with-tracker/index.js"
import { call } from "../throttle.js"
import emptyBucket from "./emptyBucket.js"
import getResourceName from "./getResourceName.js"
import supported from "./supported.js"
import { S3Client, DeleteBucketCommand } from "@aws-sdk/client-s3"
import { DynamoDBClient, DeleteTableCommand } from "@aws-sdk/client-dynamodb"
import {
  CognitoIdentityProviderClient,
  UntagResourceCommand as UntagIdentityProviderCommand,
  ListTagsForResourceCommand as ListTagsForIdentityProviderCommand,
  DeleteUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider"
import {
  CognitoIdentityClient,
  ListTagsForResourceCommand as ListTagsForCognitoPoolCommand,
  UntagResourceCommand as UntagCognitoPoolCommand,
  DeleteIdentityPoolCommand,
} from "@aws-sdk/client-cognito-identity"
import { AthenaClient, DeleteWorkGroupCommand } from "@aws-sdk/client-athena"
import { ECRClient, DeleteRepositoryCommand } from "@aws-sdk/client-ecr"

/**
 * Delete a resource given its ARN, with support for cleaning up that resource
 * first in case it needs to
 * @param {Object} params The function parameters
 * @param {String} params.region The resource's region
 * @param {String} params.arn The arn of the resource
 * @return {Boolean|String} True if the deletion succeeded, otherwise the error
 * message, or false
 */
async function deleteResource({ region, arn }) {
  const s3 = new S3Client({ apiVersion: "2006-03-01", region })
  const db = new DynamoDBClient({ apiVersion: "2012-08-10", region })
  const userPool = new CognitoIdentityProviderClient({
    apiVersion: "2016-04-18",
    region,
  })
  const identityPool = new CognitoIdentityClient({
    apiVersion: "2014-06-30",
    region,
  })
  const athena = new AthenaClient({ apiVersion: "2017-05-18", region })
  const ecr = new ECRClient({ apiVersion: "2015-09-21", region })
  // Retrieve resource type and name
  const resourceType = arn.split(":")[2]
  let resourceName = getResourceName(arn)
  // Delete resource based on its type
  try {
    if (Object.keys(supported).includes(resourceType)) {
      // If resource type is supported (this double check is to ensure
      // alignment with the listStackResources function that should list
      // live resources to prevent them from being deleted)
      switch (resourceType) {
        // S3 buckets
        case "s3":
          await emptyBucket.call(this, { bucket: resourceName })
          await call(
            s3,
            s3.send,
            new DeleteBucketCommand({ Bucket: resourceName })
          )
          return true
        // ECR repos
        case "ecr":
          await call(
            ecr,
            ecr.send,
            new DeleteRepositoryCommand({
              repositoryName: resourceName,
              force: true,
            })
          )
          return true
        // DynamoDB tables
        case "dynamodb":
          await call(
            db,
            db.send,
            new DeleteTableCommand({ TableName: resourceName })
          )
          return true
        // User pools
        case "cognito-idp":
          try {
            // Start by removing tags as this is not automatic
            await call(
              userPool,
              userPool.send,
              new UntagIdentityProviderCommand({
                ResourceArn: arn,
                TagKeys: Object.keys(
                  await call(
                    userPool,
                    userPool.send,
                    new ListTagsForIdentityProviderCommand({ ResourceArn: arn })
                  )
                ),
              })
            )
            await call(
              userPool,
              userPool.send,
              new DeleteUserPoolCommand({ UserPoolId: resourceName })
            )
          } catch (err) {
            if (err.code === "ResourceNotFoundException") {
              // If the cognito pool was not found (this happens as the pool may
              // be deleted but not the tag, which is why we're trying to delete
              // it)
              this.tracker.interruptInfo(
                `user pool ${resourceName} already deleted`
              )
              return true
            } else throw err
          }
          return true
        // Identity pools
        case "cognito-identity":
          try {
            // Start by removing tags as this is not automatic
            await call(
              identityPool,
              identityPool.send,
              new UntagCognitoPoolCommand({
                ResourceArn: arn,
                TagKeys: Object.keys(
                  await call(
                    identityPool,
                    identityPool.send,
                    new ListTagsForCognitoPoolCommand({
                      ResourceArn: arn,
                    })
                  )
                ),
              })
            )
            await call(
              identityPool,
              identityPool.send,
              new DeleteIdentityPoolCommand({
                IdentityPoolId: resourceName,
              })
            )
          } catch (err) {
            if (err.code === "ResourceNotFoundException") {
              // If the cognito pool was not found (this happens as the pool may
              // be deleted but not the tag, which is why we're trying to delete
              // it)
              this.tracker.interruptInfo(
                `identity pool ${resourceName} already deleted`
              )
              return true
            } else throw err
          }
          return true
        // Athena workgroup
        case "athena":
          await call(
            athena,
            athena.send,
            new DeleteWorkGroupCommand({
              WorkGroup: resourceName,
              // Delete any named queries or query executions
              RecursiveDeleteOption: true,
            })
          )
          return true
        // Unhandled resource type
        default:
          return false
      }
    }
  } catch (err) {
    return err.message
  }
}

export default withTracker()(deleteResource)
