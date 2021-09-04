jest.mock("aws-sdk", () => {
  class Request {
    constructor(foo) {
      this.foo = foo
    }
    promise() {
      return `${this.foo} is now a promise`
    }
  }
  class CloudFormation {
    constructor(prop) {
      this.prop = prop
    }
    describeStacks(arg) {
      return new Request(arg)
    }
    makeRequest(arg) {
      return new Request(arg)
    }
  }
  return { CloudFormation }
})
const AWS = require("./index")

describe("aws-sdk-proxy", () => {
  test("is throttled", async () => {
    const { CloudFormation } = AWS
    const cf = new CloudFormation("bar")
    expect(cf.constructor.name).toEqual("CloudFormation")
    expect(cf.prop).toEqual("bar")
    expect(cf.makeRequest("boo")).toEqual({ foo: "boo" })
  })
})
