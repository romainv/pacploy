import ProgressBar from "progress"
import colors from "ansi-colors" // Dependency of enquirer
import Enquirer from "enquirer"

/**
 * Add new features and customisations to the default ProgressBar
 */
export class Tracker extends ProgressBar {
  /**
   * Instantiate a new progress bar
   * @param {String | Number} fmt If a string is provided, it will be used to
   * customize the progress bar format. If a number is provided, it will be
   * used as the progress bar total
   * @param {Object} [options] ProgressBar options to override the defaults
   */
  constructor(fmt, options = {}) {
    // Defaults
    const defaultOptions = {
      // Half terminal width, 20 columns max
      width: Math.min(20, Math.floor(process.stderr.columns / 2)),
      complete: colors.bgWhite(" "),
      incomplete: colors.grey("."),
      head: "",
      clear: true,
      total: 0,
    }
    const defaultFmt = "[:bar] :spinner :status"
    if (typeof fmt === "string")
      super(fmt, Object.assign(defaultOptions, options))
    else if (typeof fmt === "number")
      super(defaultFmt, Object.assign(defaultOptions, { total: fmt }))
    else throw new Error(`Unsupported type for fmt: ${fmt}`)
    // Initialize the tokens cache
    this._tokens = { status: "", spinner: "" }
  }

  /**
   * Start tracking
   */
  begin() {
    this.tick(0)
    this.show()
  }

  /**
   * Complete the remaining ticks so they match the total
   */
  end() {
    this.tick(this.total - this.curr)
  }

  /**
   * Start the spinner to indicate activity
   */
  startSpinner() {
    const chars = "/-\\|"
    let activity = 0
    this.spinner = setInterval(() => {
      // Stop the interval in case the tracker's total is undefined or NaN,
      // which may happen in race conditions when an error occurs in a tracked
      // function
      if (this.total === undefined || this.total !== this.total)
        clearInterval(this.spinner)
      if (!this.spinner._destroyed && !this.hidden) {
        // Update the spinner if the interval hasn't been killed yet or the
        // progress bar is hidden
        activity++
        this.tick(0, { spinner: chars.charAt(activity % chars.length) })
      }
      // Auto-stop the spinner once progress bar completes
      if (this.curr >= this.total) this.stopSpinner()
    }, 200)
  }

  /**
   * Stop the spinner
   */
  stopSpinner() {
    clearInterval(this.spinner)
    this.tick(0, { spinner: "" })
  }

  /**
   * Enable tick function to truncate tokens so they fit in one line
   * @param {Object|Number} len len or tokens
   * @param {Object} [tokens] tokens
   */
  tick(len, tokens) {
    if (typeof len === "object") (tokens = len), (len = 1) // Swap arguments
    // Update tokens cache
    if (typeof tokens === "object") Object.assign(this._tokens, tokens)
    // Truncate status
    this._tokens.status = this._tokens.status.substring(
      0,
      this.stream.columns - // Available terminal width
        this.width - // Bar width
        // Bar format without tokens
        this.fmt.replace(/:\S+/g, "").length -
        // Total width of other tokens
        Object.entries(this._tokens).reduce(
          (width, [token, value]) =>
            token === "status" ? width : width + value.length,
          0
        ) -
        2 // Additional buffer to ensure there is no line wrap
    )
    // Start the spinner if needed
    if ((!this.spinner || this.spinner._destroyed) && this.curr < this.total)
      this.startSpinner()
    // Use the parent tick
    return super.tick(len, this._tokens)
  }

  /**
   * Update the :status token
   * @param {String} status The new status to display
   */
  setStatus(status) {
    return this.tick(0, { status })
  }

  /**
   * Hide/erase the progress bar
   */
  hide() {
    if (this.stream && this.stream.isTTY) {
      // If current stream is interactive
      this.stream.clearLine() // Erase currrent line on which bar is drawn
      this.stream.cursorTo(0) // Move cursor to begining of line
    }
    this.hidden = true
  }

  /**
   * Show the progress bar (re-render it in case it was hidden)
   */
  show() {
    this.hidden = false
    this.render()
  }

  /**
   * Interrupt, i.e. display a message above the progress bar
   * @param {String} str The string to display
   */
  interrupt(str) {
    return this.stream
      ? // If a stream exists
        this.stream.isTTY
        ? // If the current terminal is interactive
          super.interrupt(str)
        : // If current terminal is not interactive, skip clearing current line
          this.stream.write(`${str}\n`)
      : console.log(str) // If no stream exists, fallback to use console.log
  }

  /**
   * Interrupt with 'success' format
   * @param {String} str The string to display
   */
  interruptSuccess(str) {
    return this.stream.isTTY
      ? this.interrupt(`${colors.bold.black.bgGreen("  OK  ")} ${str}`)
      : this.interrupt(`[  OK  ] ${str}`)
  }

  /**
   * Interrupt with 'error' format
   * @param {String} str The string to display
   */
  interruptError(str) {
    return this.stream.isTTY
      ? this.interrupt(`${colors.bold.black.bgRed(" FAIL ")} ${str}`)
      : this.interrupt(`[ FAIL ] ${str}`)
  }

  /**
   * Interrupt with 'warn' format
   * @param {String} str The string to display
   */
  interruptWarn(str) {
    return this.stream.isTTY
      ? this.interrupt(`${colors.bold.black.bgYellow(" WARN ")} ${str}`)
      : this.interrupt(`[ WARN ] ${str}`)
  }

  /**
   * Interrupt with 'info' format
   * @param {String} str The string to display
   */
  interruptInfo(str) {
    return this.stream.isTTY
      ? this.interrupt(`${colors.bold.white.bgBlue(" INFO ")} ${str}`)
      : this.interrupt(`[ INFO ] ${str}`)
  }

  /**
   * Prompt for user input (see enquirer)
   * @param {...Object} args Arguments to pass to underlying Enquirer.prompt
   * @return {Promise<Object>} The selected values according to passed args
   */
  async prompt(...args) {
    this.hide()
    const res = await Enquirer.prompt(...args)
    this.show()
    return res
  }

  /**
   * Ask for user to confirm by yes or no
   * @param {String} message The question user has to confirm
   * @return {Promise<Boolean>} True if user confirmed, false otherwise
   */
  async confirm(message) {
    this.hide()
    const confirm = new Enquirer.Confirm({ name: "confirmation", message })
    const confirmation = await confirm.run()
    this.show()
    return confirmation
  }
}

// Customize the progress bar (removes the actual bar and keep only the
// spinner as most operations don't have a predictable completion)
const tracker = new Tracker(":spinner :status", { total: 1 })
export default tracker
