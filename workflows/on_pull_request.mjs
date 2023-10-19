/**
 * @file This file is executed when a pull request is opened or updated.
 * It can be initiated via "kanban run on_pull_request", but should be executed by GitHub Actions.
 *
 * The following steps are executed:
 * - Create a milestone for the pull request, if it does not exist.
 * - Assign the milestone to the pull request, if it is not already assigned.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import semver from 'semver'

import * as github from '../src/utils/github.mjs'
import * as proc from '../src/utils/process.mjs'

const GITHUB_CONTEXT = JSON.parse(process.env.GITHUB_CONTEXT)

/**
 * The main entry point for this task.
 */
export default async function onPullRequest () {
  const pullRequest = GITHUB_CONTEXT?.event?.pull_request
  if (!pullRequest) {
    console.log('GITHUB_CONTEXT.event:\n' + JSON.stringify(GITHUB_CONTEXT.event, null, 2))
    throw new Error('This workflow can only be triggered by pull requests.')
  }

  // create the milestone associated with the pull request
  const milestoneName = await getMilestoneName(pullRequest)
  const milestone = await (async () => {
    const milestones = await github.api('milestones', { params: { state: 'open' } })
    const exists = milestones.find(milestone => milestone.title === milestoneName)
    if (exists) {
      console.log(`Milestone "${milestoneName}" already exists.`)
      return exists
    }
    const response = await github.api('milestones', {
      method: 'POST',
      body: {
        title: milestoneName
      }
    })
    const milestone = response[0]

    console.log(`Milestone "${milestoneName}" created.`)
    return milestone
  })()

  // add the milestone to the pull request
  if (pullRequest.milestone === null || pullRequest.milestone.number !== milestone.number) {
    console.log(`Assigning milestone "${milestone.title}" (${milestone.number}) to pull request #${pullRequest.number}.`)
    await github.api(pullRequest.issue_url, {
      method: 'PATCH',
      body: {
        milestone: `${milestone.number}`
      }
    })
  }
}

/**
 * Retrieves the milestone name for the pull request.
 * @param {object} pullRequest - The pull request to retrieve the milestone name from.
 * @returns {Promise<string>} The milestone name for the pull request.
 */
async function getMilestoneName (pullRequest) {
  const packageJsonFile = path.resolve(proc.getCurrentWorkingDirectory(), 'package.json')
  const packageJsonContent = await fs.promises.readFile(packageJsonFile, { encoding: 'utf-8' })
  const packageJson = JSON.parse(packageJsonContent)

  if (pullRequest.head.ref.endsWith('-release')) {
    const version = packageJson.version
    return version
  }

  const changelevel = getChangelevel(pullRequest)
  const version = semver.inc(packageJson.version, changelevel)
  return version
}

/**
 * Retrieves the changelevel of the pull request.
 * @param {object} pullRequest - The pull request to retrieve the changelevel from.
 * @returns {string} The changelevel of the pull request.
 * @throws {Error} Throws an error if the pull request does not contain a changelevel.
 */
function getChangelevel (pullRequest) {
  const changelevel = pullRequest.head.ref.match(/-(major|minor|patch)-\d+$/)
  if (changelevel === null) throw new Error('The pull request does not contain a changelevel.')
  return changelevel[1]
}
