import tracker from "../tracker.js"
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs"
import { available as availableStatuses } from "../statuses.js"
import getStackOutputs from "./getStackOutputs.js"
import getStatus from "../getStatus/index.js"
import hashContents from "../pkg/hashContents.js"
import { basename, extname } from "path"

/**
 * Download outputs of a deployed stack(s) into a local file(s)
 * @param {import('../params/index.js').default|import('../params/index.js').default[]} stacks
 * The list of stack parameters whose outputs to sync
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet] Whether to turn off tracker status update
 */
export default async function sync(stacks, params) {
  if (!Array.isArray(stacks)) stacks = [stacks]

  // Sync outputs of all supplied stacks
  await Promise.all(stacks.map((stack) => syncStack(stack, params)))
}

/**
 * Download outputs of a deployed stack into local file(s)
 * @param {import('../params/index.js').default} stack The stack parameters
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet] Whether to turn off tracker status update
 */
async function syncStack(
  { region, stackName, syncPath = [], noOverride },
  { quiet = false } = {},
) {
  // Convert syncPath to a list
  const syncPaths = Array.isArray(syncPath)
    ? new Set(syncPath)
    : new Set([syncPath])

  // Determine which paths should be synced
  const pathsToSync = Array.from(syncPaths).reduce((res, path) => {
    if (!noOverride || existsSync(path)) res.push(path)
    else
      tracker.interruptWarn(
        `Skipped sync of stack ${stackName} to ${path}:` +
          " file already exists and noOverride is set",
      )
    return res
  }, [])
  if (!pathsToSync.length) return // If there are no paths to sync

  // Check if stack is available
  const status = await getStatus({ region, stackName })
  if (!availableStatuses.includes(status)) {
    // If stack is in a non available status
    tracker.interruptError(
      `Stack ${stackName} is not available to sync (${status})`,
    )
    return
  }

  // Download stack outputs
  if (!quiet) tracker.setStatus("syncing outputs")
  const outputs = await getStackOutputs({ region, stackName })

  // Save stack outputs locally
  await Promise.all(
    pathsToSync.map(async (path) => {
      try {
        const wasUpdated = await syncOutputs(outputs, path)
        if (wasUpdated)
          tracker.interruptSuccess(
            `Stack ${stackName} outputs synced at ${path}`,
          )
        else
          tracker.interruptInfo(`Stack ${stackName} outputs already up-to-date`)
      } catch (err) {
        tracker.interruptError(
          `Failed to sync stack ${stackName} outputs to ${path}: ` + err,
        )
      }
    }),
  )

  return outputs
}

/**
 * Save the stack outputs in JSON format
 * @param {Object} newOutputs The stack outputs
 * @param {String} path The path to the file where outputs should be saved
 * @return {Promise<Boolean>} The MD5 hash of the target file after updating it
 */
async function syncOutputs(newOutputs, path) {
  // Detect if the file is a dotenv file, which could be named .env or .env.ext
  // or .ext.env
  const isDotenv = basename(path).startsWith(".env") || extname(path) === ".env"
  // Retrieve extension (.env doesn't have an extension)
  const extension = (isDotenv ? ".env" : extname(path)).toLowerCase()
  // Check if file format is supported
  if (!Object.keys(formats).includes(extension))
    throw new Error(`unsupported file format (${extension})`)
  // If format is supported, retrieve how to update the target file
  const update = formats[extension]
  // Retrieve existing file's hash, if any
  const hashBefore = existsSync(path) ? await hashContents(path) : undefined
  // Merge with the new outputs and update the file
  update(newOutputs, path)
  // Check updated file's hash
  const hashAfter = await hashContents(path)
  return hashAfter !== hashBefore
}

/**
 * Define how new outputs are written in the target file
 * @type {Object<String, {parse: Function, stringify: Function}>}
 */
const formats = {
  ".json": (newOutputs, path) => {
    // Retrieve existing values if the target file exists
    const existingValues = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : {}
    // Merge with the new outputs and update the file
    const merged = Object.assign({}, existingValues, newOutputs)
    // Update the target file
    writeFileSync(path, JSON.stringify(merged), "utf8")
  },
  ".env": (newOutputs, path) => {
    // If the target file exists, add a line break at the end
    if (existsSync(path)) appendFileSync(path, "\n", "utf8")
    // Retrieve the existing values so we don't duplicate them
    const existingLines = existsSync(path)
      ? readFileSync(path, "utf8").split("\n")
      : []
    // To avoid conflicts, we leave any existing values untouched and only add
    // new ones
    appendFileSync(
      path,
      // Convert the new outputs keys to MACRO_CASE and escape special
      // characters in the value
      Object.entries(newOutputs)
        .map(
          ([key, value]) => `${camelToMacroCase(key)}=${JSON.stringify(value)}`,
        )
        .filter((line) => !existingLines.includes(line)) // Remove duplicates
        .join("\n"),
      "utf8",
    )
    // Append a line break at the end of the file
    appendFileSync(path, "\n", "utf8")
  },
}

/**
 * Convert a camelCase string to MACRO_CASE
 * @param {String} str The string to convert
 * @return {String} The converted string
 */
function camelToMacroCase(str) {
  return str
    .replace(/(?<=[^A-Z_])([A-Z])/g, (letter) => `_${letter.toUpperCase()}`)
    .toUpperCase()
}
