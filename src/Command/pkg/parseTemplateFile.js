const { yamlParse } = require("yaml-cfn")
const { readFileSync } = require("fs")
const getFullPath = require("./getFullPath")

module.exports = parseTemplateFile

/**
 * Recursively parse a local template's resource properties and execute a
 * function for each, synchronously
 * @param {String} templatePath The local path to the template to parse
 * @param {Function} fn The synchronous function to execute
 */
function parseTemplateFile(templatePath, fn) {
  // Parse the template depending on its format
  const template = yamlParse(readFileSync(templatePath, "utf8"))
  // Recursively package the properties of the template resources
  Object.entries(template.Resources).map(
    ([, { Type: resourceType, Properties = {} }]) => {
      // Loop through each resource in the template
      Object.entries(Properties).map(([propName, propValue]) => {
        // Loop through each property of the current resource
        if (
          resourceType === "AWS::CloudFormation::Stack" &&
          propName === "TemplateURL" &&
          typeof propValue === "string" &&
          !propValue.startsWith("http")
        )
          // If resource is a nested stack pointing at a local file,
          // recursively parse it
          parseTemplateFile(getFullPath(propValue, templatePath), fn)
        // Execute the function on the current property
        fn({
          curTemplatePath: templatePath,
          resourceType,
          propName,
          propValue,
        })
      })
    }
  )
}
