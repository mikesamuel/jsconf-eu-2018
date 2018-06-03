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
 * A load hook that configures and combines other hooks.
 */

'use strict'

module.exports = guardHook

let loadingHookDeps = true // Disable hooks while hook's dependencies load.

const path = require('path')
const { makeGuardHook: makeResourceIntegrityHook } = require(
  '../../framework/require-resource-integrity-hook')
const { makeGuardHook: makeImportGraphHook } = require(
  '../../framework/import-graph-hook')

const prodSources = require('../../generated/prod-sources.json')
const { sensitiveModules } = require('../../package.json')

loadingHookDeps = false

const hooks = [
  makeResourceIntegrityHook(prodSources),
  // TODO: defensive copy to prevent out of band attack by requiring
  // and mutating arrays in package.json.
  makeImportGraphHook(
    new Map(Object.entries(sensitiveModules).map(([ k, v ]) => [ k, new Set(v) ])),
    path.join(__dirname, '../..'))
]

function guardHook (importingFile, importingId, requiredId, resolveFilename, isBuiltin) {
  if (loadingHookDeps) {
    return requiredId
  }

  let guardedRequiredId = requiredId
  for (const hook of hooks) {
    guardedRequiredId = hook(
      importingFile, importingId, guardedRequiredId, resolveFilename, isBuiltin)
  }
  return guardedRequiredId
}

console.log(`Loaded ${module.id}`)
