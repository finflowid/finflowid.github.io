/* FinFlow service worker — membuat aplikasi bisa dibuka tanpa internet.
   Setiap kali index.html diperbarui, naikkan angka VERSION supaya HP pengguna mengambil versi baru. */
const VERSION = '6.2.1';
const CACHE = 'finflow-app-' + VERSION;
const LIB_CACHE = 'finflowlib-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.indexOf('finflow-app-') === 0 && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); }); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // sinkron Google Sheets selalu lewat jaringan
  if (/(^|\.)script\.google\.com$|googleusercontent\.com$/.test(url.hostname)) return;

  // library PDF/Excel & font: simpan setelah pertama kali diunduh
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(LIB_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // halaman utama: ambil versi terbaru bila online (maks 4 detik), kalau tidak pakai salinan offline
  if (req.mode === 'navigate') {
    e.respondWith(withTimeout(fetch(req), 4000)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); } return res; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
