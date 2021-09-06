import colors from "ansi-colors"

/**
 * Recursively display the events tree. You need to call it with a tracker
 * that contains a progress bar which can be used to actually output the events
 * @param {String} events The events to display
 * @param {String} [delimiter=' '] The character to display for indentation
 * @param {Number} [indentation=1] The current indentation level
 */
export default function displayEvents(
  { ResourceStatus, ResourceStatusReason, LogicalResourceId, resources = {} },
  delimiter = " ",
  indentation = 1
) {
  // Display current stack event
  if (ResourceStatus)
    this.bar.interrupt(
      `${delimiter.repeat(indentation)}${colors.bold.red(
        `\u2717 ${LogicalResourceId} ${ResourceStatus}`
      )}${ResourceStatusReason ? `: ${ResourceStatusReason}` : ""}`
    )
  // Display nested resources if any
  if (Object.keys(resources).length > 0)
    for (const resource of Object.values(resources))
      displayEvents.call(this, resource, delimiter, indentation + 2)
  else this.bar.tick(0) // Force-refresh the progress bar display
}
