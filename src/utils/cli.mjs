/**
 * @file Utility functions for asking questions in the console.
 */

import * as readline from 'node:readline'
import * as cmd from 'node:child_process'
import * as fs from 'node:fs'

/**
 * @typedef {object} answer
 * @property {string} name - The name of the option.
 * @property {string} value - The value of the option.
 */

/**
 * Asks a question in the console.
 * @param {string} question - The question to ask.
 * @param {answer[]} [options=[]] - The options to choose from.
 * @returns {Promise<any>} Returns a promise that resolves with the answer.
 */
export async function askQuestion (question = '', options = []) {
  options = options.filter(option => option)

  // If there are no options, ask the question and prompt the user for an answer.
  if (options.length === 0) {
    let answer
    while (true) {
      const rl = readline.promises.createInterface({ input: process.stdin, output: process.stdout })
      rl.output.write('\u001B[2J\u001B[0;0f')
      answer = await rl.question(question.endsWith(' ') ? question : question + ' ')
      rl.close()
      if (answer) break
    }
    return answer
  }

  // Format parameters
  options = options.map((option) => typeof option === 'string' ? { name: option, value: option } : option)
  question = question.split('\n')

  const questionRows = Math.max(3, process.stdout.rows - Math.min(12, options.length + 4))
  const scrollbar = (question.length > questionRows)

  let selectedOptionIndex = 0
  let questionIndex = 0
  let filter = ''
  let filteredOptions = [...options]
  const eventListener = (_, { name }) => {
    if (name === 'return') {
      return true
    } else if (name === 'up') {
      if (selectedOptionIndex === 0) {
        selectedOptionIndex = filteredOptions.length - 1
      } else {
        selectedOptionIndex = Math.max(0, selectedOptionIndex - 1)
      }
    } else if (name === 'down') {
      if (selectedOptionIndex === filteredOptions.length - 1) {
        selectedOptionIndex = 0
      } else {
        selectedOptionIndex = Math.min(filteredOptions.length - 1, selectedOptionIndex + 1)
      }
    } else if (scrollbar && name === 'pageup') {
      questionIndex = Math.max(0, questionIndex - 1)
    } else if (scrollbar && name === 'pagedown') {
      questionIndex = Math.min(question.length - questionRows, questionIndex + 1)
    } else {
      if (name === 'escape') rl.line = ''
      filter = rl.line.toLowerCase()
      filteredOptions = !filter
        ? [...options]
        : options.filter(option => option.name.toLowerCase().includes(filter))
          .sort((a, b) => {
            if (a.name.toLowerCase().startsWith(filter)) return -1
            if (b.name.toLowerCase().startsWith(filter)) return 1
            return options.indexOf(a) - options.indexOf(b)
          })
      if (filteredOptions.length === 0) filteredOptions = options
      selectedOptionIndex = 0
    }
  }

  const rl = readline.promises.createInterface({ input: process.stdin, output: process.stdout })
  rl.input.on('keypress', eventListener)

  const response = await new Promise(resolve => {
    const getPrompt = () => {
      const clear = '\u001B[2J\u001B[0;0f'
      const scrollHint = scrollbar ? `\n${'-'.repeat(process.stdout.columns / 2)}\n${question[question.length - 1]} [Use [▲] and [▼] to see more]` : ''
      const filterHint = filter ? ` [Searching for: "${filter}"]` : ' [Start typing to filter...]'
      const questionPrompt = question.slice(questionIndex, questionIndex + questionRows).join('\n')
      const styledOptions = filteredOptions.map((option, index) => `${(index === selectedOptionIndex) ? '► ' : '  '}${option.name}`)
      const visibleIndex = (selectedOptionIndex > 3 ? selectedOptionIndex - 4 : 0)
      const optionPrompt = styledOptions.slice(visibleIndex, visibleIndex + 8).join('\n')
      return clear + `${questionPrompt}${scrollHint}${filterHint}\n${optionPrompt}\n`
    }
    const render = () => { rl.output.write(getPrompt()) }

    rl.input.on('keypress', render)
    rl.question(getPrompt()).then(() => {
      rl.input.off('keypress', eventListener)
      rl.input.off('keypress', render)
      rl.close()
      resolve(filteredOptions[selectedOptionIndex])
    })

    // Listen for events from the parent process for testing purposes
    rl.input.on('data', (data) => {
      data = data.toString()
      if (!(data.startsWith('►:'))) return
      const [command, ...args] = data.split(':').splice(1)
      if (command === 'keypress') {
        eventListener(null, { name: args[0] })
        render()
      } else if (command === 'set_line') {
        rl.line = args[0]
      } else if (command === 'submit') {
        rl.input.off('keypress', eventListener)
        rl.input.off('keypress', render)
        rl.close()
        resolve(filteredOptions[selectedOptionIndex])
      }
    })
  })

  return response.value
}

/**
 * Asks a question in the console and prompts the user to modify a file as an answer.
 * @param {string} question - The question to ask.
 * @param {string} file - The file to open in the editor.
 * @param {string} content - The content to write to the file.
 * @returns {Promise<string|false>} Returns a promise that resolves with the file content.
 */
export async function askFileInput (question, file, content) {
  await fs.promises.writeFile(file, content, { encoding: 'utf8' })

  // cleanup
  const cleanup = () => {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    process.off('beforeExit', cleanup)
    process.off('SIGINT', cleanup)
    process.off('SIGQUIT', cleanup)
    process.off('SIGTERM', cleanup)
  }

  process.on('beforeExit', cleanup)
  process.on('SIGINT', cleanup)
  process.on('SIGQUIT', cleanup)
  process.on('SIGTERM', cleanup)

  let result
  while (true) {
    const task = await askQuestion(question, [
      { name: `Edit template with \`code ${file}\``, value: 'openEditor' },
      { name: 'Continue', value: 'continue' },
      { name: 'Abort', value: 'abort' }
    ])

    // Edit file with `code <file>`
    if (task === 'openEditor') {
      cmd.execSync(`code ${file}`)
    }

    // Continue
    if (task === 'continue') {
      if (!fs.existsSync(file)) {
        await fs.promises.writeFile(file, content, { encoding: 'utf8' })
        result = content
      } else {
        result = await fs.promises.readFile(file, { encoding: 'utf8' })
      }
      if (result === content) {
        const yesno = await askQuestion('You did not modify the template. Are you sure you want to continue?', ['Yes', 'No'])
        if (yesno === 'Yes') {
          cleanup()
          break
        }
      } else {
        cleanup()
        break
      }
    }

    // Abort
    if (task === 'abort') {
      cleanup()
      result = false
      break
    }
  }

  return result
}
