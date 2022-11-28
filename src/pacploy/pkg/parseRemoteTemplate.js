import { yamlParse } from "yaml-cfn"
import { call } from "../throttle.js"
import ResourceProperty from "./ResourceProperty.js"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

/**
 * Recursively parse a remote template's resource properties and execute a
 * function for each, synchronously
 * @param {Object} params The function parameters
 * @param {String} params.region The template's region
 * @param {String} params.templateBody The template body to parse
 * @param {Function} params.fn The synchronous function to execute (see parseTemplate)
 */
export default async function parseRemoteTemplate({
  region,
  templateBody,
  fn,
}) {
  const s3 = new S3Client({
    apiVersion: "2006-03-01",
    region,
    credentialDefaultProvider,
  })
  // Parse the template depending on its format
  const template = yamlParse(templateBody)
  // Recursively package the properties of the template resources
  await Promise.all(
    Object.entries(template.Resources).map(
      ([, { Type: resourceType, Properties = {} }]) =>
        // Loop through each resource in the template
        Promise.all(
          Object.entries(Properties).map(async ([propName, propValue]) => {
            // Loop through each property of the current resource
            if (
              resourceType === "AWS::CloudFormation::Stack" &&
              propName === "TemplateURL"
            ) {
              // If the current resource is a nested template
              const { packaged } = new ResourceProperty(
                resourceType,
                propName,
                propValue
              )
              if (packaged.S3) {
                // If the nested template is packaged to S3
                const [{ Bucket, Key }] = packaged.S3
                const { Body } = await call(
                  s3,
                  s3.send,
                  new GetObjectCommand({ Bucket, Key })
                )
                // Recursively parse it
                await parseRemoteTemplate({
                  region,
                  templateBody: Body.toString("utf-8"),
                  fn,
                })
              }
            }
            // Execute the function on the current property
            await fn({
              resourceType,
              propName,
              propValue,
            })
          })
        )
    )
  )
}
