/**
 * @file Helper to execute shell commands.
 */
import * as cmd from 'node:child_process'
import * as util from 'node:util'

const execAsync = util.promisify(cmd.exec)

/**
 * Executes a shell command.
 * @param {...any} args - The arguments to pass to the shell command.
 * @returns {Promise<{ stdout: string, stderr: string }>} The stdout and stderr of the shell command.
 */
export default async function exec (...args) {
  try {
    return await execAsync(...args)
  } catch (err) {
    return {
      stderr: err
    }
  }
}
