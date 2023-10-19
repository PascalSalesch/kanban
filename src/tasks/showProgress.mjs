/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Idle (No branch is checked out).
 *
 * The task:
 * └─ In Progress.
 */

import * as cmd from 'node:child_process'

import select from '../select.mjs'

import exec from '../utils/exec.mjs'
import * as cli from '../utils/cli.mjs'
import * as git from '../utils/git.mjs'
import * as github from '../utils/github.mjs'

/**
 * Shows issues that are assigned and don't have a Pull Request yet.
 * Shows Pull Requests that are assigned a reviewer.
 */
export default async function showProgress () {
  // retrieve the pull requests and issues in progress.
  const username = await git.getUsername()
  const inProgressData = await getInProgress()
  const inProgress = [
    ...inProgressData.reviews.map(pull => (pull.assignees.length ? pull.assignees : [pull.user]).map(assignee => ({
      name: `${assignee.login} is requested to feedback on "${pull.title}"`,
      value: { type: 'pull', pull }
    }))).flat(),
    ...inProgressData.changes.map(pull => pull.requested_reviewers.map(reviewer => ({
      name: `${reviewer.login} is assigned reviewer of "${pull.title}"`,
      value: { type: 'pull', pull }
    }))).flat(),
    ...inProgressData.issues.map(issue => issue.assignees.map(assignee => ({
      name: `${assignee.login} is assigned to "${issue.title}"`,
      value: { type: 'issue', issue }
    }))).flat()
  ].sort((a, b) => {
    if (a.name.startsWith(username) && b.name.startsWith(username)) return a.name.localeCompare(b.name)
    if (a.name.startsWith(username)) return -1
    if (b.name.startsWith(username)) return 1
    return a.name.localeCompare(b.name)
  })

  // show the prompt.
  const { type, pull, issue } = await cli.askQuestion('The following pull requests and issues are in progress', [
    ...inProgress,
    {
      name: '\x1b[90mReturn\x1b[0m',
      value: { type: 'return' }
    }
  ])

  // handle the selected option.
  if (type === 'pull' && await showPull(pull) === 'return') return
  if (type === 'issue' && await showIssue(issue) === 'return') return
  select()
}

/**
 * Whether this task is available.
 * @returns {Promise<boolean>} Whether this task is available.
 */
export async function isAvailable () {
  if (await git.hasCheckedOutBranch()) return false
  return true
}

/**
 * The prompt to show.
 * @returns {string} The prompt to show.
 */
export function getPrompt () {
  return 'In Progress'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 7
}

// =====================================================================================================================

/**
 * Retrieves the pull requests and issues in progress.
 * @returns {Promise<object>} An object containing the pull requests and issues in progress.
 */
async function getInProgress () {
  // Pulls that have a review requested.
  // Pulls that have a "change requested" review.
  const allPulls = await github.api('pulls', { params: { state: 'open' } })
  const reviews = []
  const changes = []
  for (const pull of allPulls) {
    if (pull.draft) continue
    if (pull.requested_reviewers.length === 0) continue
    const existingReviews = await github.api(`pulls/${pull.number}/reviews`)
    if (existingReviews.length === 0) reviews.push(pull)
    else if (existingReviews.some(review => review.state === 'CHANGES_REQUESTED')) changes.push(pull)
  }

  // issues that are assigned to someone but don't have a pull request yet.
  const allIssues = await github.api('issues', { params: { state: 'open' } })
  const allAssignedIssues = allIssues.filter(issue => issue.assignees.length)
  const issues = []
  for (const issue of allAssignedIssues) {
    if (issue.draft) continue
    if (issue.pull_request) continue
    const issuePulls = allPulls.filter(pull => pull.head.ref.endsWith(`-${issue.number}`))
    if (issuePulls.length === 0) issues.push(issue)
  }

  return {
    reviews,
    changes,
    issues
  }
}

/**
 * Shows the pull request.
 * @param {object} pull - The pull request to show.
 * @returns {Promise<string>} The task to execute after showing the pull request.
 */
async function showPull (pull) {
  while (true) {
    const prompt = `# ${pull.title}\n${'='.repeat(pull.title.length + 2)}\n\n${pull.body || ''}\n\nWhat would you like to do?`
    const task = await cli.askQuestion(prompt, [
      {
        name: `Open ${pull.html_url} in the browser`,
        value: 'open'
      },
      {
        name: `Checkout ${pull.head.ref}`,
        value: 'checkout'
      },
      {
        name: '\x1b[90mReturn\x1b[0m',
        value: 'return'
      }
    ])
    if (task === 'return') {
      showProgress()
      return 'return'
    }
    if (task === 'open') cmd.spawn('open', [pull.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()
    if (task === 'checkout') {
      cmd.execSync(`git fetch origin && git checkout ${pull.head.ref}`, { stdio: 'inherit' })
      break
    }
  }
}

/**
 * Shows the issue.
 * @param {object} issue - The issue to show.
 * @returns {Promise<string>} The task to execute after showing the issue.
 */
async function showIssue (issue) {
  const username = await git.getUsername()
  const prompt = `# ${issue.title}\n${'='.repeat(issue.title.length + 2)}\n\n${issue.body || ''}\n\nWhat would you like to do?`

  while (true) {
    const task = await cli.askQuestion(prompt, [
      {
        name: `Open ${issue.html_url} in the browser`,
        value: 'open'
      },
      issue.assignees.find(assignee => assignee.login === username) && {
        name: `Start working on #${issue.number}`,
        value: 'checkout'
      },
      {
        name: '\x1b[90mReturn\x1b[0m',
        value: 'return'
      }
    ].filter(Boolean))
    if (task === 'return') {
      showProgress()
      return 'return'
    }
    if (task === 'open') cmd.spawn('open', [issue.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()
    if (task === 'checkout') {
      const defaultBranch = await git.getDefaultBranch()
      const branchName = `${username}-patch-${issue.number}`
      if (await git.branchExists(branchName)) cmd.execSync(`git checkout ${branchName}`, { stdio: 'inherit' })
      else cmd.execSync(`git checkout -t origin/${defaultBranch} -b ${branchName}`, { stdio: 'inherit' })
      await exec(`git push --set-upstream origin ${branchName}`)
      break
    }
  }
}
