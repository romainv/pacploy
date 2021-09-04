const ProgressBar = require("./ProgressBar")
const onChange = require("on-change")

/**
 * Enable to estimate and track how many ticks a command requires to perform
 */
class Tracker {
  /**
   * Class instanciation
   * @param {Object} [defs] An object containing the following synchronous
   * functions to update the progress. These functions will be invoked with the
   * target object that changed as 'this', with a special 'tracker' property
   * pointing at the current tracker
   * @param {Function} [defs.init] Invoked upon class instanciation, after
   * the first estimate was calculated. It can be used to perform additional
   * logic. This takes no arguments and returns no value
   * - Arguments: none
   * - Return value: none
   * @param {Function} [defs.estimate] Invoked upon class instanciation and
   * each update to tracked objects or tracker properties.
   * - Arguments:
   * 	 - update: the new estimate if one was just assigned, undefined otherwise
   * 	 - previous: the value before the estimate was updated, or the current
   * 	 	one if there was no of the estimate update (something else changed). If
   * 	 	both update and previous are undefined, it means not estimate was made
   * 	 	previously, thus is a good opportunity to initiate one
   * - Return value: If the function returns a value, it will override the
   *   current total without re-triggering the function. Return undefined to
   *   keep the current total
   * @param {Function} [defs.update] Invoked upon an update of any the
   * tracked object.
   * - Arguments:
   *   - path: the path to the property being updated (dot-separated
   * 		 and starting with the object name)
   * 	 - current: the new value that was just assigned
   * 	 - previousValue: the property value just before it changed
   * @param {String} [defs.name] A name to assign to the tracker to identify it
   * @param {Object} [defs.tracked] Enables to track an object at instanciation
   * instead of calling .track afterwards)
   * @param {Tracker} [parent] A parent progress instance from which
   * the current one should derive. If specified, the current progress will
   * contribute its ticks and estimate updates, as well as share the progress
   * bar with the parent. If no parent is passed, a new progress bar will be
   * created as soon as an estimate is available
   */
  constructor({ init, estimate, update, name, tracked } = {}, parent) {
    Object.defineProperties(this, {
      // Tracker definitions
      init: { value: init },
      estimate: { value: estimate },
      update: { value: update },
      name: { value: name || (parent && parent.name) },
      // Internal tracking values, which will be tracked once tracker is
      // started (tracked proxy will be available at this.tracker)
      _tracker: {
        value: { ticks: 0 }, // Nest under a 'tracker' name
      },
      // Indicate whether tracking is active
      isTracking: { value: false, writable: true },
      // Main way to keep track of progress
      ticks: {
        get: () => (this.isTracking ? this.tracker.ticks : this._tracker.ticks),
        set: (value) => {
          if (this.isTracking) this.tracker.ticks = value
          else this._tracker.ticks = value
        },
      },
      // Expected total number of ticks
      total: {
        get: () => (this.isTracking ? this.tracker.total : this._tracker.total),
        set: (value) => {
          if (this.isTracking) this.tracker.total = value
          else this._tracker.total = value
        },
      },
      // Expected number of ticks remaining (could be negative)
      remainingTicks: {
        get: () => this.total - this.ticks,
      },
      // Keep a reference to the parent
      parent: { value: parent },
      // Keep a reference to the parent's progress bar, or instanciate a new
      bar: {
        value: parent ? parent.bar : new ProgressBar(0),
        writable: true,
      },
      // Shortcuts to key bar methods
      setStatus: { get: () => this.bar.setStatus.bind(this.bar) },
      hide: { get: () => this.bar.hide.bind(this.bar) },
      show: { get: () => this.bar.show.bind(this.bar) },
      prompt: { get: () => this.bar.prompt.bind(this.bar) },
      confirm: { get: () => this.bar.confirm.bind(this.bar) },
      interrupt: { get: () => this.bar.interrupt.bind(this.bar) },
      interruptSuccess: { get: () => this.bar.interruptSuccess.bind(this.bar) },
      interruptError: { get: () => this.bar.interruptError.bind(this.bar) },
      interruptWarn: { get: () => this.bar.interruptWarn.bind(this.bar) },
      interruptInfo: { get: () => this.bar.interruptInfo.bind(this.bar) },
    })
    // Start the tracker
    if (tracked) this.track(tracked)
    else this.start()
  }

  /**
   * Increment the current estimator and linked progress tracker
   * @param {Number} [len=1] Number of ticks
   */
  tick(len = 1) {
    this.ticks += len
  }

  /**
   * Complete the remaining ticks so they match the total, or update the total
   * if there were more ticks, then stop the tracker
   */
  complete() {
    if (this.remainingTicks > 0) this.tick(this.remainingTicks)
    else this.total -= this.remainingTicks
    this.stop() // Stop the progress tracking
  }

