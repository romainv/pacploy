const withTracker = require("../../with-tracker")
const packageFileToS3 = require("./packageFileToS3")
const packageFileToECR = require("./packageFileToECR")
const packageFileInline = require("./packageFileInline")

/**
 * Package a local file to S3 if necessary
 * @param {Object} params Function parameters: see packageFileToS3 and packageFileToECR
 * @param {File} params.file The file to package
 * @return {Object} The location of the file and upload status
 */
async function packageFile({ file, ...params }) {
  if (file.packageTo === "S3")
    return await packageFileToS3.call(this, file, params)
  else if (file.packageTo === "ECR")
    return await packageFileToECR.call(this, file, params)
  else if (file.packageTo === "INLINE")
    return await packageFileInline.call(this, file, params)
  else
    throw new Error(
      `Unable to determine where file '${file.path}' should be packaged (packageTo='${file.packageTo}')`
    )
}

module.exports = withTracker()(packageFile)
