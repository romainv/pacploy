const { yamlParse, yamlDump } = require("yaml-cfn")
const { readFileSync } = require("fs")
const getFullPath = require("./getFullPath")
const ResourceProperty = require("./ResourceProperty")

module.exports = updateTemplate

/**
 * Update a template's properties with the packaged location
 * @param {String} templatePath The path to the template to update
 * @param {Object} params Additional function parameters
 * @param {Object} params.dependencies The list of packaged files that the
 * template depends on
 * @return {String} The updated template content
 */
function updateTemplate(templatePath, { dependencies }) {
  // Parse the template depending on its format
  const template = yamlParse(readFileSync(templatePath, "utf8"))
  for (const [
    logicalId,
    { Properties = {}, Type: resourceType },
  ] of Object.entries(template.Resources)) {
    // Loop through each resource in the template
    for (const [propName, propValue] of Object.entries(Properties)) {
      const resourceProp = new ResourceProperty(
        resourceType,
        propName,
        propValue
      )
      // Combine all files to package across destinations and map their
      // absolute path to their relative one
      const toPackage = Object.values(resourceProp.toPackage).reduce(
        (toPackage, relPaths) =>
          Object.assign(
            toPackage,
            ...relPaths.map((relPath) => ({
              [getFullPath(relPath, templatePath)]: relPath,
            }))
          ),
        {}
      )
      if (Object.keys(toPackage).length > 0)
        // If current property has files to package, replace its value with the
        // packaged locations
        template.Resources[logicalId].Properties[propName] =
          resourceProp.updatePropValue(
            Object.values(dependencies).reduce(
              (res, { originalPath, location }) => {
                if (Object.keys(toPackage).includes(originalPath))
                  // If resource to package can be matched to a packaged file
                  // (matching is made by the orignal absolute path as it may
                  // have been changed when packaging the file), we send it to
                  // the update function, setting the relPath attribute as this is
                  // how matching will be done there
                  res[toPackage[originalPath]] = location
                return res
              },
              {}
            )
          )
    }
  }
  // Return the updated template with location of packaged resources
  return yamlDump(template)
}
