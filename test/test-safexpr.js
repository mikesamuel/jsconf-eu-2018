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

/* eslint no-magic-numbers: 0 */

'use strict'

const { expect } = require('chai')
const { describe, it } = require('mocha')
const { toSafeExpression: safeToSafeExpression } = require('../lib/broken/safeexpr.js')
const { toSafeExpression: saferToSafeExpression } = require('../lib/fixed/safeexpr.js')

describe('broken/safeexpr', () => testToSafeExpression(safeToSafeExpression))
describe('fixed/safeexpr', () => testToSafeExpression(saferToSafeExpression))

function testToSafeExpression (toSafeExpression) {
  function good (input, result, vars = {}) {
    const { expr, message } = toSafeExpression(input, vars)
    expect({ result: expr(), message }, input).to.deep.equals({ result, message: null })
  }

  function bad (input, failures = [ 'malformed' ], vars = {}) {
    const { expr, message } = toSafeExpression(input, vars)
    const golden = {
      result: 0,
      message: new Set(failures).has(message) ? message : failures
    }
    expect({ result: expr(), message }, input).to.deep.equals(golden)
  }

  it('no tokens', () => {
    bad('')
    bad('', 'malformed', { x: 1 })
    bad(' ')
  })
  it('zero', () => {
    good('0', 0)
    good(' 0.0 ', 0)
    good(' 0. ', 0)
    good('.0\n', 0)
    good('-0', -0)
    bad(' 0.. ', [ 'malformed', 'malformed 0..' ])
    bad(' 0.. ', [ 'malformed', 'malformed 0..' ], { '0..': 1 })
  })
  it('numbers', () => {
    good('1', 1)
    good('1.0', 1)
    good('1.5', 1.5)
    good('.333', 0.333)
    good('0.333', 0.333)
    good('1e1', 10)
    good('1e-1', 0.1)
    good('1E+1', 10)
    good('999.999', 999.999)
    bad('.', [ 'malformed', 'malformed .' ])
    bad('1e', [ 'malformed', 'unparsed: e' ])
    bad('01', [ 'malformed', 'malformed 01' ])
    bad('.e123', [ 'malformed', 'malformed .e123' ])
    bad('.e-456', [ 'malformed', 'malformed .e-456' ])
  })
  it('signs', () => {
    good('-1', -1)
    good('-.00125e-2', -0.00125e-2)
    good('+2', +2)
    bad('1++2', [ 'malformed', 'unparsed: ++ 2' ])
    good('1 + +2', 3)
  })
  it('vars', () => {
    good('x', 1, { x: 1 })
    bad('y', 'y is not defined', { x: 1 })
    good('y', 1, { y: 1 })
    bad('x.y', [ 'malformed', 'x is not a number' ], { x: { y: 1 } })
    bad('x.y', [ 'malformed', 'x is not defined' ], { 'x.y': 1 })
    good('x1', 1, { x1: 1 })
    bad('1x', [ 'malformed', 'unparsed: x' ], { '1x': 1 })
    bad('constructor', 'constructor is not defined')
  })
  it('math', () => {
    good('Math.sqrt(2)', Math.sqrt(2))
    good('Math.pow(2, n)', 4, { n: 2 })
    good('Math.pow(2,n)', 4, { n: 2 })
    bad('Math.pow(2,n)', 'n is not defined')
    good(' Math . pow ( 2 , n ) ', 4, { n: 2 })
    bad('Math.pow(2, n', 'n is not defined')
    bad('Math.pow(2,', 'unbalanced parentheses')
    bad('Math.pow(2', 'unbalanced parentheses')
    good('Math.PI', Math.PI)
    good('Math.PI / 2', Math.PI / 2)
    bad('Math.pow( / 2', [ 'malformed', '/ is not a valid name' ])
  })
  it('ops', () => {
    good('2 + 2', 4)
    good('2 - 2', 0)
    good('2 - 2 - 2', -2)
    good('7 % 4', 3)
    good('2 / 2', 1)
    good('2 * 2', 4)
    good('3 * 7 + 11', 32)
    good('3 * 7 + (-11 + 13) * 19 - 23', 36)
    good('1 / -0', 1 / -0)
    good('1 / 0', 1 / 0)
    bad('* 2', [ 'malformed', '* is not a valid name' ])
    bad('2 *', [ 'missing operand', 'missing operand: *' ])
    bad('2**2', [ 'malformed', '* is not a valid name' ])
    bad('2//2', [ 'malformed', '/ is not a valid name' ])
    bad('2/*2', [ 'malformed', '* is not a valid name' ])
    bad('2*/2', [ 'malformed', '/ is not a valid name' ])
    bad('x/y', 'x is not defined', { xy: 1 })
    bad('x--y', [ 'malformed', 'unparsed: -- y' ], { x: 1, y: 1 })
  })
}
