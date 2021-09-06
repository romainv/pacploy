import { jest } from "@jest/globals"

// Mock ProgressBar
jest.mock(
  "./ProgressBar",
  () =>
    class {
      constructor() {
        this.ticks = 0
        this.tickCalls = 0
      }
      tick(len) {
        this.ticks += len
        this.tickCalls++
      }
    }
)
import Tracker from "./Tracker"

describe("Tracker", () => {
  test("initializes properly", () => {
    const tracker = new Tracker({
      estimate: () => 1,
      name: "foo",
    })
    expect(tracker.name).toEqual("foo")
    expect(tracker.ticks).toEqual(0)
    expect(tracker.total).toEqual(1)
    expect(tracker.bar.ticks).toEqual(0)
    expect(tracker.isTracking).toEqual(true)
  })

  test("increments ticks", () => {
    const tracker = new Tracker({
      estimate: () => 2,
    })
    tracker.tick()
    expect(tracker.ticks).toEqual(1)
    tracker.tick(2)
    expect(tracker.ticks).toEqual(3)
    expect(tracker.bar.ticks).toEqual(3)
  })

  test("tracks internal changes", () => {
    let changes = 0
    const tracker = new Tracker({
      update: function (path) {
        changes++
        if (path === "tracker.total") this.tracker.tick()
      },
    })
    tracker.tick()
    tracker.total = 1
    expect(tracker.ticks).toEqual(2)
    expect(changes).toEqual(3)
  })

  test("updates parent", () => {
    // Create a parent tracker
    const defs = {
      estimate: function (update, previous) {
        return update || previous || 1
      },
      update: function (path) {
        // Don't enter infinite loop
        if (path !== "tracker.updates") this.updates = (this.updates || 0) + 1
      },
    }
    const parent = new Tracker({ name: "parent", ...defs })
    // Create a child tracker
    const child = new Tracker({ name: "child", ...defs }, parent)
    expect(child.bar).toEqual(parent.bar)
    // Sub-ticks are reflected in parent
    parent.tick()
    child.tick()
    parent.tick()
    expect(parent.ticks).toEqual(3)
    expect(child.ticks).toEqual(1)
    // Sub-estimates are reflected in parent
    child.total++
    expect(parent.total).toEqual(2)
    expect(child.total).toEqual(2)
    // Parent and bar updates behave as expected
    expect(child.updates).toEqual(2)
    expect(parent.updates).toEqual(4)
    expect(child.bar.ticks).toEqual(3)
    expect(parent.bar.ticks).toEqual(3)
  })

  test("can track objects", () => {
    const tracker = new Tracker({
      estimate: function (update, previous) {
        return update || previous || 1
      },
      init: function () {
        this.updates = 0
      },
      update: function (path, value, previousValue) {
        if (path !== "updates") this.updates++
        if (path === "tracker.ticks")
          this.tracker.total = this.tracker.ticks + 1
        else if (path === "foo") this.tracker.tick(value - previousValue)
      },
      name: "foo",
    })
    const count = { foo: 0 }
    const tracked = tracker.track(count)
    tracked.foo++
    tracked.foo += 5
    expect(tracked.foo).toEqual(6)
    expect(count.foo).toEqual(6)
    expect(tracked.updates).toEqual(6)
    expect(tracker.ticks).toEqual(6)
    expect(tracker.total).toEqual(7)
  })

  test("can be stopped and restarted", () => {
    const tracker = new Tracker({
      update: function (path) {
        if (path !== "updates") this.updates = (this.updates || 0) + 1
      },
    })
    // Changes with updates before ending tracker
    tracker.tick()
    tracker.total = 1
    // Stop the tracker and do some more changes without updates
    tracker.stop()
    tracker.ticks++
    tracker.total++
    // Restart the tracker and do some changes with updates
    tracker.start()
    tracker.ticks++
    tracker.total++
    // Check if that worked
    expect(tracker.ticks).toEqual(3)
    expect(tracker.total).toEqual(3)
    expect(tracker.updates).toEqual(4)
  })

  test("handles change of tracked object", () => {
    const obj1 = { foo: "bar" }
    const obj2 = { foo: "baz" }
    let updates = 0
    const tracker = new Tracker({
      update: () => updates++,
    })
    let tracked = tracker.track(obj1)
    tracked.foo = "boo"
    tracked = tracker.track(obj2)
    tracked.foo = "bla"
    expect(obj1).toEqual({ foo: "boo" })
    expect(obj2).toEqual({ foo: "bla" })
    expect(updates).toEqual(2)
  })

  test("provides a tracker prop", () => {
    const obj = { foo: "bar" }
    const tracker = new Tracker()
    const tracked = tracker.track(obj)
    tracked.foo = "baz"
    tracker.tick()
    tracked.tracker.tick()
    expect(tracker.ticks).toEqual(2)
  })
})
