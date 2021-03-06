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

// An innocuous module that is substituted for blocked requires.

// Gather telemetry on what the requestor is doing.
const handlers = Object.assign(
  Object.create(null),
  {
    apply (target, thisArg, args) {
      return trap('apply', args)
    },
    construct (target, args) {
      return trap('construct', args)
    },
    defineProperty (target, key, descriptor) {
      return trap('defineProperty', [ key, descriptor ])
    },
    deleteProperty (target, key) {
      return trap('deleteProperty', [ key ]) || false
    },
    get (target, key, receiver) {
      return trap('get', [ key ])
    },
    getOwnPropertyDescriptor (target, key) {
      return trap('getOwnPropertyDescriptor', [ key ])
    },
    getPrototypeOf (target) {
      return trap('getPrototypeOf', []) || null
    },
    has (target, key) {
      return trap('has', [ key ]) || false
    },
    isExtensible (target) {
      return trap('isExtensible', target) || false
    },
    ownKeys (target) {
      return trap('ownKeys', []) || []
    },
    preventExtensions (target) {
      return trap('preventExtensions', []) || false
    },
    set (target, key, value) {
      return trap('set', []) || false
    },
    setPrototypeOf (target, proto) {
      return trap('setPrototypeOf', []) || false
    }
  })

function trap (kind, details) {
  console.warn(`banned module: trapped ${kind} ${JSON.stringify(details)}`)
  return void 0
}

module.exports = new Proxy({}, handlers)
