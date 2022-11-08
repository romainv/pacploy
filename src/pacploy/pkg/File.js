/**
 * Represents a local file to package to S3
 */
export default class File {
  /**
   * Instantiate the class
   * @param {String} path Absolute path to the local file, which uniquely
   * idendifies it
   * @param {Object} attrs Additional object attributes
   * @param {String} attrs.resourceType The Cloudformation resource type of the
   * resources that point to this file (there should only be one type of
   * resource using this file for one of its properties)
   * @param {String} attrs.propName The property name of the resource that
   * points to this file
   * @param {String} attrs.packageTo Where the file should be packaged to (S3
   * or ECR)
   * @param {String} [attrs.status="pending"] The file's packaging status
   * @param {String[]} [attrs.dependsOn] A list of file paths which the
   * current file depends on (e.g. a local template with resource(s) which
   * reference local files)
   */
  constructor(
    path,
    { resourceType, propName, packageTo, status = "pending", dependsOn = [] }
  ) {
    this.path = path
    this.originalPath = path // Keep track as file path may be changed
    this.resourceType = resourceType
    this.propName = propName
    this.status = status
    this.dependsOn = dependsOn
    if (!["S3", "ECR", "INLINE"].includes(packageTo))
      throw new Error(`Unexpected 'packageTo' value: ${packageTo}`)
    this.packageTo = packageTo
  }
}
