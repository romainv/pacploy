jest.setTimeout(10000) // Below tests require delay

describe("throttle", () => {
  let test1, test2, test3, test4
  beforeAll(() => {
    // Reset throttle module to avoid interference with other tests
    jest.resetModules()
    const throttle = require("./throttle")
    const intervalMs = 2000 // Rate interval
    // Set the rate limit for tests (5 requests/2sec)
    throttle.setRate(5, intervalMs)
    // Run tests synchronously as the queue is shared
    let attempted = [] // Will contain all attempted requests
    let executed = 0 // Keep track of how many requests were executed
    let aborted = 0 // Will keep track of how many requests were aborted
    // Create test throttled functions
    const throttled1 = throttle(() => executed++)
    const throttled2 = throttle(() => executed++)
    // Attempt to run a throttled function every 50ms for 1sec (20 times)
    test1 = new Promise((res) => {
      const interval = setInterval(() => {
        attempted.push(
          throttled1().catch((err) => err.name === "AbortError" && aborted++)
        )
        if (attempted.length === 20) {
          clearInterval(interval) // Stop executing the function
          res({ attempted: attempted.length, executed, aborted })
        }
      }, 50)
    })
    // Wait for test1 queue to clear
    test2 = test1.then(async () => {
      await Promise.all(attempted)
      return { attempted: attempted.length, executed, aborted }
    })
    // Attempt to run 2 throttled functions every 50ms for 1sec (20 times)
    test3 = test2.then(async () => {
      // Wait for queue to be out of throttle limit
      await new Promise((res) => setTimeout(res, intervalMs))
      // Reinitialize the trackers
      attempted = []
      executed = 0
      aborted = 0
      // Trigger functions
      await new Promise((res) => {
        const interval = setInterval(() => {
          attempted.push(
            throttled1().catch((err) => err.name === "AbortError" && aborted++)
          )
          attempted.push(
            throttled2().catch((err) => err.name === "AbortError" && aborted++)
          )
          if (attempted.length === 40) {
            clearInterval(interval) // Stop executing the functions
            res() // Resolve promise
          }
        }, 50)
      })
      return { attempted: attempted.length, executed, aborted }
    })
    // Abort the rest of the queue
    test4 = test3.then(async () => {
      throttle.abort()
      await Promise.all(attempted) // Wait for all requests to be aborted
      return { attempted: attempted.length, executed, aborted }
    })
  })

  test("limits requests from a single function in the interval", async () => {
    await expect(test1).resolves.toEqual(
      expect.objectContaining({ attempted: 20, executed: 5, aborted: 0 })
    )
  })

  test("processes all requests while meeting rate limit", async () => {
    await expect(test2).resolves.toEqual(
      expect.objectContaining({ attempted: 20, executed: 20, aborted: 0 })
    )
  })

  test("limits requests from multiple functions in the interval", async () => {
    await expect(test3).resolves.toEqual(
      expect.objectContaining({ attempted: 40, executed: 5, aborted: 0 })
    )
  })

  test("enables to abort the queue", async () => {
    await expect(test4).resolves.toEqual({
      attempted: 40,
      executed: 5,
      aborted: 35,
    })
  })
})
