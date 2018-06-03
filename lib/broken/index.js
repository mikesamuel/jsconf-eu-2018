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

const childProcess = require('child_process') // builtin
const colors = require('colors/safe') // 7.9 M downloads/wk
const cookie = require('cookie') // 5.1 M downloads/wk
const crypto = require('crypto') // builtin
const escapeHtml = require('escape-html') // 5 M downloads/wk
const fs = require('fs') // builtin
const multiparty = require('multiparty') // 350 k downloads/wk
const path = require('path') // builtin
const serveStatic = require('serve-static') // 5.3 M downloads/wk
const url = require('url') // builtin

const safeexpr = require('./safeexpr')

module.exports = { makeHandler, unguessable }

function unguessable (n) {
  return crypto.randomBytes(n || 32).toString('base64')
}

function setHeaders (res) {
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-XSS-Protection', '0') // TODO: FOR DEMO
}

function makeHandler (mintUnguessable, fsRoot, hostname) {
  // Serve static files from under static/ and use handle() for dynamic requests.
  const staticFileRoot = path.join(fsRoot, 'static')
  const staticHandler = serveStatic(staticFileRoot, { setHeaders })
  return (req, res) => staticHandler(req, res, handle.bind(null, req, res))

  function unguessableFile () {
    return mintUnguessable().replace(/\//g, '.')
  }

  // A per-session URL-safe secret.
  function sessionNonceFor (req, res) {
    const nonce = cookie.parse(req.headers.cookie || '').session || unguessableFile()
    res.setHeader(
      'Set-Cookie',
      cookie.serialize('session', nonce,
        {
          sameSite: true,
          httpOnly: true,
          maxAge: 7 * 24 * 60 * 60/* s */
        }))
    return nonce
  }

  // Handles and end()s HTTP requests.
  function handle (req, res) {
    // Some request derived info.
    const reqUrl = new url.URL(req.url, `http://${hostname}/`)
    const pathname = decodeURIComponent(reqUrl.pathname) // File path fragment
    console.log(`${req.method} ${req.url}`)

    // Generate secrets for various scopes.
    const sessionNonce = sessionNonceFor(req, res) // Scoped to session.

    // Write some common headers early.
    setHeaders(res)
    res.setHeader('Content-type', 'text/html; charset=UTF-8')

    // Dispatch based on path and method
    if (pathname === '/') {
      serveIndexPage()
    } else if (pathname === '/upload' && req.method === 'POST') { // Handle uploads of equations.
      storeUploadedEquations()
    } else if (pathname === '/calculate' && req.method === 'GET') { // Evaluate an expression.
      calculateResult()
    } else if (pathname === '/client-error' && req.method === 'POST') { // Log client-side failures.
      logClientError()
    } else {
      handleUnrecognizedPathMethodCombination()
    }

    // Path of a file under the uploads directory for the current user.
    function uploadPath (...pathParts) {
      return path.join(fsRoot, 'uploads', ...pathParts)
    }

    // First 40-ish characters of an upload file.
    function snippetOf (file) {
      const fd = fs.openSync(uploadPath(sessionNonce, file), 'r')
      const snippet = Buffer.alloc(128)
      let nRead = 0
      try {
        nRead = fs.readSync(fd, snippet, 0, 40, 0)
      } finally {
        fs.close(fd, nilFunction)
      }
      return snippet.toString('UTF-8', 0, nRead).replace(/^\s+|\s+$/g, '') || 'blank'
    }

    function serveIndexPage () {
      fs.readdir(uploadPath(sessionNonce), (err, files) => {
        if (err === null) {
          // Ok.  We do not create a directory until a user uploads a file so expect ENOENT.
        }
        res.writeHead(200)
        res.write(`
          <!doctype html>
          <title>Calculator</title>
          <link rel="stylesheet" href="/styles.css" />`)
        if (files && files.length) { // List user's uploaded files
          res.write(`
            <h2>Equations</h2>
            <form id="calc-form" action="/calculate" method="GET">
              <textarea name="vars">${JSON.stringify({ 'var': 1 }, null, 2)}</textarea>
              <ul>`)
          files.forEach((file, i) => {
            res.write(`
                  <li><input ${i ? '' : 'checked'} id="radio-${i}" type="radio" name="calc"
                       value="${escapeHtml(sessionNonce)}/${escapeHtml(file)}" />
                  <label for="radio-${i}">${escapeHtml(snippetOf(file))}</label></li>`)
          })
          res.write(`
              </ul>
              <button type="submit">Calculate</button>
            </form>`)
        }
        // Let the user upload more equations.
        res.end(`
          <h2>Upload files with equations to compute</h2>
          <form id="upload-form" action="/upload" enctype="multipart/form-data" method="POST">
            <input type="file" name="upload" multiple="multiple"><br>
            <button type="submit" form="upload-form">Upload</button>
          </form>
          <script src="/form-validation.js"></script>`)
      })
    }

    function storeUploadedEquations () { // Receives <input type=file> and stores in per-user directory.
      new multiparty.Form().parse(req, (err, fields, files) => {
        if (err || !files || !files.upload) {
          res.writeHead(500)
          res.end('Upload failed')
        } else {
          const { upload } = files
          res.writeHead(200)
          res.write(`
            <title>Uploaded Calculations</title>
            <link rel="stylesheet" href="/styles.css" />
            <h2>Received upload</h2>
            <ul>`)
          for (const { originalFilename, path: temp, size } of upload) {
            if (size) {
              const dir = uploadPath(sessionNonce)
              const basename = path.basename(temp) // keep the same autogenerated name
              const shared = uploadPath(basename) // shareable
              const owned = uploadPath(sessionNonce, unguessableFile()) // includes uploader's nonce
              childProcess.execSync(
                `cd "${fsRoot}" && mkdir -p "${dir}/" && mv "${temp}" "${shared}" && ln -s "${shared}" "${owned}"`)
              res.write(`\n<li>${escapeHtml(originalFilename)} as ${escapeHtml(basename)}</li>`)
            }
          }
          res.end(`
            </ul>
            <form action="/" method=GET><button type=submit>Back</button></form>`)
        }
      })
    }

    function calculateResult () { // GET ?calc=<uploaded-filename>&vars=<JSON>
      fs.readFile(
        uploadPath(reqUrl.searchParams.get('calc')),
        { encoding: 'UTF-8' },
        (err, data) => {
          let message = err && (err.message || 'Exception')
          let expr = null
          if (!message) {
            let vars = null
            try {
              vars = JSON.parse(reqUrl.searchParams.get('vars') || '{}')
            } catch (ex) {
              message = 'Cannot parse variables from query.'
            }
            if (!message) {
              void ({ message, expr } = safeexpr.toSafeExpression(data, vars))
            }
          }
          res.writeHead(message ? 500 : 200)
          res.end(message ? `Compute failed: ${escapeHtml(message)}` : String(expr()))
        })
    }

    function logClientError () { // Client might POST error message here
      let style = reqUrl.searchParams.get('style') || 'rainbow'
      if (!Object.hasOwnProperty.call(colors, style)) {
        colors.setTheme(style)
        style = 'error'
      }
      style = colors[style] || ((x) => x)
      const data = []
      req.on('data', (chunk) => {
        data.push(chunk)
      }).on('end', () => {
        const message = Buffer.concat(data).toString()
        console.error(`Client error:${sessionNonce}: ${style(message)}`)
        res.writeHead(200)
        res.end()
      })
    }

    function handleUnrecognizedPathMethodCombination () {
      res.writeHead(404)
      res.end(`
        <title>Calculator: 404 Not Found</title>
        <link rel="stylesheet" href="/styles.css" />
        <h2>Not Found</h2>
        <tt>"${pathname}"</tt> does not exist.
        <form action="/" method=GET><button type=submit>Go To /</button></form>`)
    }
  }
}

function nilFunction () {
  // Left intentionally blank.  See eslint no-empty-function
}
