module.exports = getMethodNames

/**
 * Retrieve the method names of a class instance
 * @param {Object} obj The class instance
 * @return {Array<String>} The methods name
 */
function getMethodNames(obj) {
  return Array.from(
    new Set(
      Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
        .concat(Object.getOwnPropertyNames(obj))
        .filter(
          (propName) =>
            typeof obj[propName] === "function" && propName !== "constructor"
        )
    )
  )
}
