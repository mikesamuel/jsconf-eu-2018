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

/* eslint no-alert: 0 */

'use strict'

void (() => {
  const originalError = console.error
  console.error = (...args) => {
    // Fire and forget error to server.
    const message = new window.XMLHttpRequest()
    const url = `${document.origin}/client-error?style=zebra`
    message.open('POST', url, true)
    message.send(args.join(' '))

    return Reflect.apply(originalError, console, args)
  }

  // Add error handlers to forms.
  const calcForm = document.getElementById('calc-form')
  if (calcForm) {
    calcForm.onsubmit = (e) => {
      // Check that vars is well-formed.
      try {
        JSON.parse(calcForm.elements.vars.value)
      } catch (exc) {
        window.alert('Variables should be well-formed JSON mapping variable names to numeric values.')
        console.error('Form aborted due to bad JSON')
        calcForm.elements.vars.select()
        calcForm.elements.vars.focus()
        return false
      }

      return true
    }
  }

  const uploadForm = document.getElementById('upload-form')
  if (uploadForm) {
    uploadForm.onsubmit = (e) => {
      // Make sure there is at least one upload.
      if (uploadForm.elements.upload.files.length === 0) {
        window.alert('Please choose at least one file to upload.')
        console.error('Form aborted due to zero uploads')
        uploadForm.elements.upload.focus()
        return false
      }
      return true
    }
  }
})()
