const withTracker = require("../../with-tracker")
const { copyFile, existsSync } = require("fs")
const { extname, join } = require("path")
const md5 = require("./md5")
const tmp = require("tmp")

/**
 * Package a local file to a temp folder so it can be inserted inline
 * @param {File} file The file to package
 * @param {Object} params Additional function parameters
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * file even if it was not updated since last upload
 * @return {Object} The S3 file URI and upload status
 */
async function packageFileInline(file, { forceUpload = false }) {
  // Retrieve content md5 hash
  const hash = await md5(file.path)
  // Check if object already exists
  const targetPath = join(tmp.tmpdir, `${hash}.${extname(file.path)}`)
  let status = existsSync(targetPath) ? "exists" : ""
  if (forceUpload || status !== "exists") {
    // If object doesn't exist yet, or upload was forced: update it
    await new Promise((res, rej) =>
      copyFile(file.path, targetPath, (err) => (err ? rej(err) : res()))
    )
    status = status === "exists" ? "forced" : "updated"
  }
  // Return the local file location
  return {
    location: targetPath,
    status,
    hash,
  }
}

module.exports = withTracker()(packageFileInline)
