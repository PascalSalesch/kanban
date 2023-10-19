/**
 * @file This file is executed when a release is published.
 * It can be initiated via "kanban run on_release", but should be executed by GitHub Actions.
 *
 * The following steps are executed:
 * - Create a milestone for the next major, minor, and patch version, if they do not exist.
 * - Delete all milestones whose title suggests a version number lower than the release.
 * - Close the current milestone.
 * - Move all issues from the closed milestones to the next milestone.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import semver from 'semver'

import * as github from '../src/utils/github.mjs'
import * as proc from '../src/utils/process.mjs'

/**
 * The main entry point for this task.
 */
export default async function onRelease () {
  const version = await getVersion()
  const milestones = await github.api('milestones', { params: { state: 'open' } })

  // create milestones for the next major, minor, and patch version
  const next = { patch: null, minor: null, major: null }
  for (const changelevel of Object.keys(next)) {
    const milestoneName = semver.inc(version, changelevel)
    const exists = milestones.find(milestone => milestone.title === milestoneName)
    if (exists) {
      next[changelevel] = exists
      console.log(`Milestone "${milestoneName}" already exists.`)
      continue
    }
    try {
      const milestone = (await github.api('milestones', {
        method: 'POST',
        body: {
          title: milestoneName
        }
      }))[0]
      next[changelevel] = milestone
      console.log(`Milestone "${milestone.title}" created.`)
    } catch (err) {
      console.log(`Could not create milestone "${milestoneName}".`)
      console.error(err)
    }
  }

  // Delete all milestones whose title suggests a version number lower than or equal to the release.
  const milestonesToDelete = milestones.filter(milestone => {
    if (!(semver.valid(milestone.title))) return false
    return semver.lt(milestone.title, version)
  })
  for (const milestone of milestonesToDelete) {
    try {
      if (milestone.open_issues === 0 && milestone.closed_issues === 0) {
        console.log(`Deleting milestone "${milestone.title}" (${milestone.number}).`)
        await github.api(`milestones/${milestone.number}`, { method: 'DELETE' })
        continue
      }

      // If the milestone has issues, move them to the next milestone
      const issues = await github.api('issues', { params: { milestone: milestone.number } })
      for (const issue of issues) {
        const changelevel = await getChangelevelOfIssue(issue)
        const nextMilestone = next[changelevel]
        if (!nextMilestone) {
          console.log(`Could not find next milestone for changelevel "${changelevel}".`)
          console.log(`Issue "${issue.title}" (${issue.number}) will not be moved.`)
          continue
        }
        // move issue to next milestone
        console.log(`Moving issue "${issue.title}" (${issue.number}) from milestone "${milestone.title}" to "${nextMilestone.title}".`)
        await github.api(`issues/${issue.number}`, {
          method: 'PATCH',
          body: {
            milestone: nextMilestone.number
          }
        })
      }

      console.log(`Deleting milestone "${milestone.title}" (${milestone.number}).`)
      await github.api(`milestones/${milestone.number}`, { method: 'DELETE' })
    } catch (err) {
      console.log(`Could not close milestone "${milestone.title}" (${milestone.number}).`)
      console.error(err)
    }

    // close the current milestone
    const currentMilestones = milestones.filter(milestone => {
      if (!(semver.valid(milestone.title))) return false
      return semver.eq(milestone.title, version)
    })
    for (const milestone of currentMilestones) {
      try {
        console.log(`Closing milestone "${milestone.title}" (${milestone.number}).`)
        await github.api(`milestones/${milestone.number}`, {
          method: 'PATCH',
          body: {
            state: 'closed'
          }
        })
      } catch (err) {
        console.log(`Could not close milestone "${milestone.title}" (${milestone.number}).`)
        console.error(err)
      }
    }
  }
}

/**
 * Retrieves the changelevel of an issue.
 * @param {object} issue - The issue to retrieve the changelevel of.
 * @returns {Promise<"major"|"minor"|"patch">} The changelevel of the issue, either "major", "minor", or "patch".
 */
async function getChangelevelOfIssue (issue) {
  if (!issue.pull_request) return 'patch'
  const pullRequest = (await github.api(issue.pull_request.url))[0]
  if (pullRequest.head.ref.endsWith('-major')) return 'major'
  if (pullRequest.head.ref.endsWith('-minor')) return 'minor'
  return 'patch'
}

/**
 * Retrieves the version of the latest release.
 * It uses the latest release instead of the current ref because milestones are created for the next versions.
 * It has become common practice to not release versions lower than the latest release.
 * @returns {Promise<string>} The version of the release.
 */
async function getVersion () {
  const latestRelease = await github.getLatestRelease()
  const packageJsonFile = path.resolve(proc.getCurrentWorkingDirectory(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))

  // If the latest release is not a valid semver, return the current version
  // If the current version is lower than the latest release, return the latest release
  if (!(semver.valid(latestRelease.tag_name))) return packageJson.version
  if (semver.lt(packageJson.version, latestRelease.tag_name)) return latestRelease.tag_name
  return packageJson.version
}
