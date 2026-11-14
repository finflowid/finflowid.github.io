/* FinFlow service worker: membuat aplikasi bisa dibuka tanpa internet.
   Setiap kali index.html diperbarui, naikkan angka VERSION supaya HP pengguna mengambil versi baru.
   Kalau isi folder lib/ atau fonts/ diganti tanpa mengganti nama file, naikkan juga angka di LIB_CACHE. */
const VERSION = '6.5.1';
const CACHE = 'finflow-app-' + VERSION;
const LIB_CACHE = 'finflowlib-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './fonts/plex-400.woff2', './fonts/plex-500.woff2', './fonts/plex-600.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => (k.indexOf('finflow-app-') === 0 && k !== CACHE) || (k.indexOf('finflowlib-') === 0 && k !== LIB_CACHE)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function withTimeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); }); }
// cari di semua cache dulu (font sudah ikut tersimpan saat pemasangan), baru ambil dari jaringan
function libFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(LIB_CACHE).then(c => c.put(req, copy)); }
    return res;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // "Bagikan ke FinFlow": simpan teks/gambar yang dibagikan, lalu buka aplikasi
  if (req.method === 'POST' && url.origin === self.location.origin && url.searchParams.get('aksi') === 'bagikan') {
    e.respondWith((async () => {
      try {
        const fd = await req.formData(); const c = await caches.open('finflow-share');
        const meta = { title: String(fd.get('title') || ''), text: String(fd.get('text') || ''), url: String(fd.get('url') || ''), at: Date.now() };
        await c.put('./__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
        const f = fd.get('media');
        if (f && typeof f !== 'string' && f.size) await c.put('./__share/file', new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
        else await c.delete('./__share/file');
      } catch (err) { /* tetap buka aplikasi */ }
      return Response.redirect('./?aksi=bagikan', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // sinkron Google Sheets dan lisensi selalu lewat jaringan
  if (/(^|\.)script\.google\.com$|googleusercontent\.com$/.test(url.hostname)) return;

  // library PDF, Excel, pembaca struk, dan font: simpan setelah pertama kali dipakai (nama file sudah memuat versi)
  if (url.origin === self.location.origin && (url.pathname.indexOf('/lib/') >= 0 || url.pathname.indexOf('/fonts/') >= 0)) { e.respondWith(libFirst(req)); return; }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(libFirst(req)); return; }
  if (url.origin !== self.location.origin) return;

  // halaman utama: ambil versi terbaru bila online (maks 4 detik), kalau tidak pakai salinan offline.
  // no-cache: selalu tanya ke server dulu, supaya tidak tertahan salinan lama di cache browser
  if (req.mode === 'navigate') {
    e.respondWith(withTimeout(fetch(req, { cache: 'no-cache' }), 4000)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); } return res; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
