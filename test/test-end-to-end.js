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

const { expect } = require('chai')
const { describe, it } = require('mocha')

const childProcess = require('child_process')
const escapeHtml = require('escape-html')
const fs = require('fs')
const http = require('http')
const net = require('net')
const os = require('os')
const path = require('path')
const request = require('request')
const { URL } = require('url')

const canary = require('./canary')
const { makeHandler: brokenMakeHandler } = require('../lib/broken/index')
const { makeHandler: fixedMakeHandler } = require('../lib/fixed/index')
const hooks = require('./hooks')

const variants = {
  broke: 'broke',
  fixed: 'fixed',
  fixedExternal: 'fixed-external'
}

const serverRunners = {
  [variants.broke]: (hostName, fsRoot, callback) => {
    const handler = brokenMakeHandler(stubUnguessable(), fsRoot, hostName)
    const server = http.createServer(handler)
    server.listen(() => {
      const url = `http://${hostName}:${server.address().port}`
      callback(null, url, () => server.close())
    })
  },

  [variants.fixed]: (hostName, fsRoot, callback) => {
    const handler = fixedMakeHandler(stubUnguessable(), fsRoot, hostName)
    const server = http.createServer(handler)
    server.listen(() => {
      const url = `http://${hostName}:${server.address().port}`
      callback(null, url, () => server.close())
    })
  }
}

const generatingImportGraph = path.basename(require.main.filename) === 'gen-import-graph.js'

if (!generatingImportGraph) {
  serverRunners[variants.fixedExternal] = (hostName, fsRoot, callback) => {
    const proc = childProcess.spawn(
      'npm',
      ['run', 'startonly', '--', '--fixed', hostName, '0', fsRoot],
      {
        shell: false,
        'stdio': ['ignore', 'pipe', 'pipe']
      })
    proc.unref()
    let stdout = ''
    let stderr = ''
    let serving = false
    proc.on('close', (code) => {
      if (!serving) {
        callback(new Error(`server failed to start: ${code}`))
      }
    })
    proc.stderr.on('data', (data) => { stderr += data })
    proc.stdout.on('data', (data) => {
      if (!serving) {
        stdout += data
        const match = /(?:^|\n)Serving from (\S+:\d+) at /.exec(stdout)
        if (match) {
          serving = true
          stdout = null
          callback(
            null, `http://${match[1]}`,
            (err) => {
              proc.kill('SIGTERM')
              setTimeout(() => proc.kill('SIGKILL'), 250)
              if (err) {
                console.warn(stderr)
              }
            })
        }
      }
    })
  }
}

// A non-random nonce generator that produces stable results for testing.
function stubUnguessable () {
  let counter = 0
  return () => `no-n+c.e/${(++counter).toString().padStart(3, '0')}_==`
}

function enableHooksUntilDone (done, enabled) {
  hooks.setEnabled(enabled)
  return (...args) => {
    hooks.setEnabled(false)
    Reflect.apply(done, null, args)
  }
}

function serverTest (testName, testFun) {
  for (const [ variant, runServer ] of Object.entries(serverRunners)) {
    let test = it(`${testName} ${variant}`, (done) => {
      done = enableHooksUntilDone(done, variant === variants.fixed)

      // Set up directory structure like
      // npmtest-1234/
      //   lib/
      //     index.js
      //   node_modules/
      //     ...
      //   static/
      //     ...
      const fsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npmtest'));
      [ 'lib', 'node_modules', 'static' ].forEach((fileToLink) => {
        fs.symlinkSync(
          path.join(__dirname, '..', fileToLink),
          path.join(fsRoot, fileToLink))
      })
      const hostName = 'localhost'
      runServer(hostName, fsRoot, (err, url, stop) => {
        if (err) {
          done(err)
          throw err
        }
        let closed = false
        function closeAndEnd (err) {
          if (!closed) {
            closed = true
            stop(err)
            if (err) {
              console.log(`Leaving server test root: ${fsRoot}`)
              return done(err)
            }
            childProcess.execFile('rm', [ '-rf', fsRoot ])
            return done()
          }
          return null
        }
        try {
          testFun(variant, url, fsRoot, () => closeAndEnd())
        } catch (exc) {
          closeAndEnd(exc)
          throw exc
        }
      })
    })
    if (variant === variants.fixedExternal) {
      // Spawning an external process takes a bit longer.
      test.slow(1000)
      test.timeout(5000)
    }
  }
}

