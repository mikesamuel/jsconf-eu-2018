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
 * Defined TrustedHtml and a predicate that can guard an HTML sink like
 * HttpResponse.write.
 */

'use strict'

const { Mintable } = require('node-sec-patterns')
const { TypedString } = require('template-tag-common')

/**
 * A string that matches the HTML DocumentFragment production,
 * is concatenation safe, and is safe to load into a sensitive
 * origin alongside user data.
 */
class TrustedHtml extends TypedString {
  constructor (stringContent) {
    super(stringContent)
  }
}
Object.defineProperty(TrustedHtml, 'contractKey', { value: 'TrustedHtml' })

const isTrustedHtml = Mintable.verifierFor(TrustedHtml)

module.exports = Object.freeze({
  TrustedHtml,
  requireTrustedHtml (x) {
    if (!isTrustedHtml(x)) {
      throw new TypeError(`Expected TrustedHtml not ${x}`)
    }
    return x.content
  }
})
