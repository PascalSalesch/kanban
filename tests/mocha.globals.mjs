/**
 * @file This file is run before all tests. It sets up the environment for the tests.
 * It is configured in the mocha.json in the "file" property.
 */

import assert from './globals/assert.mjs'
import CLI from './globals/CLI.mjs'

// set globals
global.assert = assert
global.CLI = CLI

// export globals
export {
  assert,
  CLI
}
