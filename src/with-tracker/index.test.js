let withTracker

describe("withTracker", () => {
  beforeEach(() => {
    // Make sure to reset the module between tests
    jest.resetModules()
    withTracker = require("./index")
  })

  test("provides tracker for objects", () => {
    const tracked = withTracker()({})
    expect(tracked.tracker.constructor.name).toEqual("Tracker")
  })

  test("provides tracker defs for functions", () => {
    const tracked = withTracker({ estimate: () => 1 })(function () {})
    expect(tracked.estimate()).toEqual(1)
  })

  test("keeps context if requested", () => {
    const fn1 = withTracker()(function (prop) {
      return fn2.call(this, prop)
    })
    const fn2 = withTracker()(function (prop) {
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
      { autoComplete: false }
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
      { autoComplete: false }
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
    expect(withTracker.tracker.total).toEqual(
      toMultiply.reduce((total, el) => total + 1 + el + 1, 0)
    )
    expect(withTracker.tracker.ticks).toEqual(
      toMultiply.reduce((total, el) => total + 1 + el, 0)
    )
    expect(withTracker.tracker.remainingTicks).toEqual(
      toMultiply.reduce((total) => total + 1, 0)
    )
  })

  test("enables autoComplete", () => {
    const fn = withTracker(
      { estimate: () => 10 },
      { autoComplete: true }
    )(function () {
      this.tracker.tick()
    })
    fn()
    expect(withTracker.tracker.total).toEqual(10)
    expect(withTracker.tracker.ticks).toEqual(10)
    expect(withTracker.tracker.remainingTicks).toEqual(0)
  })
})
