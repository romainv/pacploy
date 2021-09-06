import Tracker from "./Tracker.js"
let withTracker, tracker

describe("withTracker", () => {
  beforeEach(async () => {
    // Make sure to use a different tracker for each test
    withTracker = (await import("./index.js")).default
    tracker = new Tracker()
  })

  test("provides tracker for objects", () => {
    const tracked = withTracker({}, {}, tracker)({})
    expect(tracked.tracker.constructor.name).toEqual("Tracker")
  })

  test("provides tracker defs for functions", () => {
    const tracked = withTracker(
      { estimate: () => 1 },
      {},
      tracker
    )(function () {})
    expect(tracked.estimate()).toEqual(1)
  })

  test("keeps context if requested", () => {
    const fn1 = withTracker(
      {},
      {},
      tracker
    )(function (prop) {
      return fn2.call(this, prop)
    })
    const fn2 = withTracker(
      {},
      {},
      tracker
    )(function (prop) {
      return this[prop]
    })
    expect(fn1.call({ foo: "bar" }, "foo")).toEqual("bar")
  })

  test("enables tracking", async () => {
    const addMultiply = withTracker(
      {
        estimate: function (update, previous) {
          // Assume each element will need one tick
          return (
            update ||
            previous ||
            (this.params &&
              Array.isArray(this.params.arr) &&
              this.params.arr.length)
          )
        },
        update: function (path, value, previousValue) {
          if (path === "sumMultiplied" && previousValue !== undefined) {
            this.tracker.tick()
          }
        },
        name: "parent",
      },
      { autoComplete: false },
      tracker
    )(
      /**
       * Dummy function that multiples every element of an array by a value and
       * returns their sum
       * @param {Object} params Function parameters
       * @param {Array} params.arr The array with the elements to multiply
       * @param {Number} params.by The value to multiply each number by
       * @return {Object} An object with the original elements as keys and the
       * multiplied elements as values
       */
      async function _addMultiply({ arr }) {
        this.sumMultiplied = 0 // Used to generate ticks
        await Promise.all(
          arr.map(async (el) => {
            const res = await sub.call(this, el)
            this.sumMultiplied += res
          })
        )
        return this.sumMultiplied
      }
    )
    const sub = withTracker(
      {
        init: function () {
          // Context is shared and init is executed at each function call
          this.extraTicks = this.extraTicks || 0
        },
        estimate: function (update, previous) {
          return update || previous || 1
        },
        update: function (path, value, previous) {
          // Push the estimate more than ticks
          if (path === "extraTicks") this.tracker.total += value - previous + 1
        },
        name: "child",
      },
      { autoComplete: false },
      tracker
    )(async function _sub(el) {
      // Note: this.extraTicks is shared across all executions
      this.extraTicks += el // Arbitrary extra ticks
      const res = await Promise.resolve(this.multiply(el, this.params.by))
      this.tracker.tick(el)
      return res
    })
    const toMultiply = [1, 2, 3]
    const by = 2
    const args = { arr: toMultiply, by }
    const context = { multiply: (n, by) => n * by, params: args }
    const multiplied = await addMultiply.call(context, args)
    expect(multiplied).toEqual(12)
    expect(tracker.total).toEqual(
      toMultiply.reduce((total, el) => total + 1 + el + 1, 0)
    )
    expect(tracker.ticks).toEqual(
      toMultiply.reduce((total, el) => total + 1 + el, 0)
    )
    expect(tracker.remainingTicks).toEqual(
      toMultiply.reduce((total) => total + 1, 0)
    )
  })

  test("enables autoComplete", () => {
    const fn = withTracker(
      { estimate: () => 10 },
      { autoComplete: true },
      tracker
    )(function () {
      this.tracker.tick()
    })
    fn()
    expect(tracker.total).toEqual(10)
    expect(tracker.ticks).toEqual(10)
    expect(tracker.remainingTicks).toEqual(0)
  })
})
