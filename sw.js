/* Service worker V134 – Giai đoạn 1 – cho phép mở lại ứng dụng khi mất mạng.
   Chỉ lưu tệp giao diện. KHÔNG đụng tới dữ liệu localStorage của người dùng. */
const CACHE = 'balang-v143-doanvien-a';
const ASSETS = ['./', './index.html', './V130_TO_CHUC_DOAN_VIEN.js', './V131_PATCH.js', './V1313_PATCH.js', './V132_PATCH.js', './V134_GIAI_DOAN_1_POLICY.js', './CAU_HINH.js','./V138_AUTH_CONTROLS.js','./V139_QUAN_LY_TAI_KHOAN.js','./V143_XLSX.js','./V143_DOAN_VIEN_MAY_CHU.js', './QR_CONFIG.js', './QR_MODULE_V1.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './logo-doan.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // KHÔNG bao giờ lưu đệm API hay yêu cầu có xác thực: dữ liệu theo người dùng, lưu đệm sẽ trả nhầm cho người khác trên máy dùng chung.
  if (url.pathname.startsWith('/api/') || req.headers.has('Authorization')) return;
  const isCode = req.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) {
    // Mạng trước để luôn nhận bản mới; mất mạng thì dùng bản đã lưu.
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
});
