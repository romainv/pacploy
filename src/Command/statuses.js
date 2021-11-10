// This aims at consolidating the possible stack statuses and grouping them to
// use in different situations

// All possible statuses
export default [
  "CREATE_COMPLETE",
  "CREATE_IN_PROGRESS",
  "CREATE_FAILED",
  "DELETE_COMPLETE",
  "DELETE_FAILED",
  "DELETE_IN_PROGRESS",
  "REVIEW_IN_PROGRESS	",
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "ROLLBACK_IN_PROGRESS",
  "UPDATE_COMPLETE",
  "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
  "UPDATE_IN_PROGRESS",
  "UPDATE_ROLLBACK_COMPLETE",
  "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
  "UPDATE_ROLLBACK_FAILED",
  "UPDATE_ROLLBACK_IN_PROGRESS",
  "IMPORT_IN_PROGRESS",
  "IMPORT_COMPLETE",
  "IMPORT_ROLLBACK_IN_PROGRESS",
  "IMPORT_ROLLBACK_FAILED",
  "IMPORT_ROLLBACK_COMPLETE",
]

// Statuses indicating the stack is available
export const available = [
  "CREATE_COMPLETE",
  "UPDATE_COMPLETE",
  "UPDATE_ROLLBACK_COMPLETE",
]

// Statuses indicating the stack is new
export const isNew = [
  "NEW",
  "REVIEW_IN_PROGRESS",
  "CREATE_FAILED",
  "ROLLBACK_COMPLETE",
]

// Statuses indicating the stack can be created or updated
export const canBeModified = [...available, ...isNew]

// Statuses indicating the stack needs to be deleted before being modified
export const needsDelete = [
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "DELETE_FAILED",
]

// Statuses indicating deployment succeeded
export const deploySuccess = ["UPDATE_COMPLETE", "CREATE_COMPLETE"]

// Statuses indicating deployment failed
export const deployFailed = [
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "DELETE_FAILED",
  "CREATE_FAILED",
  "UPDATE_ROLLBACK_COMPLETE",
  "UPDATE_ROLLBACK_FAILED",
]

// List of status for which a stack has no operation in progress
export const stable = [
  "NEW",
  "CREATE_FAILED",
  "CREATE_COMPLETE",
  "ROLLBACK_FAILED",
  "ROLLBACK_COMPLETE",
  "DELETE_FAILED",
  "DELETE_COMPLETE",
  "UPDATE_COMPLETE",
  "UPDATE_ROLLBACK_FAILED",
  "UPDATE_ROLLBACK_COMPLETE",
  "REVIEW_IN_PROGRESS",
  "IMPORT_COMPLETE",
  "IMPORT_ROLLBACK_FAILED",
  "IMPORT_ROLLBACK_COMPLETE",
]

// Indicate a stack was successfully created
export const createSuccess = ["CREATE_COMPLETE"]

// Indicate a stack failed to be created
export const createFailed = ["CREATE_FAILED", "FAILED"]

// Indicate a stack was successfully deleted
export const deleteSuccess = ["DELETE_COMPLETE", "NEW"]

// Indicate a stack failed to be deleted
export const deleteFailed = ["DELETE_FAILED"]
