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

const { raw } = String

const SPC = raw`[\t\n\r ]`
const PREFIX = raw`(?:\+(?!\+)|-(?!-))`
const BINARY = raw`(?:${PREFIX}|[*/%,])`
const NUM = raw`(?:(?:[0]|[1-9]\d*|(?=\.\d))(?:[.]\d*)?(?:[eE][+\-]?\d+)?)(?![A-Za-z0-9])`
const IDENTIFIER = raw`\b(?:[A-Za-z][0-9A-Za-z_]*)`
const MATH_FN = raw`Math${SPC}*[.]${SPC}*${IDENTIFIER}${SPC}*(?:[\(](?!${SPC}*[/]))?`
const SAFE_EXPR = new RegExp(
  raw`^${SPC}*` +
  raw`(?:[\(]${SPC}*)?` +
  raw`(?:` + (
    raw`(?:${PREFIX}${SPC}*)?` +
    raw`(?:${NUM}|${MATH_FN}|${IDENTIFIER}|[\)])` +
    raw`${SPC}*` +
    raw`(?:${BINARY}${SPC}*(?:[\(]${SPC}*)?)?`
  ) + raw`)+$`
)
const TOKENS = new RegExp(raw`${NUM}|${IDENTIFIER}|[()/*+\-.,%]`, 'g')
const ID_TOKEN = new RegExp(raw`^${IDENTIFIER}$`)

function hasOwnProperty (o, p) {
  return Object.hasOwnProperty.call(o, p)
}

function isNameAtDefinedInContext (tokens, i, vars) {
  let container = null
  if (i && tokens[i - 1] === '.') {
    if (i >= 2 && tokens[i - 2] === 'Math' &&
        tokens[i - 3] !== '.' && !hasOwnProperty(vars, 'Math')) {
      container = Math
    }
  } else if (tokens[i] === 'Math' && tokens[i + 1] === '.') {
    return true // Deal with name following "Math." when we get to it above.
  } else {
    container = vars
  }
  return Boolean(container && hasOwnProperty(container, tokens[i]))
}

function checkTokens (tokens, vars) {
  let balance = 0
  for (let i = 0, len = tokens.length; i < len; ++i) {
    const token = tokens[i]
    if (token === '(') {
      ++balance
    } else if (token === ')' && --balance < 0) {
      break
    } else if (ID_TOKEN.test(token) && !isNameAtDefinedInContext(tokens, i, vars)) {
      return `${token} is not defined`
    }
  }
  if (balance) {
    return 'unbalanced parentheses'
  }
  return null
}

function fallback () {
  return 0
}

module.exports.toSafeExpression = function toSafeExpression (unsafe, vars) {
  const str = `${unsafe}`.normalize('NFC')
  let expr = fallback
  let message = 'malformed'
  if (SAFE_EXPR.test(str)) {
    const tokens = str.match(TOKENS).slice(0)
    message = checkTokens(tokens, vars)
    if (!message) {
      let safeExpr = tokens.join(' ')
      try {
        Function(safeExpr) // eslint-disable-line no-new-func
      } catch (exc) {
        message = 'missing operand'
        safeExpr = null
      }
      if (!message) {
        message = null
        // eslint-disable-next-line no-new-func
        expr = new Function(`with (arguments[0]) { return (${safeExpr}) }`).bind(null, vars)
      }
    }
  }
  return { expr, message }
}
