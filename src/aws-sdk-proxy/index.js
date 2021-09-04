const AWS = require("aws-sdk")
const getMethodNames = require("./getMethodNames")
const throttle = require("./throttle")
throttle.setRate(2, 1000) // Set a safe request limit for AWS apis

/**
 * Proxify aws-sdk to throttle functions that send requests to avoid "Rate
 * exceed" errors. This also automatically promisify the methods
 */
module.exports = new Proxy(AWS, {
  // Proxify AWS services
  get: (AWS, serviceName) =>
    new Proxy(AWS[serviceName], {
      // Only transform services which are constructors (will be instanciated
      // with new(), which is captured by the handler's construct)
      construct: (Service, args) =>
        new Proxy(new Service(...args), {
          // Only proxify certain methods
          get: (service, propName) =>
            shouldBeThrottled(service, propName)
              ? new Proxy(service[propName], {
                  apply: (method, thisArg, args) =>
                    // Apply throttle to the original method
                    throttle((...args) => {
                      // We ignore 'thisArg' to call the function as we need
                      // access to the service instance
                      const res = method.call(service, ...args)
                      // Convert AWS requests into promises
                      return res &&
                        res.constructor &&
                        res.constructor.name === "Request"
                        ? res.promise()
                        : res
                    }).apply(thisArg, args),
                })
              : service[propName],
        }),
    }),
})

/**
 * Indicate whether a service property should be throttled
 * @param {Object} service The aws-service name
 * @param {String} propName The service property
 * @return {Boolean} Whether the property should be transformed
 */
function shouldBeThrottled(service, propName) {
  if (getMethodNames(service).includes(propName) && propName !== "makeRequest")
    return true
  else if (service.serviceIdentifier === "s3" && propName === "upload")
    return true
  else return false
}
