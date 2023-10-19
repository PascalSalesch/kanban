/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Idle (No branch is checked out).
 *
 * The task:
 * └─ Backlog.
 */

import * as cmd from 'node:child_process'

import select from '../select.mjs'

import * as git from '../utils/git.mjs'
import * as github from '../utils/github.mjs'
import * as cli from '../utils/cli.mjs'

/**
 * Pick an Issue from the Backlog. The Backlog consists of:
 * - Pull Requests that the user opened and changes were requested.
 * - Pull Requests where the user is assigned, and no review exists yet.
 * - Pull Requuests where no one is assigned.
 * - Issues that are not assigned to anyone.
 * - > Excluded are issues labeled with: `question`, `wontfix`, `duplicate`, `invalid`
 * - > Issues are sorted by the amount reactions.
 *
 * @returns {Promise<void>} A Promise that resolves when the task is done.
 */
export default async function showBacklog () {
  const personal = '\x1b[33m→\x1b[0m'
  const backlog = await getBacklog()
  const { type, pull, issue } = await cli.askQuestion('What do you want to work on?', [
    ...backlog.changesRequested.map(pull => ({
      name: `${personal} Address feedback: "${pull.title}"`,
      value: {
        type: 'pull',
        pull
      }
    })),
    ...backlog.requestedReviewer.map(pull => ({
      name: `${personal} Review "${pull.title}"`,
      value: {
        type: 'pull',
        pull
      }
    })),
    ...backlog.assignedIssues.map(issue => ({
      name: `${personal} ${issue.title}`,
      value: {
        type: 'issue',
        issue
      }
    })),
    ...backlog.noreviewer.map(pull => ({
      name: `Review "${pull.title}"`,
      value: {
        type: 'pull',
        pull
      }
    })),
    ...backlog.noassigneeIssue.map(issue => ({
      name: issue.title,
      value: {
        type: 'issue',
        issue
      }
    })),
    {
      name: '\x1b[90mCreate a new issue\x1b[0m',
      value: {
        type: 'createIssue'
      }
    },
    {
      name: '\x1b[90mReturn\x1b[0m',
      value: {
        type: 'return'
      }
    }
  ].filter(Boolean))

  // return to the main menu
  if (type === 'return') {
    select()
    return
  }

  // create a new issue
  if (type === 'createIssue') {
    const origin = await git.getOrigin()
    const url = `https://github.com/${origin.org}/${origin.repo}/issues/new`
    const prompt = `Do you want to open ${url} in your browser?`
    const yesno = await cli.askQuestion(prompt, ['Yes', 'No'])
    if (yesno === 'Yes') cmd.spawn('open', [url], { stdio: 'ignore', detached: true, shell: true }).unref()
  }

  // ask if user what to do next
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
  return 'Backlog'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 10
}

// =====================================================================================================================

/**
 * Retrieves the backlog.
 * @returns {Promise<object>} An object containing the pull requests and issues in the backlog.
 */
