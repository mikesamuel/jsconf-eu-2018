#!/usr/bin/env node

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
const crypto = require('crypto')
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
    })
}

// An adjacency map relating production source filenames to those they require.
// Production sources are defined as those reachable from the main module.
function inferProductionDependencyGraph () {
  const packageDir = process.cwd()
  const packageJson = require(path.join(packageDir, 'package.json')) // eslint-disable-line global-require
  let mainId = packageJson.main || './server'
  if (path.extname(mainId) === '') {
    mainId += '.js'
  }
  const main = path.resolve(packageDir, mainId) // For production.
  console.log(`Enumerating production dependencies from ${main}`)
  const prodMainModule = require.cache[main]

  const prodDepGraph = new Map()
  const seen = new Set()
  function visit (m) {
    if (!m) {
      return
    }
    const { filename, children } = m
    if (!seen.has(filename)) {
      seen.add(filename)
      const adjacents = []
      for (const child of children) {
        if (child && child.filename) {
          visit(child)
          adjacents.push(child.filename)
        }
      }
      prodDepGraph.set(filename, adjacents)
    }
  }
  visit(prodMainModule)

  return prodDepGraph
}

// Smaller paths for output files.
const simplePath = path.relative.bind(null, process.cwd())

function writeProductionDependencies (outFile) {
  const prodGraph = inferProductionDependencyGraph()

  function dotNode (node) {
    return JSON.stringify(simplePath(node))
  }

  let nodes = new Set() // Union of keys and values in prodGraph
  const dotEdgeData = [] // Collect lines like "source" -> "dest";
  prodGraph.forEach((values, key) => {
    nodes.add(key)
    for (const value of values) {
      nodes.add(value)
      dotEdgeData.push(`\n  ${dotNode(key)} -> ${dotNode(value)};`)
    }
  })
  nodes = Array.from(prodGraph.keys())
  nodes.sort()
  nodes.forEach((node) => {
    let attrs = []
    if (/^node_modules\//.test(simplePath(node))) {
      attrs.push('fillcolor=lightgray style=filled')
    }
    if (attrs.length) {
      dotEdgeData.push(`\n  ${dotNode(node)} [${attrs.join(', ')}];`)
    }
  })

  const outBaseFile = outFile.substring(0, outFile.length - path.extname(outFile).length)

  // Write out a .dot file with the graph details.
  dotEdgeData.sort()
  const graphData = `digraph Requires {${dotEdgeData.join('')}\n}\n`
  const outDotFile = `${outBaseFile}.dot`
  fs.writeFile(
    outDotFile, graphData, { encoding: 'UTF-8' },
    (err) => {
      if (err) {
        console.error(`Filed to write require graph: ${err.message}`)
        process.exitCode = process.exitCode || 1
      } else {
        console.log(`Wrote require graph to ${outDotFile}`)
      }
    })

  // Write out a .modulelist file with hashes for each file.
  const outListFile = `${outBaseFile}.json`
  const hashToSimpleNames = Object.create(null)
  let nInFlight = 0
  nodes.forEach(hashProdSource)

  function hashProdSource (node) {
    nInFlight += 1
    fs.readFile(node, mapHashToSource.bind(null, node))
  }

  function mapHashToSource (node, err, data) {
    if (err) {
      console.error(`Failed to hash prod source: ${err.message}`)
      process.exitCode = process.exitCode || 1
    } else {
      const key = crypto.createHash('sha256').update(data).digest('hex')
      if (!(key in hashToSimpleNames)) {
        hashToSimpleNames[key] = []
      }
      hashToSimpleNames[key].push(simplePath(node))
    }
    --nInFlight
    if (!nInFlight) {
      emitProductionFileList()
    }
  }

  function emitProductionFileList () {
    fs.writeFile(
      outListFile,
      `${JSON.stringify(hashToSimpleNames, sortKeys, 2)}\n`,
      { encoding: 'UTF-8' },
      (err) => {
        if (err) {
          console.error(`Filed to write production file list: ${err.message}`)
          process.exitCode = process.exitCode || 1
        } else {
          console.log(`Wrote production file list to ${outListFile}`)
        }
      })
  }

  function sortKeys (key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const names = Object.getOwnPropertyNames(value)
      names.sort()

      const sorted = Object.create(null)
      for (const name of names) {
        sorted[name] = value[name]
      }

      return sorted
    }
    return value
  }
}

if (require.main === module) {
  const [ , , outFile ] = process.argv
  if (outFile === '--help') {
    console.log(`
Usage: ${process.slice(0, 2).join(' ')} <outFile>

Starts up a vanilla mocha testrunner.

This script must run from the module's root directory.

Outputs:
  <outFile>.dot - A DOT graph file showing which production sources require which others.
  <outFile>.json - A JSON file mapping production source hashes to file pahts.

A production source is any file required (transitively) from the main module specified
in package.json.
`.trim())
  } else {
    let done = false
    process.on(
      'beforeExit', () => {
        if (!done) {
          done = true
          writeProductionDependencies(outFile || '.require.dot')
        }
      })
    runTests()
  }
}
