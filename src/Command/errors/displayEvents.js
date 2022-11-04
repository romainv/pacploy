import tracker from "../tracker.js"
import colors from "ansi-colors"

/**
 * Recursively display the events tree
 * @param {Object} events The events to display
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
    tracker.interrupt(
      `${delimiter.repeat(indentation)}${colors.bold.red(
        `\u2717 ${LogicalResourceId} ${ResourceStatus}`
      )}${ResourceStatusReason ? `: ${ResourceStatusReason}` : ""}`
    )
  // Display nested resources if any
  if (Object.keys(resources).length > 0)
    for (const resource of Object.values(resources))
      displayEvents(resource, delimiter, indentation + 2)
  else tracker.tick(0) // Force-refresh the progress bar display
}
