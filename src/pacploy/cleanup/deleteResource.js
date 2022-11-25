import { call } from "../throttle.js"
import emptyBucket from "./emptyBucket.js"
import getResourceName from "./getResourceName.js"
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
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Delete a resource given its ARN, with support for cleaning up that resource
 * first in case it needs to
 * @param {Object} params The function parameters
 * @param {String} params.region The resource's region
 * @param {String} params.arn The arn of the resource
 * @return {Promise<[Boolean, String]>} A tuple with the status of the deletion
 * (true if it succeeded, false otherwise), and the error message if any
 */
export default async function deleteResource({ region, arn }) {
  // Retrieve resource type and name
  const resourceType = arn.split(":")[2]
  const resourceName = getResourceName(arn)
  if (typeof resourceName !== "string")
    return [false, `Unable to parse resource name from arn ${arn}`]
  if (!Object.keys(supported).includes(resourceType))
    return [false, `Unsupported resource type: ${resourceType}`]

  // Delete resource based on its type
  try {
    const deleteFunction = deleteFunctions[supported[resourceType]]
    await deleteFunction(region, resourceName, arn)
    return [true, ""]
  } catch (err) {
    return [false, err.message]
  }
}

// This lists the resource types which are supported to be deleted
// It maps the resource type as used in the deleteResource function to the
// CloudFormation resource type
export const supported = {
  s3: "AWS::S3::Bucket",
  dynamodb: "AWS::DynamoDB::Table",
  "cognito-idp": "AWS::Cognito::UserPool",
  "cognito-identity": "AWS::Cognito::IdentityPool",
  athena: "AWS::Athena::WorkGroup",
  ecr: "AWS::ECR::Repository",
}

// Map the supported CloudFormation resource types to the corresponding
// delete function
const deleteFunctions = {
  "AWS::S3::Bucket": deleteS3Bucket,
  "AWS::DynamoDB::Table": deleteDDBTable,
  "AWS::Cognito::UserPool": deleteCognitoUserPool,
  "AWS::Cognito::IdentityPool": deleteCognitoIdentityPool,
  "AWS::Athena::WorkGroup": deleteAthenaWorkgroup,
  "AWS::ECR::Repository": deleteECR,
}

/**
 * Delete a S3 repo
 * @param {String} region The bucket's region
 * @param {String} bucket The bucket's name
 */
async function deleteS3Bucket(region, bucket) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })
  await emptyBucket({ region, bucket })
  await call(
    s3,
    s3.send,
    new DeleteBucketCommand({
      Bucket: bucket,
      credentialDefaultProvider,
      credentialDefaultProvider,
    })
  )
}

/**
 * Delete an ECR image repository
 * @param {String} region The repository's region
 * @param {String} repositoryName The repository's name
 */
async function deleteECR(region, repositoryName) {
  const ecr = new ECRClient({
    apiVersion: "2015-09-21",
    region,
    credentialDefaultProvider,
  })
  await call(
    ecr,
    ecr.send,
    new DeleteRepositoryCommand({ repositoryName, force: true })
  )
}

/**
 * Delete a DynamoDB table
 * @param {String} region The table's region
 * @param {String} tableName The table's name
 */
async function deleteDDBTable(region, tableName) {
  const db = new DynamoDBClient({
    apiVersion: "2012-08-10",
    region,
    credentialDefaultProvider,
  })
  await call(db, db.send, new DeleteTableCommand({ TableName: tableName }))
}

/**
 * Delete a Cognito user pool
 * @param {String} region The user pool's region
 * @param {String} userPoolId The user pool's id
 * @param {String} arn The user pool's arn
 */
async function deleteCognitoUserPool(region, userPoolId, arn) {
  const userPool = new CognitoIdentityProviderClient({
    apiVersion: "2016-04-18",
    region,
    credentialDefaultProvider,
  })
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
      new DeleteUserPoolCommand({ UserPoolId: userPoolId })
    )
  } catch (err) {
    if (err.code !== "ResourceNotFoundException")
      // Ignore if the cognito pool was not found (this happens as the pool may
      // be deleted but not the tag, which is why we're trying to delete
      // it)
      throw err
  }
}

/**
 * Delete a Cognito Identity pool
 * @param {String} region The identity pool's region
 * @param {String} identityPoolId The identity pool's id
 * @param {String} arn The identity pool's arn
 */
async function deleteCognitoIdentityPool(region, identityPoolId, arn) {
  const identityPool = new CognitoIdentityClient({
    apiVersion: "2014-06-30",
    region,
    credentialDefaultProvider,
  })
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
        IdentityPoolId: identityPoolId,
      })
    )
  } catch (err) {
    if (err.code !== "ResourceNotFoundException")
      // Ignore if the cognito pool was not found (this happens as the pool may
      // be deleted but not the tag, which is why we're trying to delete
      // it)
      throw err
  }
}

/**
 * Delete an Athena workgroup
 * @param {String} region The workgroup's region
 * @param {String} workgroup The workgroup's name
 */
async function deleteAthenaWorkgroup(region, workgroup) {
  const athena = new AthenaClient({
    apiVersion: "2017-05-18",
    region,
    credentialDefaultProvider,
  })
  await call(
    athena,
    athena.send,
    new DeleteWorkGroupCommand({
      WorkGroup: workgroup,
      // Delete any named queries or query executions
      RecursiveDeleteOption: true,
    })
  )
}
