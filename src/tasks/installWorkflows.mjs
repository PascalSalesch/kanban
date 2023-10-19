/**
 * @file The default method of this file is executed when the user selects the "Install the GitHub Actions workflow files" task.
 * It is available as long as the workflow files are not installed.
 */

import * as path from 'node:path'
import * as url from 'node:url'
import * as fs from 'node:fs'

import select from '../select.mjs'

import * as proc from '../utils/process.mjs'
import * as cli from '../utils/cli.mjs'
import * as git from '../utils/git.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const workflowSrc = path.resolve(__dirname, '..', '..', 'workflows')

/**
 * Asks the user if they want to install the workflow files.
 * - Create the target directory if it does not exist.
 * - Copy the workflow files.
 */
export default async function installWorkflows () {
  // ask the user if they want to install the workflow files
  const yesno = await cli.askQuestion('Install the GitHub Actions workflow files?', ['Yes', 'No'])
  if (yesno !== 'Yes') return

  // create the target directory if it does not exist
  const workflowTarget = path.resolve(proc.getCurrentWorkingDirectory(), '.github', 'workflows')
  if (!fs.existsSync(workflowTarget)) fs.mkdirSync(workflowTarget, { recursive: true })

  // get the template variables
  const templateVariables = {
    '$default-branch': await git.getDefaultBranch()
  }

  // copy the workflow files
  for (const file of fs.readdirSync(workflowSrc)) {
    if (!(file.endsWith('.yml'))) continue
    const src = path.resolve(workflowSrc, file)
    const target = path.resolve(workflowTarget, `kanban.${file}`)
    const content = Object.entries(templateVariables).reduce((content, [key, value]) => {
      return content.replaceAll(key, value)
    }, (await fs.promises.readFile(src, { encoding: 'utf-8' })))
    await fs.promises.writeFile(target, content)
  }

  // ask the user what to do next
  select()
}

/**
 * Whether this task is available.
 * @returns {Promise<boolean>} Whether this task is available.
 */
export async function isAvailable () {
  const workflowTarget = path.resolve(proc.getCurrentWorkingDirectory(), '.github', 'workflows')
  if (!fs.existsSync(workflowTarget)) return true

  // check if the target directory contains all workflow files
  const workflowSrcFiles = fs.readdirSync(workflowSrc).filter(file => file.endsWith('.yml'))
  const workflowTargetFiles = fs.readdirSync(workflowTarget)
  if (workflowSrcFiles.length > workflowTargetFiles.length) return true
  for (const file of workflowSrcFiles.map(file => `kanban.${file}`)) {
    if (!(workflowTargetFiles.includes(file))) return true
  }

  return false
}

/**
 * The prompt to show.
 * @returns {string} The prompt to show.
 */
export function getPrompt () {
  return 'Install the GitHub Actions workflow files \x1b[31m!\x1b[0m'
}

/**
 * The priority of this task, from highest priority (10) to lowest priority (1).
 * @returns {number} The priority of this task as a number from 1 to 10.
 */
export function getPriority () {
  return 10
}
