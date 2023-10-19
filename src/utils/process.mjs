/**
 * @file Utility functions for working with the current process.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Retrieves the current working directory.
 * @returns {string} The current working directory.
 * @throws {Error} Throws an error if the current working directory is not the root of a project.
 */
export function getCurrentWorkingDirectory () {
  const cwd = process.cwd()
  if (!fs.existsSync(path.resolve(cwd, 'package.json'))) {
    throw new Error('You are not in the root of a project.')
  }
  if (!fs.existsSync(path.resolve(cwd, '.git'))) {
    throw new Error('Not a git repository.')
  }
  return cwd
}

/**
 * Resolves filepaths from a regex similar to a glob.
 * @param {string} regex - The regex to resolve.
 * @returns {Promise<string[]>} The filepaths that match the regex.
 */
export async function regex (regex) {
  const basePath = path.dirname(regex)
  const searchPattern = path.basename(regex)

  // read the directory
  if (!fs.existsSync(basePath)) return []
  const files = await fs.promises.readdir(basePath)

  // filter the files
  const insensitivePattern = searchPattern.toLowerCase()
  const matchedFiles = files.filter(file => {
    const fileName = file.toLowerCase()
    return fileName.match(insensitivePattern)
  })

  // resolve the paths
  const resolvedPaths = matchedFiles.map(file => path.join(basePath, file))
  return resolvedPaths
}
