import app from './app'

Bun.serve({
  // port: 8080, // defaults to $BUN_PORT, $PORT, $NODE_PORT otherwise 3000
  hostname: "0.0.0.0", // defaults to "0.0.0.0"
  fetch: app.fetch.bind(app),
});

console.log("server is running");