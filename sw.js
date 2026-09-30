/*
 * Background worker for the register upload form.
 * 1. Saves a copy of the form on the phone so it opens without signal.
 * 2. On Android, sends waiting photos in the background when signal returns,
 *    even if the form is closed.
 * Photos never go anywhere except the Apps Script link in queue.js.
 */
importScripts('queue.js');

const CACHE = 'register-upload-shell-v1';
const SHELL = ['./', './index.html', './queue.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Form files: try the network first (so updates arrive), fall back to the saved copy
// if there's no signal or the network is too slow.
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // photo uploads pass straight through
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const fromNetwork = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 4000));
  try {
    const res = await Promise.race([fromNetwork, timeout]);
    if (res) return res;
  } catch (e) { /* no signal */ }
  const saved = await cache.match(req, { ignoreSearch: true }) ||
                (req.mode === 'navigate' ? await cache.match('./index.html') : null);
  if (saved) return saved;
  return fromNetwork; // nothing saved yet: wait for the network
}

// Android: the phone wakes this up when signal returns.
self.addEventListener('sync', event => {
  if (event.tag !== 'send-queue') return;
  event.waitUntil(RU.sendQueue().then(r => {
    if (r && r.error) throw new Error('Still offline, try again later'); // asks the phone to retry
  }));
});
