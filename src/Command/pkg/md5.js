import { createHash } from "crypto"
import { existsSync, createReadStream } from "fs"

/**
 * Calculate the md5 hash of a content
 * @param {Object} content The content for which to calculate the hash. This
 * can also be the path to a file whose content we want to get a hash for
 * @return {String} The md5 hash in hexadecimal encoding
 */
export default async function md5(content) {
  const hash = createHash("md5") // Instanciate a hash
  if (typeof content === "string" && existsSync(content))
    // If argument provided is the path to a file
    await new Promise((res, rej) => {
      // Create a hash from a Stream
      const stream = createReadStream(content)
      stream.on("error", (err) => rej(err))
      stream.on("data", (chunk) => hash.update(chunk))
      stream.on("end", () => res())
    })
  else hash.update(content) // If content was provided directly
  return hash.digest("hex") // Convert hash to hexadecimal encoding
}
