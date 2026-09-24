import app from './app'

Bun.serve({
  // port: 8080, // defaults to $BUN_PORT, $PORT, $NODE_PORT otherwise 3000
  hostname: "0.0.0.0", // defaults to "0.0.0.0"
  // Bun closes a connection after 10s without data by default, which is far
  // too little for a photo upload: a phone on WiFi, or a picture macOS still
  // has to fetch from iCloud, stalls for longer than that. The body then
  // arrives truncated and fails to parse. 120s is the upload budget.
  idleTimeout: 120,
  fetch: app.fetch.bind(app),
});

console.log("server is running");