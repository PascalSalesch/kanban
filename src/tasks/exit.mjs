/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Idle (No branch is checked out).
 * - Work in Progress (A branch is checked out).
 *
 * The task:
 * ├─ Exit. (Only if the user is idle)
 * └─ Continue working on the current issue (Only if work is in progress).
 */

import * as git from '../utils/git.mjs'

/**
 * Exits the application.
 */
export default async function exit () {
}

/**
 * Whether this task is available.
 * @returns {boolean} Whether this task is available.
 */
export function isAvailable () {
  return true
}

/**
 * The prompt to show.
 * @returns {Promise<string>} The prompt to show.
 */
export async function getPrompt () {
  if (await git.hasCheckedOutBranch()) {
    const branchName = await git.getCurrentBranch()
    const issueNumber = branchName.match(/\d+$/)?.[0]
    return `Continue working on #${issueNumber}`
  }
  return '\x1b[90mExit\x1b[0m'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {Promise<number>} The priority of this task as a number from 1 to 10.
 */
export async function getPriority () {
  if (await git.hasCheckedOutBranch()) return 10
  return 1
}
