/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Work in Progress (A branch is checked out).
 *
 * The task:
 * └─ Stop working on the current issue.
 */

import * as cmd from 'node:child_process'

import select from '../select.mjs'

import * as git from '../utils/git.mjs'
import * as github from '../utils/github.mjs'
import * as cli from '../utils/cli.mjs'

/**
 * Stops working on an issue.
 * - Asks the user if they want unassign themselves from the issue.
 * - Asks the user if they want to delete the branch.
 * - Checks out the default branch.
 */
export default async function stopWorkingOnIssue () {
  // check issue number
  const branchName = await git.getCurrentBranch()
  const issueNumber = branchName.match(/\d+$/)?.[0]

  // checkout the default branch
  const defaultBranch = await git.getDefaultBranch()
  cmd.execSync(`git checkout ${defaultBranch}`)

  // pull the latest changes
  cmd.execSync(`git pull origin ${defaultBranch}`)

  // ask the user if they want to delete the old branch
  const yesno = await cli.askQuestion(`Do you want to delete the local "${branchName}" branch?`, ['Yes', 'No'])
  if (yesno === 'Yes') cmd.execSync(`git branch -d ${branchName}`)

  // ask the user if they want to unassign themselves from the issue
  if (issueNumber) {
    const username = await git.getUsername()
    const yesno = await cli.askQuestion(`Do you want to unassign "${username}" from issue #${issueNumber}?`, ['Yes', 'No'])
    if (yesno === 'Yes') {
      await github.api(`issues/${issueNumber}/assignees`, {
        method: 'DELETE',
        body: {
          assignees: [username]
        }
      })
    }
  }

  // ask the user what they want to do next
  select()
}

/**
 * Whether this task is available.
 * @returns {Promise<boolean>} Whether this task is available.
 */
export async function isAvailable () {
  if (!(await git.hasCheckedOutBranch())) return false
  return true
}

/**
 * The prompt to show.
 * @returns {string} The prompt to show.
 */
export async function getPrompt () {
  const branchName = await git.getCurrentBranch()
  const issueNumber = branchName.match(/\d+$/)?.[0]
  if (!issueNumber) return 'Stop working on the current issue'
  return `Stop working on #${issueNumber}`
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 1
}