function sessionCookieForResponse ({ headers }) {
  const setCookies = headers['set-cookie']
  if (setCookies) {
    for (const setCookie of setCookies) {
      const [ , session ] = /^session=([^;]*)/.exec(setCookie) || []
      if (session) {
        return decodeURIComponent(session)
      }
    }
  }
  return void 0
}

describe('end-to-end', () => {
  serverTest('GET / OK', (variant, baseUrl, fsRoot, done) => {
    request(
      `${baseUrl}/`,
      (error, response, body) => {
        expect(error, 'error').to.equal(null)
        expect(response.statusCode, 'status code').to.equal(200)
        expect(body).to.include('Upload files with equations to compute')
        expect(body).to.not.include('Equations')
        done()
      })
  })
  serverTest('404', (variant, baseUrl, fsRoot, done) => {
    request(
      `${baseUrl}/bogus`,
      (error, response, body) => {
        expect(error, 'error').to.equal(null)
        expect(response.statusCode, 'status code').to.equal(404)
        done()
      })
  })
  serverTest('static file', (variant, baseUrl, fsRoot, done) => {
    request(
      `${baseUrl}/form-validation.js`,
      (error, response, body) => {
        expect(error, 'error').to.equal(null)
        expect(response.statusCode, 'status code').to.equal(200)
        expect(response.headers['content-type'], 'content-type').to.include('application/javascript')
        expect(body).to.include('window')
        done()
      })
  })
  serverTest('upload file', (variant, baseUrl, fsRoot, done) => {
    let session = null
    let relUploadPath = null

    request(`${baseUrl}/`, onInitialRender)
    function onInitialRender (error, response, body) {
      // Visit the index page
      expect(error, 'error').to.equal(null)
      expect(response.statusCode, 'status code').to.equal(200)
      session = sessionCookieForResponse(response)
      expect(session, 'session').to.be.a('string')
      if (variant !== variants.fixedExternal) {
        expect(session, 'session').to.match(/^no-n\+c\.e\.00\d_==$/)
      }

      // Fill in the upload form
      request.post(
        {
          url: `${baseUrl}/upload`,
          headers: {
            'Cookie': `session=${encodeURIComponent(session)}`
          },
          encType: 'multipart/form-data',
          formData: {
            upload: {
              value: fs.createReadStream(path.join(__dirname, 'data', 'a_plus_b.txt')),
              options: {
                filename: 'expr.txt',
                contentType: 'text/plain; charset=UTF-8'
              }
            }
          }
        },
        onUpload)
    }
    function onUpload (error, response, body) {
      // Make sure the file ends up in the right place.
      expect(error, 'error').to.equal(null)
      expect(response.statusCode, 'status code').to.equal(200)
      const matches = body.match(/ as ([^<]*)(?=<\/li>)/g)
      expect(matches, 'paths').to.be.an('array')
      expect(matches.length, '# paths').to.equal(1)
      relUploadPath = matches[0].replace(/^ as /, '')
      expect(relUploadPath, 'path suffix').to.match(/[.]txt$/)
      const fullPath = path.join(fsRoot, 'uploads', relUploadPath)
      const uploadContent = fs.readFileSync(fullPath)
      expect(uploadContent.toString(), 'upload').to.equal('a + b\n')

      // Refetch the index page.
      request(
        {
          url: `${baseUrl}/`,
          headers: {
            'Cookie': `session=${encodeURIComponent(session)}`
          }
        },
        onBackToIndex)
    }
    function onBackToIndex (error, response, body) {
      expect(error, 'error').to.equal(null)
      expect(response.statusCode, 'status code').to.equal(200)
      expect(body).to.include('Upload files with equations to compute')
      expect(body).to.include('Equations')
      expect(body).to.include('a + b</label>') // Snippet

      const vars = encodeURIComponent(JSON.stringify({ 'a': 6, 'b': 11 }))
      request(
        {
          // TODO: check with the radio button value.
          url: `${baseUrl}/calculate?calc=${encodeURIComponent(relUploadPath)}&vars=${vars}`,
          headers: {
            'Cookie': `session=${encodeURIComponent(session)}`
          }
        },
        onCalculate)
    }
    function onCalculate (error, response, body) {
      expect(error, 'error').to.equal(null)
      expect(response.statusCode, 'status code').to.equal(200)
      expect(body, 'expresison result').to.equal('17')
      done()
    }
  })
  serverTest('XSS via addition', (variant, baseUrl, fsRoot, done) => {
    let session = null
    let relUploadPath = null

    // Fill in the upload form
    request.post(
      {
        url: `${baseUrl}/upload`,
        encType: 'multipart/form-data',
        formData: {
          upload: {
            value: fs.createReadStream(path.join(__dirname, 'data', 'a_plus_b.txt')),
            options: {
              filename: 'expr.txt',
              contentType: 'text/plain; charset=UTF-8'
            }
          }
        }
      },
      onUpload)

    function onUpload (error, response, body) {
      expect(error, 'error').to.equal(null)
      expect(response.statusCode, 'status code').to.equal(200)
      session = sessionCookieForResponse(response)
      const matches = body.match(/ as ([^<]*)(?=<\/li>)/g)
      expect(matches, 'paths').to.be.an('array')
      expect(matches.length, '# paths').to.equal(1)
      relUploadPath = matches[0].replace(/^ as /, '')
      expect(relUploadPath, 'path suffix').to.match(/[.]txt$/)
      const fullPath = path.join(fsRoot, 'uploads', relUploadPath)
      const uploadContent = fs.readFileSync(fullPath)
      expect(uploadContent.toString(), 'upload').to.equal('a + b\n')

      const vars = encodeURIComponent(JSON.stringify({ 'a': '<script>alert(1)', 'b': '</script>' }))
      request(
        {
          url: `${baseUrl}/calculate?calc=${encodeURIComponent(relUploadPath)}&vars=${vars}`,
          headers: {
            'Cookie': `session=${encodeURIComponent(session)}`
          }
        },
        onCalculate)
    }
    function onCalculate (error, response, body) {
      expect(error, 'error').to.equal(null)
      const [ want, status, expectCsp ] = variant !== variants.broke
        ? [ 'Compute failed: a is not a number', 500, true ]
        : [ '<script>alert(1)</script>', 200, false ]
      expect(Boolean(response.headers['content-security-policy']), 'has CSP').to.equal(expectCsp)
      expect(response.statusCode, 'status code').to.equal(status)
      expect(body, 'expresison result').to.equal(want)
      done()
    }
  })
  serverTest('XSS via error message', (variant, baseUrl, fsRoot, done) => {
    const rawPayload = '<img src=bogus onerror=alert(1)>'
    const escPayload = escapeHtml('<img src=bogus onerror=alert(1)>')
    // Fill in the upload form
    request.get(
      `${baseUrl}/${encodeURIComponent(rawPayload)}`,
      (error, response, body) => {
        expect(error, 'error').to.equal(null)
        expect(response.statusCode, 'status code').to.equal(404)

        const [ hasRawPayload, hasEscPayload, hasCsp ] = variant !== variants.broke
          ? [ false, true, true ]
          : [ true, false, false ]

        expect(body.indexOf(rawPayload) >= 0, `raw payload in ${body}`).to.equal(hasRawPayload)
        expect(body.indexOf(escPayload) >= 0, `esc payload in ${body}`).to.equal(hasEscPayload)
        expect(Boolean(response.headers['content-security-policy'])).to.equal(hasCsp)
        done()
      })
  })
  serverTest('shell injection', (variant, baseUrl, fsRoot, done) => {
    let template = `POST /upload HTTP/1.1
Accept: */*
Content-Type: multipart/form-data; boundary="893e5556-f402-4fec-8180-c59333354c6f"
Content-Length: HOLE

--893e5556-f402-4fec-8180-c59333354c6f
Content-Disposition: form-data; name="upload"; filename*=utf-8''HOLE

1337
--893e5556-f402-4fec-8180-c59333354c6f--`
    template = `${template}\n`.replace(/\n/g, '\r\n')

    const [ beforeLength, middle, afterFilename ] = template.split('HOLE')

    const rawFilename = 'x.y\u2028" \ntouch pwned\necho "'
    function pctEncode (ch) {
      let pch = encodeURIComponent(ch)
      if (pch[0] === ch) {
        const hex = pch.charCodeAt(0).toString(16)
        if (hex.length > 2) {
          throw new Error(ch)
        }
        pch = `%${(hex.length === 1 ? '0' : '') + hex}`
      }
      return pch
    }
    function pctEncodeAll (s) {
      return s.split('').map(pctEncode).join('')
    }
    const filename = pctEncodeAll(rawFilename)

    let contentLength = middle.length - (middle.indexOf('\r\n\r\n') + 4) + afterFilename.length
    contentLength += filename.length

    const message = beforeLength + contentLength + middle + filename + afterFilename

    const url = new URL(baseUrl)
    let response = ''
    const client = net.Socket()
    client.on('data', (chunk) => {
      response += chunk
      client.end()
    })
    client.on('close', () => {
      // check that effect happened or didn't
      expect(fs.existsSync(path.join(fsRoot, 'pwned')), 'file created')
        .to.equal(variant === variants.broke)
      expect(response, 'response').has.string('200')
      done()
    })
    client.connect(url.port, url.hostname, () => {
      client.write(message)
    })
  })
  serverTest('require uploaded file', (variant, baseUrl, fsRoot, done) => {
    canary.newCanary()
    expect(canary.isAlive(), 'canary').to.equal(true)

    let session = null
    let relUploadPath = null

    // Fill in the upload form
    request.post(
      {
        url: `${baseUrl}/upload`,
        encType: 'multipart/form-data',
        formData: {
          upload: {
            value: fs.createReadStream(path.join(__dirname, 'data', 'kill-canary.js')),
            options: {
              filename: 'kill-canary.js',
              contentType: 'text/plain; charset=UTF-8'
            }
          }
        }
      },
      onUpload)

    function onUpload (error, response, body) {
      expect(error, 'error').to.equal(null)
      expect(response.statusCode, 'status code').to.equal(200)

      session = sessionCookieForResponse(response)

      const matches = body.match(/ as ([^<]*)(?=<\/li>)/g)
      expect(matches, 'paths').to.be.an('array')
      expect(matches.length, '# paths').to.equal(1)
      relUploadPath = matches[0].replace(/^ as /, '')
      expect(relUploadPath, 'path suffix').to.match(/[.]js$/)

      const target = path.join(fsRoot, 'uploads', relUploadPath)
      const source = path.join(__dirname, '..', 'node_modules', 'colors', 'safe', 'lib')
      const rel = path.relative(source, target)

      const attackPath = rel.replace(/^\.js$/, '')
      request.post(
        // Path relative to node_modules/colors/safe
        `${baseUrl}/client-error?style=${encodeURIComponent(attackPath)}`,
        {
          form: {
            foo: 'bar'
          },
          headers: {
            'Cookie': `session=${encodeURIComponent(session)}`
          }
        },
        onClientErrorReport)
    }

    function onClientErrorReport (error, response, body) {
      expect(error, 'error').to.equal(null)

      // This test causes problems when running `npm genlists` because
      // it requires the source lists to be actively blocking things, but the
      // source lists are what we are building.
      if (!generatingImportGraph) {
        expect(canary.isAlive(), 'canary').to.equal(variant !== variants.broke)
      }
      done()
    }
  })
})
