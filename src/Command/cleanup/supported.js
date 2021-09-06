// This lists the resource types which are supported to be deleted
// It maps the resource type as used in deleteResource.js to the
// corresponding CloudFormation type as used in listStackResources
export default {
  s3: "AWS::S3::Bucket",
  dynamodb: "AWS::DynamoDB::Table",
  "cognito-idp": "AWS::Cognito::UserPool",
  "cognito-identity": "AWS::Cognito::IdentityPool",
  athena: "AWS::Athena::WorkGroup",
  ecr: "AWS::ECR::Repository",
}
