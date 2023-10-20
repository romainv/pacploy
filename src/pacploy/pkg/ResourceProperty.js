import { readFileSync } from "fs"

/**
 * Represents a Cloudformation resource property to understand its current
 * packaging status
 */
export default class ResourceProperty {
  /**
   * Instantiate the class
   * @param {String} resourceType The resource Type
   * @param {String} propName The property name
   * @param {String} propValue The property value
   */
  constructor(resourceType, propName, propValue) {
    // Record the arguments
    this.resourceType = resourceType
    this.propName = propName
    this.propValue = propValue
    // Retrieve the packing properties, if the resource property is supported
    const packingDef = packingList[`${resourceType}.${propName}`]
    this.toPackage = packingDef ? packingDef.toPackage(this.propValue) : {}
    this.packaged = packingDef ? packingDef.packaged(this.propValue) : {}
    this.updatePropValue = (locations) =>
      packingDef.update(this.propValue, locations)
  }
}

// Define the list of arguments to package for the DefaultArguments property of
// the AWS::Glue::Job resource
const awsGlueJobDefaultArgumentsToPackage = [
  "--scriptLocation",
  "--extra-jars",
  "--extra-files",
  "--extra-py-files",
]

// Define the list of resourceType/properties that should be packaged. The
// object keys are composed by the CloudFormation resourceType followed by the
// property name (dot-separated). The property name is the first-level only
// (i.e. not a nested property)
// For each resource, we define the following information, nested under the
// corresponding destination where the resource should be packaged (e.g. S3,
// ECR):
// 	- toPackage: A function that takes the template's property value and
// 		returns the local files to package. They should be grouped in an object
// 		with their destination as the primary key (e.g. S3, ECR) and listed by
// 		their local path. E.g. { S3: [<local path>,...] }
// 	- update: a function to update the template's property value with the
// 		location of the packaged resources. The function takes the current
// 		template's property value as first argument, and the files packaged for
// 		this resource (passed as a mapping between the relative path as defined
// 		in the template to the location of the packaged file), and returns the
// 		new value to update in the template
// 	- packaged: a function to retrieve the list of packaged files for the
// 		corresponding resource. It takes the current property value and returns a
// 		dictionary whose keys are the destination (e.g. S3, ECR) and the values
// 		are a list of parsed locations ({Bucket, Key} for S3, uri for ECR)
const packingList = {
  "AWS::ApiGateway::RestApi.BodyS3Location": {
    toPackage: (propValue) =>
      typeof propValue === "string" ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      propValue.Bucket && propValue.Key ? { S3: [propValue] } : {},
    update: (propValue, { [propValue]: location }) => parseS3Uri(location),
  },
  "AWS::Lambda::Function.Code": {
    toPackage: (propValue) =>
      typeof propValue === "string"
        ? // If no nested value is provided, assume we should package the target
          // path to S3
          { S3: [propValue] }
        : typeof propValue.ImageUri === "string" &&
          !isValidECRUri(propValue.ImageUri)
        ? // If an ImageUri is provided, we should package the path to ECR
          { ECR: [propValue.ImageUri] }
        : typeof propValue.ZipFile === "string" &&
          propValue.ZipFile.startsWith(".")
        ? // If a path is provided for ZipFile, we should package it inline
          { INLINE: [propValue.ZipFile] }
        : {},
    packaged: (propValue) =>
      propValue.S3Bucket && propValue.S3Key
        ? {
            S3: [
              {
                Bucket: propValue.S3Bucket,
                Key: propValue.S3Key,
              },
            ],
          }
        : propValue.ImageUri && isValidECRUri(propValue.ImageUri)
        ? { ECR: [propValue.ImageUri] }
        : {}, // We don't specify the case when content was already inline
    update: (propValue, locations) =>
      // We use the same logic as toPackage to determine what was packaged,
      // except that we don't check again whether input was valid as this was
      // already done in toPackage
      typeof propValue === "string"
        ? {
            S3Bucket: parseS3Uri(locations[propValue]).Bucket,
            S3Key: parseS3Uri(locations[propValue]).Key,
          }
        : typeof propValue.ImageUri === "string"
        ? Object.assign(propValue, {
            ImageUri: locations[propValue.ImageUri],
          })
        : Object.assign(propValue, {
            // Replace local path with file content
            ZipFile: readFileSync(locations[propValue.ZipFile], "utf8"),
          }),
  },
  "AWS::Serverless::Function.CodeUri": {
    toPackage: (propValue) =>
      typeof propValue === "string" ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      propValue.Bucket && propValue.Key ? { S3: [propValue] } : {},
    update: (propValue, { [propValue]: location }) => parseS3Uri(location),
  },
  "AWS::AppSync::GraphQLSchema.DefinitionS3Location": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue) ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue) ? { S3: [parseS3Uri(propValue)] } : {},
    update: (propValue, { [propValue]: location }) =>
      getS3Uri(parseS3Uri(location)),
  },
  "AWS::AppSync::Resolver.RequestMappingTemplateS3Location": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue) ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue) ? { S3: [parseS3Uri(propValue)] } : {},
    update: (propValue, { [propValue]: location }) =>
      getS3Uri(parseS3Uri(location)),
  },
  "AWS::AppSync::Resolver.ResponseMappingTemplateS3Location": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue) ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue) ? { S3: [parseS3Uri(propValue)] } : {},
    update: (propValue, { [propValue]: location }) =>
      getS3Uri(parseS3Uri(location)),
  },
  "AWS::Serverless::Api.DefinitionUri": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue) ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue) ? { S3: [parseS3Uri(propValue)] } : {},
    update: (propValue, { [propValue]: location }) =>
      getS3Uri(parseS3Uri(location)),
  },
  "AWS::ElasticBeanstalk::ApplicationVersion.SourceBundle": {
    toPackage: (propValue) =>
      typeof propValue === "string" ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      propValue.S3Bucket && propValue.S3Key
        ? { S3: [{ Bucket: propValue.S3Bucket, Key: propValue.S3Key }] }
        : {},
    update: (propValue, { [propValue]: location }) => ({
      S3Bucket: parseS3Uri(location).Bucket,
      S3Key: parseS3Uri(location).Key,
    }),
  },
  "AWS::CloudFormation::Stack.TemplateURL": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue) ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue) ? { S3: [parseS3Uri(propValue)] } : {},
    update: (propValue, { [propValue]: location }) => location,
  },
  "AWS::Glue::Job.Command": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue.ScriptLocation)
        ? { S3: [propValue.ScriptLocation] }
        : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue.ScriptLocation)
        ? { S3: [parseS3Uri(propValue.ScriptLocation)] }
        : {},
    update: (propValue, { [propValue.ScriptLocation]: location }) =>
      Object.assign(propValue, {
        ScriptLocation: getS3Uri(parseS3Uri(location)),
      }),
  },
  "AWS::Glue::Job.DefaultArguments": {
    // propValue contains the map of CLI arguments and their values. Some of
    // these arguments should point at S3 locations so we package them if
    // needed
    toPackage: (propValue) =>
      awsGlueJobDefaultArgumentsToPackage.reduce(
        (res, arg) => {
          if (propValue[arg] !== undefined && !isValidS3Uri(propValue[arg]))
            res.S3.push(propValue[arg]) // Add the file
          return res
        },
        { S3: [] },
      ),
    packaged: (propValue) =>
      awsGlueJobDefaultArgumentsToPackage.reduce(
        (res, arg) => {
          if (propValue[arg] !== undefined && isValidS3Uri(propValue[arg]))
            res.S3.push(parseS3Uri(propValue[arg])) // Add the file
          return res
        },
        { S3: [] },
      ),
    update: (propValue, locations) =>
      Object.assign(
        propValue,
        ...awsGlueJobDefaultArgumentsToPackage
          // Keep only the arguments that were not already packaged
          .filter(
            (arg) =>
              propValue[arg] !== undefined && !isValidS3Uri(propValue[arg]),
          )
          .map((arg) => ({
            // Replace the argument's value with the packaged location
            [arg]: getS3Uri(parseS3Uri(locations[propValue[arg]])),
          })),
      ),
  },
  "AWS::Include.Location": {
    toPackage: (propValue) =>
      !isValidS3Uri(propValue) ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      isValidS3Uri(propValue) ? { S3: [parseS3Uri(propValue)] } : {},
    update: (propValue, { [propValue]: location }) =>
      getS3Uri(parseS3Uri(location)),
  },
  "AWS::Lambda::LayerVersion.Content": {
    toPackage: (propValue) =>
      typeof propValue === "string" ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      propValue.S3Bucket && propValue.S3Key
        ? { S3: [{ Bucket: propValue.S3Bucket, Key: propValue.S3Key }] }
        : {},
    update: (propValue, { [propValue]: location }) => ({
      S3Bucket: parseS3Uri(location).Bucket,
      S3Key: parseS3Uri(location).Key,
    }),
  },
  "AWS::Serverless::Function.ImageUri": {
    toPackage: (propValue) =>
      !isValidECRUri(propValue) ? { ECR: [propValue] } : {},
    packaged: (propValue) =>
      isValidECRUri(propValue) ? { ECR: [propValue] } : {},
    update: (propValue, { [propValue]: location }) => location,
  },
  "AWS::Serverless::Function.InlineCode": {
    toPackage: (propValue) =>
      propValue.startsWith(".") ? { INLINE: [propValue] } : {},
    packaged: () => {}, // Not specified for inline
    update: (propValue, { [propValue]: location }) =>
      readFileSync(location, "utf8"),
  },
  "AWS::CloudFront::Function.FunctionCode": {
    toPackage: (propValue) =>
      propValue.startsWith(".") ? { INLINE: [propValue] } : {},
    packaged: () => {}, // Not specified for inline
    update: (propValue, { [propValue]: location }) =>
      readFileSync(location, "utf8"),
  },
  "AWS::ECS::TaskDefinition.ContainerDefinitions": {
    // propValue is a list of ContainerDefinitions whose Image properties point
    // at the ECR images that we may need to package
    toPackage: (propValue) =>
      propValue.reduce(
        (res, { Image }) => {
          // Add the image to the list to package
          if (!isValidECRUri(Image)) res.ECR.push(Image)
          return res
        },
        { ECR: [] },
      ),
    packaged: (propValue) =>
      propValue.reduce(
        (res, { Image }) => {
          // Add the image to the list of packaged resources
          if (isValidECRUri(Image)) res.ECR.push(Image)
          return res
        },
        { ECR: [] },
      ),
    update: (propValue, locations) =>
      propValue.map((def) =>
        Object.assign(
          def,
          !isValidECRUri(def.Image) && { Image: locations[def.Image] },
        ),
      ),
  },
  "AWS::CodeBuild::Project.Environment": {
    // propValue is the Environment property which contains an Image attribute
    // that may need to be packaged to ECR
    toPackage: (propValue) =>
      !isValidECRUri(propValue.Image) ? { ECR: [propValue.Image] } : {},
    packaged: (propValue) =>
      isValidECRUri(propValue.Image) ? { ECR: [propValue.Image] } : {},
    update: (propValue, { [propValue.Image]: location }) =>
      Object.assign(propValue, { Image: location }),
  },
  "AWS::KinesisAnalytics::Application.ApplicationCode": {
    toPackage: (propValue) =>
      propValue.startsWith(".") ? { INLINE: [propValue] } : {},
    // We don't specify if content was already inline
    packaged: () => ({}),
    update: (propValue, { [propValue]: tmpLocation }) =>
      // Replace local path with file content
      readFileSync(tmpLocation, "utf8"),
  },
  "AWS::KinesisAnalyticsV2::Application.ApplicationConfiguration": {
    // propValue is nested inside of ApplicationConfiguration/
    // ApplicationCodeConfiguration/ CodeContent/ S3ContentLocation
    toPackage: (propValue) =>
      propValue.ApplicationCodeConfiguration &&
      propValue.ApplicationCodeConfiguration.CodeContent &&
      typeof propValue.ApplicationCodeConfiguration.CodeContent
        .S3ContentLocation === "string"
        ? // Application code should be packaged to S3
          {
            S3: [
              propValue.ApplicationCodeConfiguration.CodeContent
                .S3ContentLocation,
            ],
          }
        : // Application code should be inserted inline (assumes string is the
        // local path starting with ./ or ../)
        propValue.ApplicationCodeConfiguration &&
          propValue.ApplicationCodeConfiguration.CodeContent &&
          typeof propValue.ApplicationCodeConfiguration.CodeContent
            .TextContent === "string" &&
          propValue.ApplicationCodeConfiguration.CodeContent.TextContent.startsWith(
            ".",
          )
        ? {
            INLINE: [
              propValue.ApplicationCodeConfiguration.CodeContent.TextContent,
            ],
          }
        : {},
    packaged: (propValue) =>
      propValue.ApplicationCodeConfiguration &&
      propValue.ApplicationCodeConfiguration.CodeContent &&
      typeof propValue.ApplicationCodeConfiguration.CodeContent
        .S3ContentLocation === "object"
        ? // File was packaged to S3
          {
            S3: [
              {
                // S3 bucket name is after the ':::'
                Bucket: /.*:::(?<name>.+)$/.exec(
                  propValue.ApplicationCodeConfiguration.CodeContent
                    .S3ContentLocation.BucketARN,
                ).groups.name,
                Key: propValue.ApplicationCodeConfiguration.CodeContent
                  .S3ContentLocation.FileKey,
              },
            ],
          }
        : {}, // We don't specify the case when content was already inline
    update: (
      propValue,
      {
        [propValue.ApplicationCodeConfiguration.CodeContent.S3ContentLocation]:
          s3Location,
        [propValue.ApplicationCodeConfiguration.CodeContent.TextContent]:
          tmpLocation,
      },
    ) =>
      Object.assign(propValue, {
        ApplicationCodeConfiguration: Object.assign(
          propValue.ApplicationCodeConfiguration,
          {
            CodeContent: Object.assign(
              propValue.ApplicationCodeConfiguration.CodeContent,
              s3Location
                ? // Replace local path with S3 object
                  {
                    S3ContentLocation: {
                      BucketARN: `arn:aws:s3:::${
                        parseS3Uri(s3Location).Bucket
                      }`,
                      FileKey: parseS3Uri(s3Location).Key,
                    },
                  }
                : tmpLocation
                ? // Replace local path with file content
                  { TextContent: readFileSync(tmpLocation, "utf8") }
                : {},
            ),
          },
        ),
      }),
  },
  "AWS::AppRunner::Service.SourceConfiguration": {
    toPackage: (propValue) =>
      propValue.ImageRepository &&
      propValue.ImageRepository.ImageRepositoryType === "ECR" &&
      !isValidECRUri(propValue.ImageRepository.ImageIdentifier)
        ? { ECR: [propValue.ImageRepository.ImageIdentifier] }
        : {},
    packaged: (propValue) =>
      propValue.ImageRepository &&
      propValue.ImageRepository.ImageRepositoryType === "ECR" &&
      isValidECRUri(propValue)
        ? { ECR: [propValue.ImageRepository.ImageIdentifier] }
        : {},
    update: (
      propValue,
      { [propValue.ImageRepository.ImageIdentifier]: location },
    ) =>
      Object.assign(propValue, {
        ImageRepository: Object.assign(propValue.ImageRepository, {
          ImageIdentifier: location,
        }),
      }),
  },
  "AWS::StepFunctions::StateMachine.DefinitionS3Location": {
    toPackage: (propValue) =>
      typeof propValue === "string" ? { S3: [propValue] } : {},
    packaged: (propValue) =>
      propValue.Bucket && propValue.Key
        ? { S3: [{ Bucket: propValue.Bucket, Key: propValue.Key }] }
        : {},
    update: (propValue, { [propValue]: location }) => ({
      Bucket: parseS3Uri(location).Bucket,
      Key: parseS3Uri(location).Key,
    }),
  },
  "AWS::EMRServerless::Application.ImageConfiguration": {
    // propValue is the ImageConfiguration property which contains ImageUri
    toPackage: (propValue) =>
      !isValidECRUri(propValue.ImageUri) ? { ECR: [propValue.ImageUri] } : {},
    packaged: (propValue) =>
      isValidECRUri(propValue.ImageUri) ? { ECR: [propValue.ImageUri] } : {},
    update: (propValue, { [propValue.ImageUri]: location }) =>
      Object.assign(propValue, { ImageUri: location }),
  },
  "AWS::Cognito::UserPool.VerificationMessageTemplate": {
    toPackage: (propValue) =>
      typeof propValue.EmailMessageByCode === "string" &&
      propValue.EmailMessageByCode.startsWith(".")
        ? { INLINE: [propValue.EmailMessageByCode] }
        : typeof propValue.EmailMessageByLink === "string" &&
          propValue.EmailMessageByLink.startsWith(".")
        ? { INLINE: [propValue.EmailMessageByLink] }
        : {},
    packaged: () => {}, // Not specified for inline
    update: (propValue, locations) =>
      Object.assign(
        propValue,
        locations[propValue].EmailMessageByCode
          ? {
              EmailMessageByCode: readFileSync(
                locations[propValue].EmailMessageByCode,
                "utf8",
              ),
            }
          : {},
        locations[propValue].EmailMessageByLink
          ? {
              EmailMessageByLink: readFileSync(
                locations[propValue].EmailMessageByLink,
                "utf8",
              ),
            }
          : {},
      ),
  },
}

