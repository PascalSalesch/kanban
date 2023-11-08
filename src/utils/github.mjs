/**
 * @file Contains functions that interact with GitHub.
 */

import * as git from './git.mjs'

/**
 * Fetches data from the GitHub API.
 * @param {string} path - The path to fetch from the GitHub API.
 * @param {object} [options] - The options to pass to the GitHub API.
 * @param {object} [options.body] - The data to send to the GitHub API.
 * @param {string} [options.method] - The method to use for the request.
 * @param {object} [options.params] - The query parameters to pass to the GitHub API.
 * @returns {Promise<object>} The data from the GitHub API.
 * @throws {Error} If the response from the GitHub API is not ok.
 */
export async function api (path, options = {}) {
  const { org, repo } = await git.getOrigin()
  const params = options.params && new URLSearchParams(options.params)
  let url = `${path.includes('://') ? path : `https://api.github.com/repos/${org}/${repo}/${path}`}${params ? `?${params}` : ''}`

  const method = options.method || (options.body ? 'POST' : 'GET')
  const body = typeof options.body === 'undefined' ? options.body : (typeof options.body === 'object' ? JSON.stringify(options.body) : options.body)
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'github.com/PascalSalesch/kanban'
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const response = []
  while (true) {
    if (options.verbose) {
      const curl = [
        `curl -X ${method}`,
        ...Object.entries(headers).map(([key, value]) => `-H '${key}: ${value}'`),
        ...(body ? [`-d '${body}'`] : []),
        url
      ].join(' ')
      console.log(`Performing "${curl}"`)
    }
    const page = await fetch(url, { method, headers, body })

    if (!page.ok) {
      const error = await page.json()
      const err = `Invalid response for "${url}" from GitHub API: ${error.message}.`
      if (error.message === 'Not Found' && !(process.env.GITHUB_TOKEN)) throw new Error(`${err} Make sure you have set the "GITHUB_TOKEN" environment variable.`)
      const hints = [error.message, JSON.stringify(error.errors, null, 2), body].filter(Boolean).join('\n')
      throw new Error(`Invalid response for "${url}" from GitHub API: ${hints}`)
    }

    // add response to array
    try {
      const res = await page.json()
      if (Array.isArray(res)) response.push(...res)
      else response.push(res)
    } catch (err) {
      const text = (await page.text()).trim()
      if (text) {
        console.log(`Could not parse response from "${url}":\n${await page.text()}`)
        throw err
      }
    }

    // break if limit is reached
    if (options.limit && response.length >= options.limit) break

    // fetch next page if available
    const link = page.headers.get('link')
    if (!link) break
    const next = link.split(',').find(link => link.includes('rel="next"'))
    if (!next) break
    const nextUrl = next.split(';')[0].trim().slice(1, -1)
    url = nextUrl
  }

  return response
}

/**
 * Retrieves the issue that is currently being worked on.
 * @returns {Promise<object>} The issue that is currently being worked on.
 */
export async function getIssue () {
  const branch = await git.getCurrentBranch()
  const issueNumber = branch.split('-').pop()
  if (!issueNumber) throw new Error('Could not find issue number in the last part of the branch name.')

  const issue = (await api(`issues/${issueNumber}`))[0]
  if (!issue) throw new Error(`Could not find issue #${issueNumber}.`)

  return issue
}

/**
 * Retrieves the pull request that is currently being worked on.
 * @returns {Promise<object>|null} The pull request that is currently being worked on.
 */
export async function getPullRequest () {
  const defaultBranch = await git.getDefaultBranch()
  const branch = await git.getCurrentBranch()
  const pullRequest = await api(`pulls?base=${defaultBranch}&head=${branch}`, {
    params: {
      state: 'open'
    }
  })
  if (pullRequest.length === 0) return null
  if (pullRequest.length === 1) return pullRequest[0]
  return pullRequest
}

/**
 * Retrieves the last release.
 * @returns {Promise<string|null>} The last release.
 */
export async function getLatestRelease () {
  try {
    const lastRelease = await api('releases/latest')
    return lastRelease[0]
  } catch (err) {
    if (err.message.includes('Not Found')) {
      return null
    } else throw err
  }
}
