/**
 * @file Asks the user to select a task.
 */

import * as cli from './utils/cli.mjs'
import * as tasks from './utils/tasks.mjs'

/**
 * Asks the user to select a task.
 * @param {string} [prompt='What would you like to do?'] - The prompt to show.
 */
export default async function select (prompt = 'What would you like to do?') {
  // The available task options.
  const options = []
  const taskEntries = Object.entries(tasks)
  const isAvailable = taskEntries.map(([_, task]) => task?.isAvailable?.())
  for (const index in taskEntries) {
    if (!(await isAvailable[index])) continue
    const [taskName, task] = taskEntries[index]
    const taskPrompt = await task.getPrompt?.() || taskName
    const taskPriority = await task.getPriority?.() || 1
    options.push({ name: taskPrompt, value: taskName, priority: taskPriority })
  }

  // Ask the user to select a task.
  if (options.length === 0) throw new Error('No tasks available.')
  const taskName = await cli.askQuestion(prompt, options.sort((a, b) => b.priority - a.priority))

  // Execute the task.
  await tasks[taskName]?.default?.()
}