/**
 * Indicate whether a URI is valid for S3
 * @param {Object} uri The value to check
 * @return {Boolean} Whether the value is a valid URI for S3
 */
function isValidS3Uri(uri) {
  return (
    typeof uri === "string" && (uri.startsWith("http") || uri.startsWith("s3:"))
  )
}

/**
 * Indicate whether a URI is valid for ECR
 * @param {Object} uri The value to check
 * @return {Boolean} Whether the value is a valid URI for ECR
 */
function isValidECRUri(uri) {
  // Source: https://stackoverflow.com/questions/39671641
  return new RegExp(
    "^(([a-z0-9]|[a-z0-9][a-z0-9\\-]*[a-z0-9])\\.)*([a-z0-9]|[a-z0-9][a-z0-9\\-]*[a-z0-9])(:[0-9]+\\/)?(?:[0-9a-z-]+[/@])(?:([0-9a-z-]+))[/@]?(?:([0-9a-z-]+))?(?::[a-z0-9\\.-]+)?$",
  ).test(uri)
}

/**
 * Parse a S3 URL and extract its bucket and key
 * @param {String} url The S3 URL
 * @return {Object} An object containing the extracted { bucket, key }
 */
function parseS3Uri(url) {
  // Extract bucket and key from the URL
  const { host, pathname } = new URL(url)
  const parts = pathname.split("/")
  parts.shift() // pathname starts with a '/'
  // Bucket is either specified as the url host, or it is the first part of the
  // pathname
  const Bucket = host === "s3.amazonaws.com" ? parts.shift() : host
  const Key = parts.join("/") // Key is made up of the rest
  return { Bucket, Key }
}

/**
 * Generate a S3 URI starting with s3:// based on the object's Bucket and Key
 * @param {Object} obj The object's description
 * @param {String} obj.Bucket The object's bucket
 * @param {String} obj.Key The object's key
 * @return {String} The object's uri
 */
function getS3Uri({ Bucket, Key }) {
  return `s3://${Bucket}/${Key}`
}
