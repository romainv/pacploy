import tracker from "./tracker.js"
import { setRate } from "./throttle.js"
import del from "./del/index.js"
import cleanup from "./cleanup/index.js"
import deploy from "./deploy/index.js"
import errors from "./errors/index.js"
import getStatus from "./getStatus/index.js"
import pkg from "./pkg/index.js"
import sync from "./sync/index.js"
import zip from "./zip/index.js"

// Set a safe request limit to AWS API
setRate(2, 1000)

// Define the commands available
export default {
  del: autoComplete(del),
  cleanup: autoComplete(cleanup),
  deploy: autoComplete(deploy),
  errors: autoComplete(errors),
  status: autoComplete(getStatus),
  pkg: autoComplete(pkg),
  sync: autoComplete(sync),
  zip: autoComplete(zip),
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
    } finally {
      tracker.end() // Stop the progress bar upon completion
    }
    if (error) throw error
    return res
  }
}
