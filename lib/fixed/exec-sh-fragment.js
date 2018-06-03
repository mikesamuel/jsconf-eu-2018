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

/**
 * @fileoverview
 * Allows executing ShFragments with runtime type checks.
 */

'use strict'

const childProcess = require('child_process')
const { Mintable } = require('node-sec-patterns')
const { ShFragment } = require('sh-template-tag')

const isShFragment = Mintable.verifierFor(ShFragment)

module.exports = function execShFragment (command) {
  if (!isShFragment(command)) {
    throw new TypeError(`Expected ShFragment not ${command}`)
  }
  return childProcess.execSync(command.content)
}
