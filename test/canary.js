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
 * A piece of shared state that non-attacker code should not modify.
 * Used by tests of attacks to demonstrate that an arbitrary code execution
 * was successful.
 */

'use strict'

let alive = false

module.exports = {
  newCanary () { alive = true }, // Run at start of test
  isAlive () { return alive }, // False if attacker succeeded.
  kill () { alive = false } // Goal for attacker code.
}
