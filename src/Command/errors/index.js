import withTracker from "../../with-tracker/index.js"
import { call } from "../throttle.js"
import { stable as stableStatuses } from "../statuses.js"
import displayEvents from "./displayEvents.js"
import {
  CloudFormationClient,
  DescribeStackEventsCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Retrieve the errors for a failed stack deployment, recursively for nested
 * stacks
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name or id of the stack
 * @param {Date} [params.timestamp1] The most recent date to filter events
 * @param {Date} [params.timestamp2] The oldest date to filter events
 * @param {String} [params.parentStackId] Recursively keep track of the parent
 * stack
 * @return {Object} The errors info
 */
async function getErrors({
  region,
  stackName,
  timestamp1,
  timestamp2,
  parentStackId,
}) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  this.tracker.setStatus("retrieving errors")
  // Retrieve all relevant events
  let nextToken,
    lastTimestamp,
    events = []
  do {
    const { StackEvents: eventsPage = [], NextToken } = await call(
      cf,
      cf.send,
      new DescribeStackEventsCommand({
        StackName: stackName,
        NextToken: nextToken,
      })
    )
    nextToken = NextToken // Update the token
    if (!eventsPage.length) return // If no events were found
    // First timestamp we encounter is considered most recent to include, as
    // events are retrieved in reverse chronological order, and we assume the
    // last event to be about the stack itself since we waited for it to be in
    // a stable status
    if (!timestamp1) timestamp1 = eventsPage[0].Timestamp
    // Attempt to retrieve the next timestamp boundary
    const nextStackEvents = eventsPage.filter(
      ({ StackId, PhysicalResourceId, Timestamp, ResourceStatus }) =>
        // Event is about the parent stack
        StackId === (parentStackId || PhysicalResourceId) &&
        // Event describes the stack in a stable status
        stableStatuses.includes(ResourceStatus) &&
        // Event is older than our upper boundary
        Timestamp < timestamp1
    )
    if (nextStackEvents.length) timestamp2 = nextStackEvents[0].Timestamp
    lastTimestamp = eventsPage[eventsPage.length - 1].Timestamp
    // Filter relevant events
    const nextEvents = eventsPage.filter(
      ({ Timestamp, ResourceStatus, ResourceStatusReason }) =>
        // Event is within timestamp1 and timestamp2
        Timestamp <= timestamp1 &&
        (Timestamp > timestamp2 || !timestamp2) &&
        // Event is an error
        /[A-Z]+_FAILED$/.test(ResourceStatus) &&
        ResourceStatusReason !== "Resource creation cancelled"
    )
    // Add relevant events
    events = events.concat(nextEvents)
    // Continue retrieving events while there are more to retrieve and they are
    // still more recent than our lower boundary (if we have one)
  } while (nextToken && (!timestamp2 || lastTimestamp > timestamp2))
  // Assemble errors recursively
  const errors = await events.reduce(
    async (
      errors,
      {
        LogicalResourceId,
        Timestamp,
        ResourceStatus,
        ResourceStatusReason,
        StackId,
        PhysicalResourceId,
        ResourceType,
      }
    ) => {
      errors = await errors // Retrieve object, since this is an async reduce
      if (StackId !== PhysicalResourceId) {
        // If event is about a stack resource
        if (!errors.resources) errors.resources = {} // Initialize
        if (!errors.resources[LogicalResourceId]) {
          // If info about the current resource hasn't been set yet
          Object.assign(errors.resources, {
            [LogicalResourceId]: {
              LogicalResourceId,
              Timestamp,
              ResourceStatus,
              ResourceStatusReason,
            },
          })
          if (
            ResourceType === "AWS::CloudFormation::Stack" &&
            PhysicalResourceId
          )
            // If current resource is a nested stack
            Object.assign(
              errors.resources[LogicalResourceId],
              await getErrors.call(this, {
                region,
                stackName: PhysicalResourceId,
                timestamp1,
                timestamp2,
                parentStackId: parentStackId || StackId,
              })
            )
        }
      }
      return errors
    },
    Promise.resolve({})
  )
  if (!parentStackId)
    // Display errors before final return
    displayEvents.call(this.tracker, errors)
  return errors
}

export default withTracker()(getErrors)
