import getFullPath from "./getFullPath.js"
import parseTemplateFile from "./parseTemplateFile.js"
import ResourceProperty from "./ResourceProperty.js"
import File from "./File.js"

/**
 * Retrieve the list of unique local files that should be packaged to S3
 * This doesn't include templates of nested stacks
 * @param {String} templatePath The local path to the template to package
 * @return {Object<String, import('./File.js').default>} An object whose keys
 * are the absolute path of files to package, and values are File instances
 * describing those files
 */
export default function getFilesToPackage(templatePath) {
  const toPackage = {}
  // Recursively loop through all the package resources, including nested
  // templates
  parseTemplateFile(
    templatePath,
    ({ curTemplatePath, resourceType, propName, propValue }) => {
      const resourceProp = new ResourceProperty(
        resourceType,
        propName,
        propValue
      )
      if (!Object.keys(toPackage).includes(curTemplatePath))
        // If current template has not yet been identified, register it
        toPackage[curTemplatePath] = new File(curTemplatePath, {
          resourceType: "AWS::CloudFormation::Stack",
          propName: "TemplateURL",
          packageTo: "S3",
        })
      for (const packageTo of Object.keys(resourceProp.toPackage)) {
        // Loop through each package destination
        for (const relPath of resourceProp.toPackage[packageTo]) {
          // Convert file path to absolute
          const filePath = getFullPath(relPath, curTemplatePath)
          if (!Object.keys(toPackage).includes(filePath))
            // If file has not yet been identified, register it
            toPackage[filePath] = new File(filePath, {
              resourceType,
              propName,
              packageTo,
            })
          // Indicate current template depends on current file
          toPackage[curTemplatePath].dependsOn.push(filePath)
        }
      }
    }
  )
  if (
    Object.keys(toPackage).length === 1 &&
    Object.keys(toPackage).includes(templatePath)
  )
    // If the parent template doesn't have any dependencies that need to be
    // packaged, don't package it
    return {}
  else return toPackage
}
