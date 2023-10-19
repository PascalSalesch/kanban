/**
 * @file This file verifies that the CLI is working as expected.
 */

/**
 * @type {import('../mocha.globals.mjs').assert}
 */
const assert = global.assert

describe('Command Line Interface', async () => {
  /**
   * @type {import('../mocha.globals.mjs').CLI}
   */
  const cli = new global.CLI()
  after(() => { cli.close() })

  it('should be able to select "Exit"', async () => {
    await cli.select('Exit')
    assert.ok(cli.view.includes('► Exit'))
    await cli.submit()
    assert.ok(cli.process.exitCode === 0)
  })
})
