import tracker from "./tracker.js"
import { setRate } from "./throttle.js"
import createChangeSet from "./createChangeSet/index.js"
import del from "./del/index.js"
import cleanup from "./cleanup/index.js"
import deleteChangeSets from "./deleteChangeSets/index.js"
import deploy from "./deploy/index.js"
import errors from "./errors/index.js"
import getStatus from "./getStatus/index.js"
import pkg from "./pkg/index.js"
import sync from "./sync/index.js"
import waitForStatus from "./waitForStatus/index.js"
import zip from "./zip/index.js"

/**
 * Define a class that can be instanciated with parameters to execute commands
 * against Cloudformation API, with progress tracking
 */
export default class Command {
  /**
   * Class instanciation
   */
  constructor() {
    // Set a safe request limit to AWS API
    setRate(2, 1000)
    // Define methods
    this.createChangeSet = autoComplete(createChangeSet)
    this.del = autoComplete(del)
    this.cleanup = autoComplete(cleanup)
    this.deleteChangeSets = autoComplete(deleteChangeSets)
    this.deploy = autoComplete(deploy)
    this.errors = autoComplete(errors)
    this.getStatus = autoComplete(getStatus)
    this.pkg = autoComplete(pkg)
    this.sync = autoComplete(sync)
    this.waitForStatus = autoComplete(waitForStatus)
    this.zip = autoComplete(zip)
  }
}

/**
 * Wrap a command so that it completes the progress bar automatically once done
 * @return {Function} The wrapped command
 */
function autoComplete(command) {
  return async function () {
    // Ensure progress bar is visible if multiple commands are chained
    tracker.total += 1
    tracker.begin()
    // Execute the command
    let res, error
    try {
      res = await command.apply(this, arguments)
    } catch (err) {
      error = err
      tracker.interruptError(
        `An error occurred while running command ${command.name}`
      )
    } finally {
      tracker.end() // Stop the progress bar upon completion
    }
    if (error) throw error
    return res
  }
}