  /**
   * (Re)start the tracker
   */
  start() {
    // Create the tracked proxy to internal tracker values
    this.tracker = onChange(this._tracker, (...args) => {
      // Add a prefix to path for internal tracker changes
      args[0] = `tracker.${args[0]}`
      return Tracker.onChange.call(this, ...args)
    })
    // Indicate tracking is active
    this.isTracking = true
    // Initialize or refresh the estimate
    Tracker.onChange.call(this, "tracker.start")
  }

  /**
   * Prevent further progress updates
   */
  stop() {
    this.isTracking = false
    this.tracker = onChange.unsubscribe(this.tracker)
  }

  /**
   * Enable tracking on an external object by linking it to the current tracker
   * @param {Object} obj The object to track
   * @return {Object} The tracked object
   */
  track(obj) {
    // Make sure we don't point at an already tracked version of the object
    obj = onChange.target(obj)
    // If there is already a tracked object other than the internal tracker,
    // remove its tracking first
    if (this.tracked) this.untrack()
    // Create a tracked version of the object
    this.tracked = new Proxy(
      onChange(obj, (...args) => Tracker.onChange.call(this, ...args)),
      {
        // Add a proxy to the tracker as a virtual .tracker property
        get: (target, name) => (name === "tracker" ? this : target[name]),
      }
    )
    // If tracking is active, de-activate it first before re-activing it
    if (this.isTracking) this.stop()
    // Map internal tracking to provide the tracked object as context
    this.start()
    // Initialization
    Tracker.onChange.call(this, "tracker.init")
    return this.tracked
  }

  /**
   * Unlink the tracker from the tracked object
   * @return {Object} The original object which was tracked
   */
  untrack() {
    const original = onChange.unsubscribe(this.tracked)
    return original
  }

  /**
   * Update the progress ad-hoc or upon modification of a tracked object
   * This is defined as a static method to avoid accessing it from within an
   * instance. This should still be called with the tracker as context, like:
   * 	 Tracker.onChange.bind(tracker)
   * @param {String} path The path (dot-separated) of the changed property
   * @param {Object} [value] The new value at the path
   * @param {Object} [previousValue] The previous value at the path
   */
  static onChange(path, value, previousValue) {
    if (!this.isTracking) return // Cancel updates if tracker is stopped
    const context =
      this.tracked ||
      new Proxy(this, {
        // Ensure .tracker refers to the entire tracker for consistency
        get: (target, name) => (name === "tracker" ? this : target[name]),
      })
    // Update total without re-triggering an update
    // This may override the total change which trigger this update, in case
    // the tracker's estimate function returned a different value
    const previousTotal =
      path === "tracker.total"
        ? previousValue
        : onChange.target(this.tracker).total
    onChange.target(this.tracker).total =
      (typeof this.estimate === "function"
        ? this.estimate.call(
            context,
            path === "tracker.total" ? value : undefined,
            path === "tracker.total" ? previousValue : this.total
          )
        : undefined) || this.total
    // Update the parent or the bar
    if (this.parent) {
      if (
        (((path === "tracker.start" || path === "tracker.init") &&
          (this.parent.total === undefined || this.parent.name === "main")) ||
          (path !== "tracker.init" && path !== "tracker.start")) &&
        this.total !== undefined &&
        this.total !== previousTotal
      ) {
        // Increment parent total, except during init/start if parent already
        // has a total (this assumes that parent's total was estimated based on
        // the child's initial estimate). For the immediate children of the
        // main tracker, we update the main tracker even if it was already
        // initiated (use-case: calling different commands during a script)
        this.parent.total =
          (this.parent.total || 0) + this.total - (previousValue || 0)
      } else if (path === "tracker.ticks")
        // Increment parent ticks
        this.parent.ticks += value - previousValue
    } else if (this.bar instanceof ProgressBar) {
      // If a bar is defined, update it if necessary unless current tracker has
      // a parent in which case we'll let it do the update to avoid duplicates
      if (this.total !== undefined && this.total !== previousTotal)
        this.bar.total += this.total - (previousTotal || 0)
      if (path === "tracker.ticks") this.bar.tick(value - previousValue)
    }
    // Initialize or update the tracker (after the bar and the parent as it
    // would otherwise duplicate effects if tracker triggers nested updates)
    if (path === "tracker.init") {
      if (typeof this.init === "function") this.init.call(context)
    } else if (path !== "tracker.start" && typeof this.update === "function")
      this.update.call(context, path, value, previousValue)
  }
}

// List of allowed tracker definitions
Tracker.defs = ["init", "estimate", "update", "name"]
module.exports = Tracker
