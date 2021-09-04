module.exports = getResourceName

/**
 * Extract the resource name from its arn
 * @param {String} arn The resource arn
 * @return {String} The resource name
 */
function getResourceName(arn) {
  let destruct
  // Check the third component of arn:aws:<type>:...
  switch (arn.split(":")[2]) {
    case "s3": // S3 bucket name is after the ':::'
      return /.*:::(?<name>.+)$/.exec(arn).groups.name
    case "ecr": // ECR repo name is after :repository/
      return /arn:.*:repository\/(?<name>[^/]+)$/.exec(arn).groups.name
    case "dynamodb": // Table name is the last arn component
      destruct = arn.split(":")
      return /table\/(?<name>[^:/]*).*$|/.exec(destruct[destruct.length - 1])
        .groups.name
    case "lambda": // Function name is after :function:
      return /.*:function:(?<name>[^:]+)(:[^:]+)*$/.exec(arn).groups.name
    case "cognito-idp": // Userpool name is after :userpool/
      return /arn:.*:userpool\/(?<name>[^/]+)$/.exec(arn).groups.name
    case "cognito-identity": // IdentityPool id is after :identitypool/
      return /arn:.*:identitypool\/(?<name>[^/]+)$/.exec(arn).groups.name
    case "athena": // Workgroup name is after workgroup/
      return /arn:.*:workgroup\/(?<name>[^/]+)$/.exec(arn).groups.name
    default:
      // Unsupported type
      return false
  }
}
