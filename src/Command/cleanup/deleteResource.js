const withTracker = require("../../with-tracker")
const emptyBucket = require("./emptyBucket")
const getResourceName = require("./getResourceName")
const supported = require("./supported")
const {
  S3,
  DynamoDB,
  CognitoIdentityServiceProvider,
  CognitoIdentity,
  Athena,
  ECR,
} = require("../../aws-sdk-proxy")

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
  const s3 = new S3({ apiVersion: "2006-03-01", region })
  const db = new DynamoDB({ apiVersion: "2012-08-10", region })
  const userPool = new CognitoIdentityServiceProvider({
    apiVersion: "2016-04-18",
    region,
  })
  const identityPool = new CognitoIdentity({ apiVersion: "2014-06-30", region })
  const athena = new Athena({ apiVersion: "2017-05-18", region })
  const ecr = new ECR({ apiVersion: "2015-09-21", region })
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
          await s3.deleteBucket({ Bucket: resourceName })
          return true
        // ECR repos
        case "ecr":
          await ecr.deleteRepository({
            repositoryName: resourceName,
            force: true,
          })
          return true
        // DynamoDB tables
        case "dynamodb":
          await db.deleteTable({ TableName: resourceName })
          return true
        // User pools
        case "cognito-idp":
          try {
            // Start by removing tags as this is not automatic
            // FIXME: Tags don't seem to be removed
            await userPool.untagUserPool({
              ResourceArn: arn,
              TagKeys: Object.keys(
                await userPool.listTagsForUserPool({ ResourceArn: arn })
              ),
            })
            await userPool.deleteUserPool({ UserPoolId: resourceName })
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
        // FIXME: Tags don't seem to be removed
        case "cognito-identity":
          try {
            // Start by removing tags as this is not automatic
            await identityPool.untagIdentityPool({
              ResourceArn: arn,
              TagKeys: Object.keys(
                await identityPool.listTagsForIdentityPool({ ResourceArn: arn })
              ),
            })
            await identityPool.deleteIdentityPool({
              IdentityPoolId: resourceName,
            })
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
          await athena.deleteWorkGroup({
            WorkGroup: resourceName,
            // Delete any named queries or query executions
            RecursiveDeleteOption: true,
          })
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

module.exports = withTracker()(deleteResource)
