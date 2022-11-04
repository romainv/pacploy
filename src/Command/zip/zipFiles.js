import { createReadStream, createWriteStream, statSync } from "fs"
import archiver from "archiver"

/**
 * Zip a list of files
 * @param {String} zipTo The path to the zip file
 * @param {Map} files A mapping of the full paths of files to zip in the
 * @param {archiver.Format} format The archive format to use ('zip' or 'tar')
 * @param {Object} [options] The zip or tar options
 * filesystem with their path in the archive
 */
export default async function zipFiles(zipTo, files, format, options) {
  // Configure the zip archive
  const file = createWriteStream(zipTo)
  const archive = archiver(format, options)
  archive.pipe(file) // Pipe the archive to the file
  // Add all files to the archive
  Array.from(files.keys())
    .sort() // Add files in order to ensure consistent hash
    .forEach((path) => {
      // Retrieve file info, notably to keep permissions intact
      const stats = statSync(path)
      // Use 'append' instead of 'file' method as this allows to set a date for
      // the entry, without which archive hash is inconsistent
      archive.append(createReadStream(path), {
        name: files.get(path),
        stats,
        // Force the access timestamp to be consistent over multiple zips (sets
        // it to the modified timestamp)
        date: stats.mtime,
      })
    })
  // Wait for the zip to be ready
  await new Promise((res, rej) => {
    file.on("close", res)
    archive.on("warning", rej)
    archive.on("error", rej)
    archive.finalize() // Indicate we're done adding files
  })
}
