// Pünt's service worker. For now it only exists so the app counts as
// installable; push and notificationclick handlers follow with the push work
// (issue #30). It deliberately caches nothing: every request still goes to the
// network, so a deploy is live on the next load as before.
//
// Served from the root on purpose: a worker only controls pages under its own
// path, and this one has to cover the whole app.

self.addEventListener("install", () => {
  // Take over straight away instead of waiting for every open tab to close,
  // so a new version of this file is active on the next load.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
