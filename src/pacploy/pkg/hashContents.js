import { createHash } from "crypto"
import { existsSync, createReadStream } from "fs"
import yauzl from "yauzl"

/**
 * Compute the hash of a file's contents, ignoring metadata including for zips
 * @param {String} filePathOrString The path to the file
 * @return {Promise<String>} The hash in hexadecimal encoding
 */
export default async function hashContents(filePathOrString) {
  // If argument is a file, calculate the hash of its contents
  if (typeof filePathOrString === "string" && existsSync(filePathOrString)) {
    if (!filePathOrString.endsWith(".zip"))
      return hashFileContents(filePathOrString)
    return hashZipContents(filePathOrString)
  }
  // If argument is a string, calculate the hash of the string
  return hashString(filePathOrString)
}

/**
 * Compute the hash of a zip file's contents, ignoring metadata of files in the
 * archive
 * @param {String} filePath The path to the zip file
 * @return {Promise<String>} The hash in hexadecimal encoding
 */
async function hashZipContents(filePath) {
  // If the file is an archive, calculate the hash of its contents
  return new Promise((res, rej) => {
    const hashes = []
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return rej(err)
      zipfile.readEntry()
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName))
          zipfile.readEntry() // Directory entry
        else {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return rej(err)
            const hash = createHash("md5")
            readStream.on("data", (chunk) => hash.update(chunk))
            readStream.on("end", () => {
              hashes.push({
                fileName: entry.fileName,
                hash: hash.digest("hex"),
              })
              zipfile.readEntry()
            })
          })
        }
      })
      zipfile.on("end", () => {
        // Sort hashes by file name to ensure deterministic order
        hashes.sort((a, b) => +(a > b) || -(b > a))
        // Combine hashes to get a single hash
        const combinedHash = createHash("md5")
        hashes.forEach((item) => combinedHash.update(item.hash))
        res(combinedHash.digest("hex"))
      })
      zipfile.on("error", (err) => rej(err))
    })
  })
}

/**
 * Calculate the md5 hash of a string
 * @param {String} content The content for which to calculate the hash
 * @return {String} The md5 hash in hexadecimal encoding
 */
function hashString(content) {
  const hash = createHash("md5")
  hash.update(content)
  return hash.digest("hex")
}

/**
 * Calculate the md5 hash of a file's contents
 * @param {String} filePath The path to the file
 * @return {Promise<String>} The md5 hash in hexadecimal encoding
 */
async function hashFileContents(filePath) {
  const hash = createHash("md5")
  await new Promise((res, rej) => {
    const stream = createReadStream(filePath)
    stream.on("error", (err) => rej(err))
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => res())
  })
  return hash.digest("hex")
}
