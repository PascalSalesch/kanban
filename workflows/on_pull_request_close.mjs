/**
 * @file This file is executed when a pull request is closed.
 * It can be initiated via "kanban run on_pull_request_close".
 */

import * as github from '../src/utils/github.mjs'

const GITHUB_CONTEXT = JSON.parse(process.env.GITHUB_CONTEXT)

/**
 * The main entry point for this task.
 */
export default async function onPullRequestClose () {
  const pullRequest = GITHUB_CONTEXT.event.pull_request

  // remove milestones
  if (pullRequest.milestone !== null) {
    await github.api(`pulls/${pullRequest.number}`, {
      method: 'PATCH',
      body: {
        milestone: null
      }
    })
  }
}
