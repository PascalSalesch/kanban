/**
 * @file The default method of this file is executed when the user is in the following state, and selects the following task:
 *
 * The state:
 * - Idle (No branch is checked out).
 *
 * The task:
 * ├─ Create a release.
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'

import semver from 'semver'

import select from '../select.mjs'

import exec from '../utils/exec.mjs'
import * as git from '../utils/git.mjs'
import * as github from '../utils/github.mjs'
import * as cli from '../utils/cli.mjs'
import * as proc from '../utils/process.mjs'

const cwd = proc.getCurrentWorkingDirectory()

/**
 * Creates a release.
 * - Retrieves all merged pull requests since the last release.
 * - Depending on the merged PRs suggests the changelevel.
 * - Creates a release branch.
 * - Update the version in the package.json.
 * - Commit and push.
 */
export default async function createRelease () {
  const pulls = await getPulls()
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf-8'))
  const { repo, org } = await git.getOrigin()
  const changelevel = await getChangelevel(packageJson, pulls)
  if (changelevel === null) {
    select()
    return
  }

  // create a release branch
  const username = await git.getUsername()
  const branchName = `${username}-${changelevel}-release`
  await exec(`git checkout -b ${branchName}`)

  // update the version in the package.json
  const version = semver.inc(packageJson.version, changelevel)
  await fs.promises.writeFile(path.resolve(cwd, 'package.json'), JSON.stringify({ ...packageJson, version }, null, 2))

  // update the version in the package-lock.json
  await exec('npm install --package-lock-only')

  // commit and push
  await exec(`git add . && git commit --allow-empty -m "v${version}" && git push -u origin ${branchName}`)

  // create a pull request
  const title = `Release v${version}`
  const majorPulls = pulls.filter(pull => pull.head.ref.match(/-major-(\d+|release)$/))
  const minorPulls = pulls.filter(pull => pull.head.ref.match(/-minor-(\d+|release)$/))
  const patchPulls = pulls.filter(pull => pull.head.ref.match(/-patch-(\d+|release)$/))
  const otherPulls = pulls.filter(pull => !([...majorPulls, ...minorPulls, ...patchPulls].includes(pull)))
  const body = [
    `# ${title}`,
    '',
    majorPulls.length ? `## Major changes\n\n${majorPulls.map(pull => `- #${pull.number}`).join('\n')}\n\n` : '',
    minorPulls.length ? `## Minor changes\n\n${minorPulls.map(pull => `- #${pull.number}`).join('\n')}\n\n` : '',
    patchPulls.length ? `## Patch changes\n\n${patchPulls.map(pull => `- #${pull.number}`).join('\n')}\n\n` : '',
    otherPulls.length ? `## Other changes\n\n${otherPulls.map(pull => `- #${pull.number}`).join('\n')}\n\n` : '',
    '',
    `**View Diff**: https://github.com/${org}/${repo}/compare/${packageJson.version}...${branchName}`
  ].join('\n')

  const pull = (await github.api('pulls', {
    method: 'POST',
    body: {
      title,
      body,
      head: branchName,
      base: await git.getDefaultBranch()
    }
  }))[0]

  const open = await cli.askQuestion(`Pull request created: ${pull.html_url}\nPress "Enter" to continue.`, ['Continue', 'Open in browser'])
  if (open === 'Open in browser') cmd.spawn('open', [pull.html_url], { stdio: 'ignore', detached: true, shell: true }).unref()

  // set upstream for the default branch
  const defaultBranch = await git.getDefaultBranch()
  cmd.execSync(`git branch --set-upstream-to=origin/${defaultBranch} ${defaultBranch}`)

  // checkout the default branch
  cmd.execSync(`git checkout ${defaultBranch}`)

  // ask the user if they want to delete the old branch
  const yesno = await cli.askQuestion(`Do you want to delete the local "${branchName}" branch?`, ['Yes', 'No'])
  if (yesno === 'Yes') cmd.execSync(`git branch -d ${branchName}`)

  // pull the default branch
  cmd.execSync(`git pull origin ${defaultBranch}`)

  // ask the user what they want to do next
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
  return 'Release'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 4
}

// =====================================================================================================================

/**
 * Retrieves the changelevel. Suggests the changelevel based on the pull requests.
 * @param {object} packageJson - The parsed package.json.
 * @param {object[]} pulls - The pull requests that have been merged since the last release.
 * @returns {Promise<string>} The changelevel based on the pull requests.
 */
async function getChangelevel (packageJson, pulls) {
  const changelevelSuggestion = ((pulls) => {
    if (pulls.length === 0) return 'patch'
    if (pulls.some(pull => pull.head.ref.match(/-major-\d+$/))) return 'major'
    if (pulls.some(pull => pull.head.ref.match(/-minor-\d+$/))) return 'minor'
    return 'patch'
  })(pulls)

  // ask the user for the changelevel
  const prompt = [
    pulls.length ? `The following pull requests have been merged since the last release:\n - ${pulls.map(pull => pull.title).join('\n - ')}` : null,
    `The recommended changelevel is "${changelevelSuggestion}". At what changelevel do you want to release?`
  ].filter(Boolean).join('\n')
  const changelevel = await cli.askQuestion(prompt, [
    {
      name: `Patch (${semver.inc(packageJson.version, 'patch')})`,
      value: 'patch'
    },
    {
      name: `Minor (${semver.inc(packageJson.version, 'minor')})`,
      value: 'minor'
    },
    {
      name: `Major (${semver.inc(packageJson.version, 'major')})`,
      value: 'major'
    },
    {
      name: '\x1b[90mReturn\x1b[0m',
      value: null
    }
  ].sort((a, b) => {
    if (a.value === changelevelSuggestion) return -1
    if (b.value === changelevelSuggestion) return 1
    return 0
  }))

  return changelevel
}

/**
 * Retrieves the pull requests since the last release.
 * @returns {Promise<object>} An object containing the pull requests that have been merged since the last release.
 */
async function getPulls () {
  const release = await github.getLatestRelease()
  const allPulls = (await github.api('pulls', { params: { state: 'closed' } }))
    .filter(pull => pull.merged_at !== null)

  // filter for pulls that have been merged after the last release.
  const pulls = release === null ? allPulls : allPulls.filter(pull => pull.merged_at > release.published_at)
  return pulls
}
