import tracker from "../tracker.js"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { available as availableStatuses } from "../statuses.js"
import getStackOutputs from "./getStackOutputs.js"
import getStatus from "../getStatus/index.js"
import md5 from "../pkg/md5.js"
import { basename, extname } from "path"
import dotenv from "dotenv"

/**
 * Download outputs of a deployed stack(s) into a local file(s)
 * @param {import('../params/index.js').StackParams|import('../params/index.js').StackParams[]} stacks
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
 * @param {import('../params/index.js').StackParams} stack The stack parameters
 * @param {Object} [params] Additional parameters
 * @param {Boolean} [params.quiet] Whether to turn off tracker status update
 */
async function syncStack(
  { region, stackName, syncPath = [], noOverride },
  { quiet = false } = {}
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
          " file already exists and noOverride is set"
      )
    return res
  }, [])
  if (!pathsToSync.length) return // If there are no paths to sync

  // Check if stack is available
  const status = await getStatus({ region, stackName })
  if (!availableStatuses.includes(status)) {
    // If stack is in a non available status
    tracker.interruptError(
      `Stack ${stackName} is not available to sync (${status})`
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
            `Stack ${stackName} outputs synced at ${path}`
          )
        else
          tracker.interruptInfo(`Stack ${stackName} outputs already up-to-date`)
      } catch (err) {
        tracker.interruptError(
          `Failed to sync stack ${stackName} outputs to ${path}: ` + err
        )
      }
    })
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
  // Retrieve extension (.env doesn't have an extension)
  const extension = (
    basename(path) === ".env" ? basename(path) : extname(path)
  ).toLowerCase()
  // Check if file format is supported
  if (!Object.keys(formats).includes(extension))
    throw new Error(`unsupported file format (${extension})`)
  // If format is supported, retrieve its parser and serializer
  const { parse, stringify } = formats[extension]
  // Check if file exists
  const exists = existsSync(path)
  // Retrieve existing file's hash, if any
  const hashBefore = exists ? await md5(path) : undefined
  // Load previous file content if it exists
  const existingOutputs = exists ? parse(readFileSync(path, "utf8")) : {}
  // Merge with the new outputs and update the file
  writeFileSync(path, stringify(existingOutputs, newOutputs), "utf8")
  const hashAfter = await md5(path)
  return hashAfter !== hashBefore
}

/**
 * Define the parsers and serializer of files in different formats. The parser
 * takes the existing file's contents and returns a key/value map. The
 * serializer takes the pre-existing and new key/value maps and returns the
 * file's content to write
 * @type {Object<String, {parse: Function, stringify: Function}>}
 */
const formats = {
  ".json": {
    parse: JSON.parse,
    stringify: (prev, curr) => JSON.stringify(Object.assign({}, prev, curr)),
  },
  ".env": {
    parse: dotenv.parse,
    stringify: (prev, curr) =>
      Object.entries(
        Object.assign(
          {},
          prev,
          // Convert the new outputs keys to MACRO_CASE to properly merge them
          // with existing keys
          Object.entries(curr).reduce((formatted, [key, value]) => {
            formatted[camelToMacroCase(key)] = value
            return formatted
          }, {})
        )
      )
        // Escape specialy characters in the value
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join("\n"),
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
