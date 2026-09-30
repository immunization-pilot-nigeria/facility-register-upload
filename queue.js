/*
 * Shared offline queue for the register upload form.
 * Loaded by index.html (the page) and sw.js (the background worker), so both
 * send photos the same way.
 *
 * Photos waiting to send are kept in this phone's browser storage (IndexedDB)
 * and deleted as soon as they are sent, or after seven days if they never send.
 */
var RU = (function () {
  // Your Apps Script web app link. If you ever create a NEW deployment, update this.
  const API_URL = 'https://script.google.com/macros/s/AKfycbz-BAfsMYBOLqtTfm-Lk8L_n7Rzfms7CE7Q7Zy0x2FEozYuyCelADAMhFeZyxWYNlQHxA/exec';

  const MAX_AGE_DAYS = 7;
  const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const DB_NAME = 'register-upload';
  const STORE = 'queue';

  // ---------- Storage on the phone ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'uploadId' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function qAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).getAll();
      r.onsuccess = () => { db.close(); resolve(r.result || []); };
      r.onerror = () => { db.close(); reject(r.error); };
    });
  }

  async function qPut(items) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      items.forEach(i => t.objectStore(STORE).put(i));
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  }

  async function qDel(uploadId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(uploadId);
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  }

  /** Deletes photos that have waited longer than seven days. Returns how many. */
  async function purgeOld() {
    const now = Date.now();
    let n = 0;
    for (const item of await qAll()) {
      if (now - item.queuedAt > MAX_AGE_MS) { await qDel(item.uploadId); n++; }
    }
    return n;
  }

  // ---------- Talking to Apps Script ----------
  /** Throws err.server = true when Apps Script answered but refused (e.g. unknown facility). */
  async function api(body) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      credentials: 'omit',
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Network error (' + res.status + ')');
    const out = await res.json();
    if (!out.ok) { const e = new Error(out.error || 'Server error'); e.server = true; throw e; }
    return out.data;
  }

  /**
   * Sends waiting photos, oldest first. Stops at the first network failure
   * (probably no signal) and leaves the rest for later.
   * Returns { sent, remaining, rejected, expired, error } or null if another
   * tab or the background worker is already sending.
   */
  async function sendQueueInner(onProgress) {
    const expired = await purgeOld();
    const items = (await qAll()).sort((a, b) => a.queuedAt - b.queuedAt);
    let sent = 0, rejected = 0;
    for (const it of items) {
      try {
        await api({
          action: 'uploadPhoto',
          meta: { facilityId: it.facilityId, uploadId: it.uploadId, queuedAt: it.queuedAt },
          dataUrl: it.dataUrl,
          index: it.seq
        });
        await qDel(it.uploadId);   // sent: remove from phone
        sent++;
        if (onProgress) onProgress(sent, items.length);
      } catch (e) {
        if (e.server) {            // refused by Apps Script: keep, flag, move on
          it.error = e.message;
          it.attempts = (it.attempts || 0) + 1;
          await qPut([it]);
          rejected++;
          continue;
        }
        return { sent, remaining: items.length - sent, rejected, expired, error: e.message };
      }
    }
    return { sent, remaining: items.length - sent, rejected, expired, error: null };
  }

  let busy = false;
  function sendQueue(onProgress) {
    const nav = self.navigator;
    if (nav && nav.locks && nav.locks.request) {
      // One sender at a time across tabs and the background worker, so nothing uploads twice.
      return nav.locks.request('ru-send-queue', { ifAvailable: true },
        lock => (lock ? sendQueueInner(onProgress) : null));
    }
    if (busy) return Promise.resolve(null);
    busy = true;
    return sendQueueInner(onProgress).finally(() => { busy = false; });
  }

  return { API_URL, MAX_AGE_DAYS, api, qAll, qPut, qDel, purgeOld, sendQueue };
})();
