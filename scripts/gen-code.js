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

const fs = require('fs')
const path = require('path')
const process = require('process')
const pug = require('pug')

module.exports = genCode

if (require.main === module) {
  genCode((err) => {
    process.exitCode = -1
    console.error(err)
  })
}

function genCode (handleError) {
  const basedir = path.join(__dirname, '..')
  const sourcedir = path.join(basedir, 'lib', 'fixed')
  const gendir = path.join(basedir, 'generated')
  fs.mkdir(
    gendir,
    (err) => {
      if (err && err.code !== 'EEXIST') {
        handleError(err)
      } else {
        fs.readdir(sourcedir, compilePugs)
      }
    })

  function ifNewer (patha, pathb, f) {
    fs.stat(
      patha,
      (errA, { mtimeMs: aMtime }) => {
        if (errA) {
          handleError(errA)
        } else {
          fs.stat(
            pathb,
            (errB, { mtimeMs: bMtime } = {}) => {
              if (errB || aMtime >= bMtime) {
                f()
              }
            })
        }
      })
  }

  function compilePugs (err, files) {
    if (err) {
      handleError(err)
      return
    }

    files.forEach((basename) => {
      const ext = path.extname(basename)
      if (ext === '.pug') {
        const filename = path.join(sourcedir, basename)
        const outfile = path.join(
          gendir, `${basename.substring(0, basename.length - ext.length)}.js`)
        ifNewer(
          filename, outfile,
          () => {
            fs.readFile(
              filename, { encoding: 'UTF-8' },
              compilePug.bind(null, filename, outfile))
          })
      }
    })
  }

  function compilePug (filename, outfile, err, source) {
    if (err) {
      handleError(err)
      return
    }
    console.log(`regenerating ${outfile} from ${filename}`)
    const js = pug.compileClient(source, { basedir, filename })
    fs.writeFile(
      outfile,
      `'use strict';
${js}

module.exports = require('../lib/fixed/trusted-template')(template);
`,
      { encoding: 'UTF-8' },
      (x) => x && handleError)
  }
}
