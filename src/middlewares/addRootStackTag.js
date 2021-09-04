/**
 * Add a reference to the root stack name to identify its resources.
 * This is useful to force-delete those set to 'Retain' (we use the tag to
 * identify that they belonged to the stack). Clouformation auto-generates a
 * aws:cloudformation:stackId tag, but that is unique to nested stacks
 * @param {Object} argv The current parsed options object
 * @param {Object} yargs The yargs instance
 * @return {Object} Updated arguments to be merged into argv
 */
module.exports = function addRootStackTag({ stackName, stackTags = {} } = {}) {
  return { stackTags: { ...stackTags, RootStackName: stackName } }
}
