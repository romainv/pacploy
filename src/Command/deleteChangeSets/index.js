import withTracker from "../../with-tracker/index.js"
import { call } from "../throttle.js"
import getChangeSets from "./getChangeSets.js"
import {
  CloudFormationClient,
  DeleteChangeSetCommand,
} from "@aws-sdk/client-cloudformation"

/**
 * Delete the change sets associated with a stack
 * @param {Object} params The function parameters
 * @param {String} params.region The stack's region
 * @param {String} params.stackName The name of the deployed stack
 * @param {Boolean} [params.confirm=true] Whether to ask for confirmation
 * before the deletion of change sets
 * @return {Array} The list of deleted change set ids
 */
async function deleteChangeSets({ region, stackName, confirm = true }) {
  const cf = new CloudFormationClient({ apiVersion: "2010-05-15", region })
  // Retrieve list of change sets
  const changeSets = await getChangeSets.call(this, { region, stackName })
  // Ask confirmation
  if (
    confirm &&
    !(await this.tracker.confirm(`Delete changeSets for stack ${stackName}?`))
  )
    return // Quit if not confirmed
  const changeSetsToDelete = changeSets.map(({ ChangeSetId }) => ChangeSetId)
  // Delete each change set
  const changeSetsDeleted = []
  await Promise.all(
    changeSetsToDelete.map(async (changeSetId) => {
      try {
        await call(
          cf,
          cf.send,
          new DeleteChangeSetCommand({ ChangeSetName: changeSetId })
        )
        changeSetsDeleted.push(changeSetId)
        this.tracker.setStatus(
          [
            `${changeSetsDeleted.length} of ${changeSetsToDelete.length}`,
            "change sets deleted",
          ].join(" ")
        )
      } catch (err) {
        this.tracker.interruptError(
          `Failed to delete change set ${changeSetId}`
        )
        throw err
      }
    })
  )
  return changeSetsDeleted
}

export default withTracker()(deleteChangeSets)
