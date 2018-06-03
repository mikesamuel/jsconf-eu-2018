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

const http = require('http')
const { argv } = require('process')
const nodeSecPatterns = require('node-sec-patterns')
const packageJson = require('./package.json')

nodeSecPatterns.authorize(packageJson)

if (require.main === module) {
  let makeHandler = null
  let unguessable = null

  argv.shift() // /bin/node
  argv.shift() // __filename

  const defaultHostName = 'localhost'
  const defaultPort = 8080
  const defaultRootDir = process.cwd()

  if (argv[0] === '--help') {
    console.log(`Usage node ${__filename} [--fixed] [<hostName> [<port> [<rootdir>]]]

--fixed:    Run the fixed version instead of the buggy version.
<hostname>: The hostname the service is typically reached under.  Default ${defaultHostName}
<port>:     The local port to listen on.  Default ${defaultPort}
<rootdir>:  The root directory to use for static files and stored uploads.  Default ${defaultRootDir}
`)
  } else {
    if (argv[0] === '--fixed') {
      argv.shift()
      void ({ makeHandler, unguessable } = require('./lib/fixed/index')) // eslint-disable-line global-require
    } else {
      ({ makeHandler, unguessable } = require('./lib/broken/index')) // eslint-disable-line global-require
    }

    const [ hostName = defaultHostName, port = defaultPort, rootDir = defaultRootDir ] = argv
    const handler = makeHandler(unguessable, rootDir, hostName)
    const server = http.createServer(handler)
    server.listen(
      port | 0, // eslint-disable-line no-bitwise
      hostName,
      (err) => {
        if (err) {
          process.exitCode = 0
          console.error(err)
        } else {
          // eslint-disable-next-line no-console
          console.log(`Serving from ${hostName}:${server.address().port} at ${rootDir}`)
        }
      })
  }
} else {
  require('./lib/fixed/index') // eslint-disable-line global-require
}
