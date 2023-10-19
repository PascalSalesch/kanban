/**
 * @file This file is executed when a pull request has been successfully merged.
 * It can be initiated via "kanban run on_pull_request_merge", but should be executed by GitHub Actions.
 *
 * A branch of a pull request is considered a release, if it ends with "-release".
 *
 * No steps are executed, if the pull request is not a release.
 *
 * The following steps are executed, if the pull request is a release:
 * - Create a release, if it does not exist.
 * - Publish the release.
 * - Dispatch all workflows that end with "on_release.yml".
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import * as git from '../src/utils/git.mjs'
import * as github from '../src/utils/github.mjs'
import * as proc from '../src/utils/process.mjs'

const GITHUB_CONTEXT = JSON.parse(process.env.GITHUB_CONTEXT)

/**
 * The main entry point for this task.
 * @returns {Promise<void>}
 */
export default async function onPullRequestMerge () {
  const pullRequest = GITHUB_CONTEXT.event.pull_request
  const isRelease = pullRequest.head.ref.endsWith('-release')

  // create a new release
  if (isRelease) return await onRelease(pullRequest)
}

/**
 * Create a new release.
 * @param {object} pullRequest - The pull request that was merged.
 */
async function onRelease (pullRequest) {
  const packageJsonFile = path.resolve(proc.getCurrentWorkingDirectory(), 'package.json')
  const packageJsonContent = await fs.promises.readFile(packageJsonFile, { encoding: 'utf-8' })
  const packageJson = JSON.parse(packageJsonContent)
  const version = packageJson.version

  // Check if a release with this version already exists
  const releases = await github.api('releases')
  const release = releases.find(release => release.tag_name === `v${version}`) || (await createRelease(version, pullRequest))
  if (release.draft === false) return

  // Publish the release
  console.log(`Publishing release "${release.tag_name}".`)
  await github.api(`releases/${release.id}`, {
    method: 'PATCH',
    body: {
      draft: false
    }
  })

  // Any workflows listening for release events will not be triggered by the release event, since the GITHUB_TOKEN is not associated with any user or app.
  // Therefore, we need to trigger the release event manually, for that we dispatch all workflows that end with "on_release.yml".
  const workflows = (await github.api('actions/workflows'))[0].workflows
  const releaseWorkflows = workflows.filter((workflow) => workflow.path.endsWith('on_release.yml'))
  for (const workflow of releaseWorkflows) {
    try {
      console.log(`Dispatching workflow "${workflow.name}" for release "${release.tag_name}".`)
      await github.api(`actions/workflows/${workflow.id}/dispatches`, {
        method: 'POST',
        body: {
          ref: release.target_commitish,
          inputs: {
            ref: release.target_commitish
          }
        }
      })
    } catch (err) {
      console.error(err)
    }
  }
}

/**
 * Create a new release.
 * @param {string} version - The version name of the release.
 * @param {object} pullRequest - The pull request that was merged.
 * @returns {Promise<object>} - The created release.
 */
async function createRelease (version, pullRequest) {
  const allPulls = (await github.api('pulls', { params: { state: 'closed' } })).filter(pull => pull.merged_at !== null)
  const previousRelease = await github.getLatestRelease()
  const { org, repo } = await git.getOrigin()

  // filter for pulls that have been merged after the last release.
  const pulls = previousRelease === null ? allPulls : allPulls.filter(pull => pull.merged_at > previousRelease.created_at)
  const title = `${version}`
  const majorPulls = pulls.filter(pull => pull.head.ref.match(/-major-(\d+|release)+$/))
  const minorPulls = pulls.filter(pull => pull.head.ref.match(/-minor-(\d+|release)+$/))
  const patchPulls = pulls.filter(pull => pull.head.ref.match(/-patch-(\d+|release)$/))
  const otherPulls = pulls.filter(pull => !([...majorPulls, ...minorPulls, ...patchPulls].includes(pull)))
  const body = [
    `# ${title}`,
    '',
    majorPulls.length ? `## Major changes\n\n${majorPulls.map(pull => `- ${pull.title} (#${pull.number})`).join('\n')}\n\n` : '',
    minorPulls.length ? `## Minor changes\n\n${minorPulls.map(pull => `- ${pull.title} (#${pull.number})`).join('\n')}\n\n` : '',
    patchPulls.length ? `## Patch changes\n\n${patchPulls.map(pull => `- ${pull.title} (#${pull.number})`).join('\n')}\n\n` : '',
    otherPulls.length ? `## Other changes\n\n${otherPulls.map(pull => `- ${pull.title} (#${pull.number})`).join('\n')}\n\n` : '',
    previousRelease === null
      ? `**Commits**: https://github.com/${org}/${repo}/commits/${version}\n\n`
      : `**View Diff**: https://github.com/${org}/${repo}/compare/${previousRelease.tag_name}...${version}\n\n`
  ].join('\n')

  const releases = await github.api('releases', {
    method: 'POST',
    body: {
      tag_name: `${version}`,
      target_commitish: pullRequest.base.ref,
      name: `${version}`,
      draft: true,
      body
    }
  })

  return releases[0]
}
