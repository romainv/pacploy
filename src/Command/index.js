import { tracker } from "../with-tracker/index.js"
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
    // Customize the progress bar (removes the actual bar and keep only the
    // spinner as most operations don't have a predictable completion)
    tracker.bar.fmt = ":spinner :status"
    tracker.bar.width = 0
    tracker.total = 1
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
    // Capture function arguments
    const args = arguments
    // Ensure progress bar is visible if multiple commands are chained
    tracker.start()
    tracker.ticks = 0
    tracker.show()
    // Execute the command
    const res = await command.apply(this, args)
    // Hide the progress bar upon completion
    tracker.complete()
    tracker.hide()
    return res
  }
}
