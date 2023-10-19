/**
 * @file This hook is executed before a commit is made.
 */

import * as git from '../src/utils/git.mjs'

/**
 * Validates the current state of the repository before a commit is made.
 *
 * The Branch name should consist of three parts, seperated by a dash: `username-changelevel-issue`.
 * - The username of the assignee.
 * - The changelevel in semver: `major`, `minor`, `patch`.
 * - The Issue number, or the word `release` for a release branch.
 */
export default async function preCommitHook () {
  const gitUsername = await git.getUsername()
  const branchName = await git.getCurrentBranch()
  const branchParts = branchName.split('-')
  if (branchParts.length < 3) {
    throw new Error(`The branch name "${branchName}" should consist of three parts, seperated by a dash: ${gitUsername}-major|minor|patch-issueNumber`)
  }

  const issueNumber = branchParts.pop()
  const changeLevel = branchParts.pop()
  const username = branchParts.join('-')

  // validate that the issue number consists of only numbers
  if (issueNumber !== 'release' && !issueNumber.match(/^\d+$/)) {
    throw new Error(`The issue number should consist of only numbers: ${issueNumber}`)
  }

  // validate that the change level is one of the following: major, minor, patch
  if (!['major', 'minor', 'patch'].includes(changeLevel)) {
    throw new Error(`The change level should be one of the following: major, minor, patch: ${changeLevel}`)
  }

  // validate that the username is equal to the currently configured git username
  // either "user.name" or "github.user"
  if (username.toLowerCase() !== gitUsername.toLowerCase()) {
    throw new Error(`The git username "${gitUsername}" should be equal to the username provided in the branch name: ${username}`)
  }
}
