// Rate limit to enforce, defined as rate=limit/interval
let limit = 100 // Max requests allowed during interval
let interval = 1000 // Interval duration in ms to cap requests
const queue = new Map() // Log of all requests received

/**
 * Generate a throttled version of a function so that it won't execute more
 * often than the set rate limit. Executions beyond limit will be delayed
 * @param {Function} fn The function to throttle, either async or normal
 * @return {Function} The throttled version of the function
 */
export default function throttle(fn) {
  return call.bind(this, this, fn)
}

/**
 * Execute a function while respecting the rate limit
 * @param {Object} thisArg The value to use as 'this' when calling fn
 * @param {Function} fn The function to throttle, either async or normal
 * @param {...Object} args The function's arguments
 * @return {Promise} A promise that will resolve with the supplied function's
 * result
 */
export function call(thisArg, fn, ...args) {
  if (typeof fn !== "function") throw Error("throttle.call expected a function")
  let timeout // Will delay the function execution to meet the rate limit
  // Delay the function execution by as many intervals as necessary to
  // process entire queue while meeting the rate limit
  const delay = Math.floor(queue.size / limit) * interval
  return new Promise((resolve, reject) => {
    // Execute the original function and return its result after the delay
    timeout = setTimeout(() => resolve(fn.apply(thisArg, args)), delay)
    // Register delayed request in the queue, allowing to reject it if needed
    queue.set(timeout, reject)
    // Remove the function from the queue in the next interval so it still
    // counts towards the current interval's limit
    setTimeout(() => queue.delete(timeout), delay + interval)
  })
}

/**
 * Update the current rate limit
 * @param {Number} limitArg Max requests allowed during interval
 * @param {Number} intervalArg Interval duration in ms to cap requests
 */
export function setRate(limitArg, intervalArg) {
  limit = limitArg
  interval = intervalArg
}

/**
 * Cancels all requests with a custom error and clears the queue
 */
export function abort() {
  for (const timeout of queue.keys()) {
    clearTimeout(timeout)
    queue.get(timeout)(new AbortError())
  }
  queue.clear()
}

/**
 * Custom error to indicate a request was cancelled
 */
class AbortError extends Error {
  /**
   * @param {String} [msg] The error message
   */
  constructor(msg = "Throttled function aborted") {
    super(msg)
    this.name = "AbortError"
  }
}
