/**
 * @file Contains functions that interact with Git.
 */

import exec from './exec.mjs'

let hasSetDefaultBranch = false

/**
 * Checks if the branch exists locally.
 * @param {string} branch - The name of the branch.
 * @returns {Promise<boolean>} True if the branch exists locally.
 */
export async function branchExists (branch) {
  const branches = (await exec('git branch')).stdout.toString().trim().split('\n').map(branch => branch.trim().replace('*', ''))
  return branches.includes(branch)
}

/**
 * Retrieves the organization and repository name of the remote repository.
 * @returns {Promise<{org: string, repo: string}>} The organization and repository name of the remote repository.
 */
export async function getOrigin () {
  const origin = (await exec('git remote get-url origin')).stdout.toString().trim()
  const sshMatch = origin.match(/:(.+)\/(.+)\.git$/)
  const httpMatch = origin.match(/\/(.+)\/(.+)\.git$/)

  if (sshMatch) {
    return { org: sshMatch[1], repo: sshMatch[2] }
  } else if (httpMatch) {
    return { org: httpMatch[1], repo: httpMatch[2] }
  } else if (process.env.GITHUB_CONTEXT) {
    const GITHUB_CONTEXT = JSON.parse(process.env.GITHUB_CONTEXT)
    const [org, ...repoArr] = GITHUB_CONTEXT.repository.split('/')
    return { org, repo: repoArr.join('/') }
  } else {
    return { org: null, repo: null }
  }
}

/**
 * Retrieves the username of the user.
 * @returns {Promise<string>} The username of the user.
 */
export async function getUsername () {
  const username = (await exec('git config user.name || git config github.user')).stdout.toString().trim()
  return username || 'undefined'
}

/**
 * Checks if the user has checked out a branch.
 * @returns {Promise<boolean>} True if the user has checked out a branch.
 */
export async function hasCheckedOutBranch () {
  const defaultBranch = await getDefaultBranch()
  const branch = await getCurrentBranch()
  return branch !== defaultBranch
}

/**
 * Checks if there are uncommited changes.
 * @returns {Promise<boolean>} True if there are uncommited changes.
 */
export async function hasUncommitedChanges () {
  const status = (await exec('git status --porcelain'))?.stdout?.toString().trim()
  return status !== ''
}

/**
 * Checks if the local HEAD is ahead of the remote.
 * @returns {Promise<boolean>} True if there are unpushed commits.
 */
export async function hasUnpushedCommits () {
  const currentBranch = await getCurrentBranch()
  const log = (await exec(`git log origin/${currentBranch}..HEAD`))
  const stdout = log?.stdout?.toString().trim()
  const stderr = log?.stderr?.toString().trim()

  // branch does not exist on remote
  // check if local is ahead of the default branch
  if (stderr) {
    const defaultBranch = await getDefaultBranch()
    const log = (await exec(`git log origin/${defaultBranch}..HEAD`))
    const stdout = log?.stdout?.toString().trim()
    const stderr = log?.stderr?.toString().trim()
    if (stderr) return true
    return stdout !== ''
  }

  return stdout !== ''
}

/**
 * Checks if the current branch is ahead of the remote.
 * @returns {Promise<boolean>} True if the current branch is ahead of the remote.
 */
export async function hasPushedCommits () {
  const currentBranch = await getCurrentBranch()
  const defaultBranch = await getDefaultBranch()
  const log = (await exec(`git log origin/${defaultBranch}..origin/${currentBranch}`))
  const stdout = log?.stdout?.toString().trim()
  const stderr = log?.stderr?.toString().trim()

  // branch does not exist on remote
  if (stderr) return false

  return stdout !== ''
}

/**
 * Retrieves the default branch of the remote repository,
 * This is a bit laggy, so it will only retrieve the default branch once and then store it in the git config.
 * @returns {Promise<string>} The name of the default branch.
 */
export async function getDefaultBranch () {
  const getConfig = async () => (await exec('git config --local --get origin.default || echo ""')).stdout.toString().trim()
  const setConfig = async () => {
    const branch = (await exec('git remote show origin')).stdout.toString().trim()
      .split('\n')
      .find(line => line.trim().startsWith('HEAD'))
      .split(':').splice(1).join(':').trim()
    exec(`git config --local --replace-all origin.default ${branch}`)
  }

  // If the config has already been set, return it.
  const config = await getConfig()
  if (config) {
    if (!hasSetDefaultBranch) {
      hasSetDefaultBranch = true
      setTimeout(setConfig, 3000).unref()
    }
    return config
  }

  await setConfig()
  return await getConfig()
}

/**
 * Retrieves the name of the current branch.
 * @returns {Promise<string>} The name of the current branch.
 */
export async function getCurrentBranch () {
  return (await exec('git symbolic-ref --short HEAD')).stdout.toString().trim()
}