async function getBacklog () {
  const username = await git.getUsername()
  const pulls = await github.api('pulls', { params: { state: 'open' } })
  const issues = (await github.api('issues', {
    params: {
      state: 'open',
      pulls: false
    }
  }))

  // Pull Requests where no one is assigned.
  const noreviewer = pulls.filter(pull => !pull.requested_reviewers.length)

  // Pull Requests where the user did not review yet
  const requestedReviewer = []
  for (const pr of pulls.filter(pull => pull.requested_reviewers.find(reviewer => reviewer.login === username))) {
    const reviews = await github.api(`pulls/${pr.number}/reviews`)
    const review = reviews.find(review => review.user.login === username)
    if (!review) requestedReviewer.push(pr)
  }

  // Pull Requests that the user opened or is assigned to and changes were requested.
  const changesRequested = []
  for (const pull of pulls) {
    const assignees = pull.assignees.length ? pull.assignees : [pull.user]
    const isAssigned = assignees.find(assignee => assignee.login === username)
    if (!isAssigned) continue
    const reviews = await github.api(`pulls/${pull.number}/reviews`)
    const requestedChanges = reviews.filter(review => review.state === 'CHANGES_REQUESTED')
    if (requestedChanges.length) changesRequested.push(pull)
  }

  // Issues where the user is assigned, but no pull request exists yet.
  const assignedIssues = issues
    .filter(issue => issue.assignees.find(assignee => assignee.login === username))
    .filter(issue => !pulls.find(pull => pull.head.ref.endsWith(`-${issue.number}`)))

  // Issues that are not assigned to anyone.
  const blockedLabels = ['question', 'wontfix', 'duplicate', 'invalid']
  const noassigneeIssue = issues.filter(issue => {
    if (issue.assignees.length) return false
    if (issue.labels.find(label => blockedLabels.includes(label.name))) return false
    if (issue.draft) return false
    if (issue.pull_request) return false
    return true
  }).sort((a, b) => {
    const aCount = a.reactions.total_count + a.reactions['+1'] - a.reactions['-1'] - a.reactions['-1']
    const bCount = b.reactions.total_count + b.reactions['+1'] - b.reactions['-1'] - b.reactions['-1']
    return bCount - aCount
  })

  return {
    requestedReviewer,
    noreviewer,
    changesRequested,
    assignedIssues,
    noassigneeIssue
  }
}

/**
 * Shows a pull request.
 * @param {object} pull - The pull request to show.
 * @returns {Promise<string>} A Promise that resolves with the action to take.
 */
async function showPull (pull) {
  while (true) {
    const prompt = `# ${pull.title}\n${'='.repeat(pull.title.length + 2)}\n\n${pull.body || ''}\n\nWhat would you like to do?`
    const action = await cli.askQuestion(prompt, [
      { name: 'Open Pull Request in browser', value: 'open' },
      { name: `Checkout "${pull.head.ref}"`, value: 'checkout' },
      { name: '\x1b[90mReturn\x1b[0m', value: 'return' }
    ])
    if (action === 'open') {
      cmd.spawn('open', [pull.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()
    } else if (action === 'checkout') {
      const branchName = pull.head.ref
      if (await git.branchExists(branchName)) cmd.execSync(`git checkout ${branchName}`, { stdio: 'inherit' })
      else cmd.execSync(`git checkout -t origin/${branchName} -b ${branchName}`, { stdio: 'inherit' })
      break
    } else if (action === 'return') {
      showBacklog()
      return 'return'
    }
  }
}

/**
 * Shows an issue.
 * @param {object} issue - The issue to show.
 * @returns {Promise<string>} A Promise that resolves with the action to take.
 */
async function showIssue (issue) {
  while (true) {
    const prompt = `# ${issue.title}\n${'='.repeat(issue.title.length + 2)}\n\n${issue.body || ''}\n\nWhat would you like to do?`
    const action = await cli.askQuestion(prompt, [
      { name: `Start working on #${issue.number}`, value: 'checkout' },
      { name: `Open #${issue.number} in browser`, value: 'open' },
      { name: '\x1b[90mReturn\x1b[0m', value: 'return' }
    ])
    if (action === 'open') {
      cmd.spawn('open', [issue.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()
    } else if (action === 'checkout') {
      let username = await git.getUsername()
      if (!username) {
        username = await cli.askQuestion('What is your GitHub username?')
        cmd.execSync(`git config --local github.user "${username}"`, { stdio: 'inherit' })
      }
      cmd.execSync(`git checkout -b "${username}-patch-${issue.number}"`, { stdio: 'inherit' })

      // ask the user if they want to assign themselves to the issue
      const assignee = await cli.askQuestion('Do you want to assign yourself to this issue?', ['Yes', 'No'])
      if (assignee === 'Yes') {
        await github.api(`issues/${issue.number}/assignees`, {
          method: 'POST',
          body: {
            assignees: [username]
          }
        })
      }
      break
    } else if (action === 'return') {
      showBacklog()
      return 'return'
    }
  }
}
