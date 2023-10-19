/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Work in Progress (A branch is checked out).
 *
 * The task:
 * └─ Open a pull request.
 *
 * This task is only available if the following conditions are met:
 * - The current branch does not have uncommited changes.
 * - The current branch does not have unpushed commits.
 * - The current branch is ahead of the remote.
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'

import select from '../select.mjs'

import * as git from '../utils/git.mjs'
import * as github from '../utils/github.mjs'
import * as proc from '../utils/process.mjs'
import * as cli from '../utils/cli.mjs'

const cwd = proc.getCurrentWorkingDirectory()
const templateExpressions = [
  path.resolve(cwd, '.github', 'PULL_REQUEST_TEMPLATE', '.*\\.md'),
  path.resolve(cwd, '.github', 'PULL_REQUEST_TEMPLATES', '.*\\.md'),
  path.resolve(cwd, '.github', 'PULL_REQUEST_TEMPLATE\\.md'),
  path.resolve(cwd, 'docs', 'PULL_REQUEST_TEMPLATE', '.*\\.md'),
  path.resolve(cwd, 'docs', 'PULL_REQUEST_TEMPLATES', '.*\\.md'),
  path.resolve(cwd, 'docs', 'PULL_REQUEST_TEMPLATE\\.md')
]

/**
 * Opens a pull request.
 * - Checks if there are any PULL_REQUEST templates.
 * - Asks the user to select a PULL_REQUEST template.
 * - Asks the user for the title of the PULL_REQUEST.
 * - Creates a pull request with the selected PULL_REQUEST template.
 */
export default async function openPullRequest () {
  // check issue number
  const oldBranchName = await git.getCurrentBranch()
  const issueNumber = oldBranchName.match(/\d+$/)[0] || null
  if (!issueNumber) throw new Error('Could not find issue number in the last part of the branch name.')

  // get the changelevel
  const changelevel = await cli.askQuestion('What changelevel is this?', [
    { name: 'Patch (Bugfixes, typos, etc.)', value: 'patch' },
    { name: 'Minor (New features, etc.)', value: 'minor' },
    { name: 'Major (Breaking changes, etc.)', value: 'major' }
  ])

  // rename the current branch, if the changelevel is different
  const oldBranchParts = oldBranchName.split('-')
  const oldChangelevel = oldBranchParts.splice(-2, 1)[0]
  if (oldChangelevel !== changelevel) {
    const username = await git.getUsername()
    const branchName = `${username}-${changelevel}-${issueNumber}`
    const yesno = await cli.askQuestion(`Do you want to rename the current branch from "${oldBranchName}" to "${branchName}"?`, ['Yes', 'No'])
    if (yesno === 'Yes') cmd.execSync(`git branch -m ${branchName}`)
    if (yesno === 'No') {
      console.log('Please rename the branch manually.')
      return
    }
  }

  // push the current branch
  const branchName = await git.getCurrentBranch()
  cmd.execSync(`git push -u origin ${branchName}`)

  // resolve all globs
  const templates = (await Promise.all(templateExpressions.map(regex => proc.regex(regex)))).flat()
  const templateOptions = templates.map(template => {
    const title = fs.readFileSync(template, 'utf8').split('\n').find(line => line.startsWith('# '))?.replace('# ', '').trim()
    return {
      name: title || path.relative(cwd, template),
      value: template
    }
  })

  // select a template
  const template = templateOptions.length === 0 ? path.resolve(cwd, 'pull_request.md') : await cli.askQuestion('Select a template:', templateOptions)

  // get the title
  const title = await cli.askQuestion('What is the title of this pull request?')

  // update the template
  const file = template.replace(/.md$/, '.tmp.md')
  const question = 'Please update the template to reflect the changes you made in this branch. Select "Continue" when you are done.'
  const templateBody = (fs.existsSync(template) ? await fs.promises.readFile(template, 'utf8') : '# {{title}}\n\nCloses #{{issueNumber}}\n')
    .replace(/\{{changelevel}}/g, changelevel)
    .replace(/\{{issueNumber}}/g, issueNumber)
    .replace(/\{{title}}/g, title)
  const body = await cli.askFileInput(question, file, templateBody)
  if (!body) return

  // create the pull request
  const pull = (await github.api('pulls', {
    method: 'POST',
    body: {
      title,
      body,
      head: await git.getCurrentBranch(),
      base: await git.getDefaultBranch()
    }
  }))[0]

  const open = await cli.askQuestion(`Pull request created: ${pull.html_url}\nPress "Enter" to continue.`, ['Continue', 'Open in browser'])
  if (open === 'Open in browser') cmd.spawn('open', [pull.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()

  // set upstream for the default branch
  const defaultBranch = await git.getDefaultBranch()
  cmd.execSync(`git branch --set-upstream-to=origin/${defaultBranch} ${defaultBranch}`)

  // pull the default branch
  cmd.execSync(`git pull origin ${defaultBranch}`)

  // checkout the default branch
  cmd.execSync(`git checkout ${defaultBranch}`)

  // ask the user if they want to delete the old branch
  const yesno = await cli.askQuestion(`Do you want to delete the local "${branchName}" branch?`, ['Yes', 'No'])
  if (yesno === 'Yes') cmd.execSync(`git branch -d ${branchName}`)

  // ask the user what they want to do next
  select()
}

/**
 * Whether this task is available.
 * @returns {Promise<boolean>} Whether this task is available.
 */
export async function isAvailable () {
  if (!(await git.hasCheckedOutBranch())) return false
  if (await git.hasUncommitedChanges()) return false
  if (await git.hasUnpushedCommits()) return false
  if (!(await git.hasPushedCommits())) return false
  if (await github.getPullRequest()) return false
  return true
}

/**
 * The prompt to show.
 * @returns {string} The prompt to show.
 */
export function getPrompt () {
  return 'Open a pull request'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 5
}
