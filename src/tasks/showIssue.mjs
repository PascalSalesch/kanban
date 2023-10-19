/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Work in Progress (A branch is checked out).
 *
 * The task:
 * └─ Show the currently selected issue.
 */

import * as cmd from 'node:child_process'

import select from '../select.mjs'

import * as cli from '../utils/cli.mjs'
import * as git from '../utils/git.mjs'
import * as github from '../utils/github.mjs'

/**
 * Shows the currently selected issue.
 */
export default async function showIssue () {
  const pullRequest = await github.getPullRequest()
  let showSelect = true
  while (true) {
    const issue = await github.getIssue()
    const prompt = `# ${issue.title}\n${'='.repeat(issue.title.length + 2)}\n\n${issue.body}\n\nWhat would you like to do?`
    const gitUsername = await git.getUsername()
    const isAssigned = (issue.assignees.find((assignee) => assignee.login === gitUsername))
    const tasks = [
      { name: `Continue working on #${issue.number}`, value: 'exit' },
      !isAssigned && { name: `Assign myself to #${issue.number}`, value: 'assign' },
      { name: `Open ${issue.html_url}`, value: 'openIssue' },
      pullRequest && { name: `Open ${pullRequest.html_url}`, value: 'openPullRequest' },
      { name: '\x1b[90mReturn\x1b[0m', value: 'return' }
    ].filter((task) => Boolean(task))

    const taskName = await cli.askQuestion(prompt, tasks)
    if (taskName === 'exit') {
      showSelect = false
      break
    } else if (taskName === 'return') {
      break
    } else if (taskName === 'assign') {
      const assignees = [...(issue.assignees.map((assignee) => assignee.login)), gitUsername]
      await github.api(`issues/${issue.number}/assignees`, {
        method: 'POST',
        body: {
          assignees
        }
      })
    } else if (taskName === 'openIssue') {
      cmd.spawn('open', [issue.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()
    } else if (taskName === 'openPullRequest') {
      cmd.spawn('open', [pullRequest.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()
    }
  }

  if (showSelect) select()
}

/**
 * Whether this task is available.
 * @returns {Promise<boolean>} Whether this task is available.
 */
export async function isAvailable () {
  if (!(await git.hasCheckedOutBranch())) return false

  const branchName = await git.getCurrentBranch()
  const issueNumber = branchName.match(/\d+$/)?.[0]
  if (!issueNumber) return false

  return true
}

/**
 * The prompt to show.
 * @returns {Promise<string>} The prompt to show.
 */
export async function getPrompt () {
  const branchName = await git.getCurrentBranch()
  const issueNumber = branchName.match(/\d+$/)?.[0]
  return `Show details for #${issueNumber}`
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 3
}
