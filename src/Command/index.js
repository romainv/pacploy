const withTracker = require("../with-tracker")

/**
 * Define a class that can be instanciated with parameters to execute commands
 * against Cloudformation API, with progress tracking
 */
module.exports = class Command {
  /**
   * Class instanciation
   */
  constructor() {
    // Customize the progress bar (removes the actual bar and keep only the
    // spinner as most operations don't have a predictable completion)
    withTracker.tracker.bar.fmt = ":spinner :status"
    withTracker.tracker.bar.width = 0
    withTracker.tracker.total = 1
    // Define methods
    this.createChangeSet = autoComplete(require("./createChangeSet"))
    this.del = autoComplete(require("./del"))
    this.cleanup = autoComplete(require("./cleanup"))
    this.deleteChangeSets = autoComplete(require("./deleteChangeSets"))
    this.deploy = autoComplete(require("./deploy"))
    this.errors = autoComplete(require("./errors"))
    this.getStatus = autoComplete(require("./getStatus"))
    this.pkg = autoComplete(require("./pkg"))
    this.sync = autoComplete(require("./sync"))
    this.waitForStatus = autoComplete(require("./waitForStatus"))
    this.zip = autoComplete(require("./zip"))
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
    withTracker.tracker.start()
    withTracker.tracker.ticks = 0
    withTracker.tracker.show()
    // Execute the command
    const res = await command.apply(this, args)
    // Hide the progress bar upon completion
    withTracker.tracker.complete()
    withTracker.tracker.hide()
    return res
  }
}
