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
  return async (...args) => {
    let timeout // Will delay the function execution to meet the rate limit
    // Delay the function execution by as many intervals as necessary to
    // process entire queue while meeting the rate limit
    const delay = Math.floor(queue.size / limit) * interval
    const res = await new Promise((res, rej) => {
      // Execute the original function and return its result after the delay
      timeout = setTimeout(() => res(fn.apply(this, args)), delay)
      // Register delayed request in the queue, allowing to reject it if needed
      queue.set(timeout, rej)
      // Remove the function from the queue in the next interval so it still
      // counts towards the current interval's limit
      setTimeout(() => queue.delete(timeout), delay + interval)
    })
    return res
  }
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
