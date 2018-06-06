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

const colors = require('colors/safe') // 7.9 M downloads/wk
const cookie = require('cookie') // 5.1 M downloads/wk
const crypto = require('crypto') // builtin
const fs = require('fs') // builtin
const multiparty = require('multiparty') // 350 k downloads/wk
const path = require('path') // builtin
const serveStatic = require('serve-static') // 5.3 M downloads/wk
const url = require('url') // builtin
const { sh } = require('sh-template-tag')

const safeexpr = require('./safeexpr')
const calculateTemplate = require('../../generated/calculate')
const execShFragment = require('./exec-sh-fragment')
const fileNotFoundTemplate = require('../../generated/file-not-found')
const indexTemplate = require('../../generated/index')
const uploadTemplate = require('../../generated/upload')
const { requireTrustedHtml } = require('./trusted-html')

module.exports = { makeHandler, unguessable }

function unguessable (n) {
  return crypto.randomBytes(n || 32).toString('base64')
}

function setHeaders (res) {
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Content-Security-Policy', 'default-src none; report-uri /client-error?style=green')
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

  function guardBodyWriters (res) {
    // Ensure that the response body is trusted HTML chunks.
    const end = res.end.bind(res)
    const write = res.write.bind(res)
    res.end = (html, ...rest) => // eslint-disable-line no-confusing-arrow
      (html || rest.length ? end(requireTrustedHtml(html), ...rest) : end())
    res.write = (html, ...rest) => write(requireTrustedHtml(html), ...rest)
  }

  // Handles and end()s HTTP requests.
  function handle (req, res) {
    guardBodyWriters(res)

    // Some request derived info.
    const reqUrl = new url.URL(req.url, `http://${hostname}/`)
    const pathname = decodeURIComponent(reqUrl.pathname) // File path fragment
    console.log(`${req.method} ${req.url}`)

    // Generate secrets for various scopes.
    const cspNonce = mintUnguessable() // Scoped to response
    const sessionNonce = sessionNonceFor(req, res) // Scoped to session.

    // Write some common headers early.
    setHeaders(res)
    res.setHeader('Content-Security-Policy', // Overrides any from setHeaders
      `default-src none; script-src 'nonce-${cspNonce}'; report-uri /client-error?style=green`)
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
        res.end(indexTemplate({ files, cspNonce, sessionNonce, snippetOf }))
      })
    }

    function storeUploadedEquations () { // Receives <input type=file> and stores in per-user directory.
      new multiparty.Form().parse(req, (err, fields, files) => {
        if (err || !files || !files.upload) {
          res.writeHead(500)
          res.end('Upload failed')
        } else {
          const { upload } = files
          const fileRecords = []
          for (const { originalFilename, path: temp, size } of upload) {
            if (size) {
              const dir = uploadPath(sessionNonce)
              const basename = path.basename(temp) // keep the same autogenerated name
              const shared = uploadPath(basename) // shareable
              const owned = uploadPath(sessionNonce, unguessableFile()) // includes uploader's nonce
              execShFragment(
                sh`cd ${fsRoot} && mkdir -p ${dir}/ && mv ${temp} ${shared} && ln -s ${shared} ${owned}`)
              fileRecords.push({ originalFilename, basename })
            }
          }
          res.writeHead(200)
          res.end(uploadTemplate({ fileRecords }))
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
          res.end(calculateTemplate({ message, expr }))
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
      res.end(fileNotFoundTemplate({ pathname }))
    }
  }
}

function nilFunction () {
  // Left intentionally blank.  See eslint no-empty-function
}
