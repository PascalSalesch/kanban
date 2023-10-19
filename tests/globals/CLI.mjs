/**
 * @file This file is imported by the `mocha.globals.mjs` file. It exports a CLI class.
 */

import * as cmd from 'node:child_process'

import { getPrompt } from '../../src/tasks/exit.mjs'

// set global CLI
export default class CLI {
  /**
   * A promise that resolves when the CLI is ready.
   * @type {Promise<void>}
   */
  #ready

  /**
   * The current view of the CLI.
   * @type {string}
   */
  #view = ''

  /**
   * A list of view change listeners.
   * @type {Array<{resolve:Function,reject:Function}>}
   */
  #viewChangeListeners = []

  /**
   * The current process of the CLI.
   * @type {import('node:child_process').ChildProcessWithoutNullStreams}
   */
  process = null

  constructor () {
    this.process = cmd.spawn('node', ['src/kanban.mjs'], { stdio: 'pipe', shell: true })
    this.process.stdin.setDefaultEncoding('utf-8')
    this.process.stdout.setEncoding('utf-8')
    this.process.stderr.setEncoding('utf-8')
    this.process.stdout.on('data', (data) => this.#onData(data))
    this.process.on('exit', () => {
      while (this.#viewChangeListeners.length > 0) {
        const { resolve } = this.#viewChangeListeners.shift()
        resolve('')
      }
    })
    this.#ready = this.#viewChange()
  }

  /**
   * Returns a promise that resolves when the view changes.
   * @returns {Promise<void>} Returns a promise that resolves when the view changes.
   */
  #viewChange () {
    const promise = new Promise((resolve, reject) => {
      this.#viewChangeListeners.push({ resolve, reject })
    })
    return promise
  }

  /**
   * Handles utf-8 encoded data from the CLI.
   * @param {string} data - The data from the CLI.
   */
  #onData (data) {
    let viewChange = false
    if (data.includes('\u001B[2J\u001B[0;0f')) {
      data = data.replace('\u001B[2J\u001B[0;0f', '')
      viewChange = true
    }

    // replace special characters with empty strings
    data = clean(data)
    this.#view = (viewChange ? '' : this.#view) + data

    if (viewChange) {
      while (this.#viewChangeListeners.length > 0) {
        const { resolve } = this.#viewChangeListeners.shift()
        resolve(this.#view)
      }
    }
  }

  /**
   * The current view of the CLI.
   * @type {string}
   */
  get view () {
    return this.#view
  }

  /**
   * Send down-button input to the CLI until the given option is selected.
   * @param {Promise<string>} name - The name of the option to select.
   * @throws {Error} - If the option is not found.
   */
  async select (name) {
    await this.#ready
    let initial
    let current = this.#view

    while (!(current.includes(`► ${name}`))) {
      setTimeout(() => this.process.stdin.write('►:keypress:down'), 1)
      current = await this.#viewChange()
      if (current === initial) throw new Error(`Option "${name}" not found in:\n${current}`)
      initial = initial || current
    }
  }

  /**
   * Send enter input to the CLI.
   * @returns {Promise<void>} Returns a promise that resolves when the view changes.
   */
  submit () {
    setTimeout(async () => {
      await this.#ready
      this.process.stdin.write('►:submit')
      const exitPrompt = clean(await getPrompt())
      if (this.#view.includes(`► ${exitPrompt}`)) this.process.stdin.end()
    }, 1)
    return this.#viewChange()
  }

  /**
   * Closes the CLI.
   */
  close () {
    if (this.process.killed) return
    this.process.stdin.end()
    this.process.kill()
  }
}

/**
 * Removes all characters from the given string that are not allowed in the CLI.
 * @param {string} data - The data to clean.
 * @returns {string} The cleaned data.
 */
function clean (data) {
  data = data.replace(/[^a-zA-Z0-9 :;,."'\r\n►[\]]/g, '')
  data = data.replace(/\[90m(.*)\[0m/g, '$1')
  return data
}
