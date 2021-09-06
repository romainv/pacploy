import getMethodNames from "./getMethodNames.js"

describe("getMethodNames", () => {
  test("works", () => {
    class Foo {
      constructor() {
        this.bar = function bar() {}
      }
      baz() {}
    }
    expect(getMethodNames(new Foo())).toEqual(
      expect.arrayContaining(["bar", "baz"])
    )
  })
})
