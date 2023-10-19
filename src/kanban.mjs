#!/usr/bin/env node

/**
 * @file Executable entry point for the kanban CLI.
 * Depending on the current state some tasks should be shown or hidden.
 * The states are:
 * - Idle (The default branch is checked out).
 * - Work in Progress (A branch is checked out).
 *
 * If the user is idle, the following tasks should be shown:
 * ├─ Backlog
 * ├─ In Progress
 * └─ Release
 * ...
 *
 * If the user is working on a branch, the following tasks should be shown:
 * ├─ Continue working on the current issue
 * ├─ View the current issue
 * ├─ Commit and push changes            | (Only if there are changes)
 * ├─ Open a Pull Request                | (Only if there are pushed commits)
 * └─ Stop working on the current issue
 * ...
 */

import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

import select from './select.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const __root = path.resolve(__dirname, '..')

process.nextTick(main)

/**
 * The main function.
 */
async function main () {
  if (process.argv[2] === 'run') {
    const fileName = process.argv[3]
    const file = [
      path.resolve(__root, 'hooks', fileName + '.mjs'),
      path.resolve(__root, 'workflows', fileName + '.mjs')
    ].find(file => fs.existsSync(file))
    if (!file) throw new Error(`Unknown script: ${fileName}`)
    const script = await import(file)
    await script.default()
    return
  }

  await select()
}
