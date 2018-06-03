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

const PREC_SUM = 0
const PREC_MUL = 1
const PREC_PREFIX = 2
const PREC_GROUP = PREC_SUM

const OPERATORS = {
  __proto__: null,
  '*': [ PREC_MUL, (x, y) => x * y ],
  '/': [ PREC_MUL, (x, y) => x / y ],
  '%': [ PREC_MUL, (x, y) => x % y ],
  '+': [ PREC_SUM, (x, y) => x + y ],
  '-': [ PREC_SUM, (x, y) => x - y ]
}

function interpreter (tokens, vars) {
  function interpretMath (left, prec) {
    let i = left + 2
    const name = tokens[i]
    if (!Object.hasOwnProperty.call(Math, name)) {
      throw new Error(`Math.${name} not defined`)
    }
    let value = Math[name]
    ++i
    if (tokens[i] === '(') {
      if (typeof value !== 'function') {
        throw new Error(`Math.${name} not callable`)
      }
      ++i
      const actuals = []
      while (tokens[i] !== ')') {
        if (i >= tokens.length) {
          throw new Error('unbalanced parentheses')
        }
        const [ actual, ip ] = interpret(i, PREC_GROUP)
        actuals.push(actual)
        i = ip + 1
        if (tokens[ip] === ',') {
          continue
        }
        if (tokens[ip] !== ')') {
          throw new Error('unbalanced parentheses')
        }
        break
      }
      value = Reflect.apply(value, Math, actuals)
    }
    return [ Number(value), i ]
  }
  function interpretName (left, prec) {
    const name = tokens[left]
    if (Object.hasOwnProperty.call(vars, name)) {
      const result = Number(vars[name])
      if (isNaN(result)) {
        throw new Error(`${name} is not a number`)
      }
      return [ result, left + 1 ]
    }
    if (/^\w/.test(name)) {
      throw new Error(`${name} is not defined`)
    } else {
      throw new Error(`${name} is not a valid name`)
    }
  }
  function interpretNumber (left, prec) {
    const token = tokens[left]
    const result = Number(token)
    if (/^(?!0[.])0+[1-9.]/.test(token) || isNaN(result)) {
      throw new Error(`malformed ${token}`)
    }
    return [ result, left + 1 ]
  }
  function interpretPrefix (left, prec) {
    const operator = tokens[left]
    const [ result, ip ] = interpret(left + 1, PREC_PREFIX)
    if (operator === '-') {
      return [ -result, ip ]
    }
    return [ result, ip ]
  }
  function interpretGroup (left, prec) {
    const [ result, ip ] = interpret(left + 1, PREC_GROUP)
    if (tokens[ip] !== ')') {
      throw new Error('unbalanced parentheses')
    }
    return [ result, ip + 1 ]
  }
  function interpretAtom (left, prec) {
    switch (tokens[left]) {
      case '(':
        return interpretGroup(left, prec)
      case '+': case '-':
        return interpretPrefix(left, prec)
      case 'Math':
        if (tokens[left + 1] === '.') {
          return interpretMath(left, prec)
        }
        break
      default:
    }
    const handler = /^[0-9.]/.test(tokens[left])
      ? interpretNumber
      : interpretName
    return handler(left, prec)
  }

  function interpret (left, prec) {
    let [ result, i ] = interpretAtom(left, prec)
    while (i < tokens.length && OPERATORS[tokens[i]]) {
      const [ opPrec, exec ] = OPERATORS[tokens[i]]
      if (opPrec < prec) {
        break
      }
      if (i + 1 === tokens.length) {
        throw new Error(`missing operand: ${tokens[i]}`)
      }
      const [ rightOperand, ip ] = interpret(i + 1, prec + 1)
      const resultp = exec(result, rightOperand)
      if (isNaN(result)) {
        throw new Error(`failed to ${result} ${tokens[i]} ${rightOperand}`)
      }
      [ result, i ] = [ resultp, ip ]
    }
    return [ result, i ]
  }

  return interpret
}

function fallback () {
  return 0
}

module.exports.toSafeExpression = function toSafeExpression (unsafe, vars) {
  const str = `${unsafe.normalize('NFC')}`
  const tokens = (
    str.match(/--?|\+\+?|[*/%,()]|[\d.]+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|\s+|./g) || [])
    .filter((token) => /^\S/.test(token))
  if (!tokens.length) {
    return { expr: fallback, message: 'malformed' }
  }
  let result = 0
  let i = null
  try {
    [ result, i ] = interpreter(tokens, vars)(0, PREC_GROUP)
  } catch (exc) {
    return { expr: fallback, message: exc.message }
  }
  if (i !== tokens.length) {
    return { expr: fallback, message: `unparsed: ${tokens.slice(i).join(' ')}` }
  }
  return { expr: () => result, message: null }
}
