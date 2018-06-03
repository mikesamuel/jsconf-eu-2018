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

const path = require('path')

/**
 * @fileoverview
 * Checks that modules that are trying to require sensitive modules are allowed.
 */

exports.makeGuardHook = makeGuardHook

const { apply } = Reflect
const { has: setHas } = Set.prototype

function makeGuardHook (sensitiveModules, basePath, reportOnly) {
  const isSensitive = sensitiveModules.has.bind(sensitiveModules)
  const getImporters = sensitiveModules.get.bind(sensitiveModules)

  return function requireGraphHook (
    importingFile, importingId, requiredId, resolveFilename, isBuiltin) {
    const moduleKey = isBuiltin
      ? requiredId
      : path.relative(basePath, resolveFilename(requiredId))
    // TODO: need a way to canonicalize to e.g. ignore case on FAT & MacOS
    // case-insensitive file-systems, dereference ancestor symlinks.
    // This should also be applied to sensitiveModules.
    if (isSensitive(moduleKey)) {
      const importingRelFile = path.relative(basePath, importingFile)
      const allowedImporters = getImporters(moduleKey)
      if (!apply(setHas, allowedImporters, [ importingRelFile ])) {
        console.warn(`${module.id}: Blocking require(${JSON.stringify(requiredId)}} by ${importingRelFile}`)
        if (reportOnly !== true) {
          return path.join(__dirname, 'innocuous')
        }
      }
    }
    return requiredId
  }
}
