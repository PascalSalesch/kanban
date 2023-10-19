/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Work in Progress (A branch is checked out).
 *
 * The task:
 * ├─ Commit and push changes.
 *
 * This should only be available if there are uncommited changes or if there are commits that have not been pushed.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import * as cmd from 'node:child_process'

import select from '../select.mjs'

import * as proc from '../utils/process.mjs'
import * as cli from '../utils/cli.mjs'
import * as git from '../utils/git.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const __root = path.resolve(__dirname, '..', '..')

/**
 * Commits any changes the user has made and pushes them to the remote.
 * - Checks if the user has installed the pre-commit hook.
 * - Asks the user if they want to install the pre-commit hook if they haven't already.
 * - Either way, executes the pre-commit hook.
 * - Commits the changes.
 * - Pushes the changes.
 */
export default async function commitAndPushChanges () {
  const cwd = proc.getCurrentWorkingDirectory()
  const branchName = await git.getCurrentBranch()

  if (await git.hasUncommitedChanges()) {
    // Check if the user has installed the pre-commit hook.
    if (!fs.existsSync(path.resolve(cwd, '.git', 'hooks', 'pre-commit'))) {
      // Ask the user if they want to install the pre-commit hook if they haven't already.
      const yesno = await cli.askQuestion('You have not installed the pre-commit hook. Do you want to install it now?', ['Yes', 'No'])
      if (yesno === 'Yes') installPreCommitHook()
    }

    // Execute the pre-commit hook.
    const hook = await import(path.resolve(__root, 'hooks', 'pre-commit.mjs'))
    await hook.default()

    // Get the current issue number from the last digits of the branch name.
    const issueNumber = branchName.match(/\d+$/)?.[0]
    if (!issueNumber) throw new Error(`Could not get the issue number from the branch name: ${branchName}`)

    // Commit the changes.
    const commitMessage = `Closes #${issueNumber}`
    cmd.execSync(`git add . && git commit -m "${commitMessage}"`, { cwd, stdio: 'inherit' })
  }

  // push to origin with the same branch name and set upstream
  cmd.execSync(`git push -u origin ${branchName}`, { cwd, stdio: 'inherit' })

  // open the initial menu
  await select()
}

/**
 * Whether this task is available.
 * @returns {Promise<boolean>} Whether this task is available.
 */
export async function isAvailable () {
  if (!(await git.hasCheckedOutBranch())) return false
  if (await git.hasUncommitedChanges()) return true
  if (await git.hasUnpushedCommits()) return true
  return false
}

/**
 * The prompt to show.
 * @returns {Promise<string>} The prompt to show.
 */
export async function getPrompt () {
  if (await git.hasUncommitedChanges()) return 'Commit and push changes'
  return 'Push changes'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 8
}

// =====================================================================================================================

/**
 * Installs the pre-commit hook.
 */
function installPreCommitHook () {
  const cwd = proc.getCurrentWorkingDirectory()
  const preCommitHook = path.resolve(cwd, '.git', 'hooks', 'pre-commit')

  // create directory if it doesn't exist
  if (!fs.existsSync(path.dirname(preCommitHook))) {
    fs.mkdirSync(path.dirname(preCommitHook), { recursive: true })
  }

  fs.copyFileSync(path.resolve(__root, 'hooks', 'pre-commit'), preCommitHook)
  fs.chmodSync(preCommitHook, 0o755)
}
