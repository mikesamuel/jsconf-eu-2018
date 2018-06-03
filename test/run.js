#!/usr/bin/env node --cjs-loader ./hooks.js

/** @license
Copyright 2018 Google, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict'

/**
 * @fileoverview
 * Spawns a mocha test runner to generate a module graph describing the
 * which CommonJS modules require which other modules.
 *
 * Passing `--help` dumps usage.
 */

// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically
const fs = require('fs')
const path = require('path')
const process = require('process')
const Mocha = require('mocha')

function runTests () {
  const mocha = new Mocha()
  const testDir = './test'

  fs.readdirSync(testDir)
    .filter((file) => path.extname(file) === '.js' && file.substring(0, 5) === 'test-')
    .forEach((file) => mocha.addFile(path.join(testDir, file)))

  mocha.run(
    (failures) => {
      if (failures) {
        process.exitCode = 1
      }
      process.exit()
    })
}

if (require.main === module) {
  runTests()
}
