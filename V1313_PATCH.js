/* =====================================================================
   V131.3 – Ổn định dữ liệu, giao diện điện thoại, sao lưu an toàn, PWA
   Nạp SAU V131_PATCH.js. Không xóa/đổi cấu trúc dữ liệu localStorage.
   Các thay đổi đều idempotent (chạy lại nhiều lần không gây hại).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__V1313__) return;
  window.__V1313__ = true;

  var QUOTA = 5000000;           // ước lượng giới hạn localStorage (ký tự)
  var WARN_RATIO = 0.8;          // cảnh báo khi dùng ≥ 80%
  var BACKUP_EVERY_DAYS = 7;     // nhắc sao lưu sau 7 ngày
  var FAIL_WINDOW = 2500;        // ms sau khi lưu thất bại: chặn thông báo "Đã lưu" giả

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function role() { try { return currentRole; } catch (e) { return ''; } }
  function curPage() { try { return page; } catch (e) { return ''; } }
  function recentlyFailed() { return Date.now() - (window.__v1313FailAt || 0) < FAIL_WINDOW; }

  /* ---------- 1. Chặn "Đã lưu" giả khi lưu thất bại ---------- */
  var rawToast = window.toast;
  window.toast = function (m) {
    if (recentlyFailed() && /^\s*(Đã|Lưu|Hoàn tất)/i.test(String(m == null ? '' : m))) return;
    return typeof rawToast === 'function' ? rawToast.apply(this, arguments) : undefined;
  };
  var rawClose = window.closeModal;
  window.closeModal = function () {
    // Giữ cửa sổ nhập liệu mở để người dùng không mất nội dung vừa gõ khi lưu thất bại.
    if (recentlyFailed()) return;
    return typeof rawClose === 'function' ? rawClose.apply(this, arguments) : undefined;
  };

  /* ---------- 2. Dung lượng, sao lưu, phục hồi ---------- */
  function storageUsed() {
    var n = 0;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { }
    return n;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()); }
  function download(name, text) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { } }, 1500);
  }
  function daysSinceBackup() {
    try {
      var t = localStorage.getItem('balang_last_backup');
      if (!t) return Infinity;
      return (Date.now() - new Date(t).getTime()) / 86400000;
    } catch (e) { return Infinity; }
  }

  window.backupJson = function () {
    download('sao-luu-chi-doan-' + stamp() + '.json', JSON.stringify(db, null, 2));
    try { localStorage.setItem('balang_last_backup', new Date().toISOString()); } catch (e) { }
    try { logAction('Xuất sao lưu JSON', 'Toàn bộ dữ liệu'); } catch (e) { }
    toast('Đã tải bản sao lưu về máy');
    decorate();
  };

  /* Bù các khóa còn thiếu theo khuôn của dữ liệu đang chạy (mảng→[], đối tượng→khung rỗng cùng cấu trúc). */
  function emptyLike(t) {
    if (Array.isArray(t)) return [];
    if (t && typeof t === 'object') { var o = {}; Object.keys(t).forEach(function (k) { o[k] = emptyLike(t[k]); }); return o; }
    if (typeof t === 'string') return '';
    if (typeof t === 'number') return 0;
    if (typeof t === 'boolean') return false;
    return null;
  }
  function fillMissing(target, template) {
    Object.keys(template || {}).forEach(function (k) {
      var t = template[k], v = target[k];
      if (v === undefined || v === null) target[k] = emptyLike(t);
      else if (Array.isArray(t) && !Array.isArray(v)) target[k] = [];
      else if (t && typeof t === 'object' && !Array.isArray(t) && (typeof v !== 'object' || Array.isArray(v))) target[k] = emptyLike(t);
    });
  }

  window.restoreJson = function (file) {
    if (!file) return;
    var input = $('#restoreJson');
    var r = new FileReader();
    r.onload = function () {
      try {
        var x = JSON.parse(r.result);
        if (!x || typeof x !== 'object' || !Array.isArray(x.members) || !Array.isArray(x.activities))
          throw Error('Tệp này không phải bản sao lưu của hệ thống (thiếu danh sách đoàn viên hoặc hoạt động).');
        var msg = 'Phục hồi sẽ THAY THẾ toàn bộ dữ liệu hiện tại bằng bản sao lưu:\n' +
          '• ' + x.members.length + ' hồ sơ đoàn viên\n• ' + x.activities.length + ' hoạt động\n\n' +
          'Hệ thống sẽ tự tải về một bản sao lưu dữ liệu HIỆN TẠI trước khi thay thế, phòng khi bạn chọn nhầm tệp.\n\nTiếp tục?';
        if (!confirm(msg)) return;
        try { download('sao-luu-truoc-khi-phuc-hoi-' + stamp() + '.json', JSON.stringify(db, null, 2)); } catch (e) { }
        var previous = db;
        // Gộp với cấu trúc mặc định, rồi bù mọi khóa mà ứng dụng ĐANG dùng (kể cả khóa do các module V130/V131…
        // tự tạo lúc nạp trang) để bản sao lưu từ phiên bản cũ không làm thiếu trường và hỏng trang.
        db = Object.assign(JSON.parse(JSON.stringify(initial)), x);
        fillMissing(db, previous);
        if (save() === false) { db = previous; return; }
        try { logAction('Phục hồi dữ liệu', x.members.length + ' đoàn viên, ' + x.activities.length + ' hoạt động'); } catch (e) { }
        render();
        toast('Đã phục hồi dữ liệu');
      } catch (e) {
        alert('Không thể phục hồi tệp: ' + e.message);
      } finally { if (input) input.value = ''; }
    };
    r.readAsText(file);
  };

  /* ---------- 3. Thanh cảnh báo (dung lượng / nhắc sao lưu) và bảng dung lượng ---------- */
  function bannerState() {
    var ratio = storageUsed() / QUOTA, items = [];
    if (ratio >= WARN_RATIO) {
      items.push({ cls: 'red', html: '⚠ Bộ nhớ trình duyệt đã dùng <b>' + Math.round(ratio * 100) + '%</b>. Sắp không lưu được dữ liệu mới. Hãy sao lưu và giảm ảnh/tệp đính kèm lớn. <button type="button" class="btn" onclick="showPage(\'backup\')">Mở Sao lưu</button>' });
    }
    var manager = ['Bí thư', 'Phó Bí thư'].indexOf(role()) >= 0;
    var hasData = false; try { hasData = db.members.length > 0; } catch (e) { }
    if (manager && hasData && curPage() === 'dashboard') {
      var d = daysSinceBackup();
      if (d >= BACKUP_EVERY_DAYS) {
        items.push({ cls: '', html: '💾 ' + (d === Infinity ? 'Chưa có bản sao lưu nào.' : 'Đã <b>' + Math.floor(d) + ' ngày</b> chưa sao lưu dữ liệu.') + ' Dữ liệu chỉ nằm trong trình duyệt này. <button type="button" class="btn primary" onclick="backupJson()">Sao lưu ngay</button>' });
      }
    }
    return items;
  }
  function renderBanner() {
    var c = $('#content'); if (!c) return;
    var items = bannerState();
    var key = items.map(function (i) { return i.html; }).join('|');
    var old = $('#v1313Banner', c);
    if (!items.length) { if (old) old.remove(); return; }
    if (old && old.getAttribute('data-key') === key) return;
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'v1313Banner'; box.setAttribute('data-key', key);
    box.innerHTML = items.map(function (i) { return '<div class="notice v1313-notice ' + i.cls + '">' + i.html + '</div>'; }).join('');
    c.insertBefore(box, c.firstChild);
  }
  function renderMeter() {
    var c = $('#content'); if (!c || curPage() !== 'backup' || !$('#restoreJson', c)) return;
    var used = storageUsed(), ratio = Math.min(1, used / QUOTA);
    var last = localStorage.getItem('balang_last_backup');
    var lastTxt = last ? (typeof window.BalangFormatDateTime==='function'?window.BalangFormatDateTime(last):new Date(last).toLocaleString('vi-VN')) : 'chưa có';
    var cls = ratio >= 0.9 ? 'bad' : ratio >= WARN_RATIO ? 'warn' : '';
    var html = '<div class="panel" id="v1313Meter" style="margin-top:16px"><div class="panelhead"><h2>Dung lượng bộ nhớ trình duyệt</h2></div>' +
      '<div class="v1313-bar ' + cls + '"><i style="width:' + Math.max(1, Math.round(ratio * 100)) + '%"></i></div>' +
      '<p class="muted small" style="margin:8px 0 0">Đã dùng khoảng <b>' + (used / 1e6).toFixed(2).replace('.', ',') + ' MB</b> trên ~5 MB (' + Math.round(ratio * 100) + '%). ' +
      'Ảnh và video đính kèm chiếm nhiều dung lượng nhất. Lần sao lưu gần nhất: <b>' + esc(lastTxt) + '</b>.</p></div>' +
      '<div class="panel" id="v1313Install" style="margin-top:16px"><div class="panelhead"><h2>Cài như ứng dụng trên điện thoại</h2></div>' +
      '<p class="muted small" style="margin:0 0 6px">Khi trang được đưa lên địa chỉ https (xem HUONG_DAN_V131_3.md):</p>' +
      '<p class="small" style="margin:2px 0"><b>Android (Chrome/Edge):</b> menu ⋮ → <i>Cài đặt ứng dụng</i> / <i>Thêm vào màn hình chính</i>.</p>' +
      '<p class="small" style="margin:2px 0"><b>iPhone (Safari):</b> nút Chia sẻ → <i>Thêm vào Màn hình chính</i>.</p>' +
      '<p class="muted small" style="margin:6px 0 0">Lưu ý: dữ liệu vẫn nằm riêng trên từng thiết bị cho đến khi có máy chủ trung tâm.</p></div>';
    var old = $('#v1313Meter'); var oldI = $('#v1313Install');
    var key = used + '|' + last;
    if (old && old.getAttribute('data-key') === key) return;
    if (old) old.remove(); if (oldI) oldI.remove();
    var wrap = document.createElement('div'); wrap.innerHTML = html;
    wrap.firstChild.setAttribute('data-key', key);
    while (wrap.firstChild) c.appendChild(wrap.firstChild);
  }

  /* ---------- 4. Bảng → thẻ trên điện thoại ---------- */
  function cardify(root) {
    $$('table', root).forEach(function (t) {
      if (t.getAttribute('data-rt') === 'off' || t.classList.contains('evaluation-aligned-table') || t.closest('.evaluation-review-modal')) return;
      var headRows = $$('thead tr', t), ths = $$('thead th', t);
      if (headRows.length !== 1 || ths.length < 3) return;
      if (ths.some(function (th) { return th.colSpan > 1 || th.rowSpan > 1; })) return;
      var labels = ths.map(function (th) { return th.textContent.replace(/\s+/g, ' ').trim(); });
      var ok = true, rows = $$('tbody tr', t);
      rows.forEach(function (tr) {
        var cells = Array.prototype.slice.call(tr.children).filter(function (c) { return c.tagName === 'TD' || c.tagName === 'TH'; });
        if (cells.length === 1 && cells[0].colSpan > 1) { tr.classList.add('rt-empty'); return; }
        if (cells.some(function (c) { return c.colSpan > 1 || c.rowSpan > 1; }) || cells.length !== labels.length) ok = false;
      });
      if (!ok) { t.classList.remove('rt-cards'); return; }
      rows.forEach(function (tr) {
        if (tr.classList.contains('rt-empty')) return;
        Array.prototype.slice.call(tr.children).forEach(function (c, i) {
          if (c.getAttribute('data-label') !== labels[i]) c.setAttribute('data-label', labels[i] || '');
        });
      });
      t.classList.add('rt-cards');
    });
  }

  /* ---------- 5. Dọn chuỗi 'undefined' trong ô tìm kiếm ---------- */
  function cleanSearchAttrs(root) {
    $$('[data-search]', root).forEach(function (el) {
      var s = el.getAttribute('data-search') || '';
      if (/\b(undefined|null)\b/.test(s)) el.setAttribute('data-search', s.replace(/\b(undefined|null)\b/g, '').replace(/\s+/g, ' ').trim());
    });
  }

  /* ---------- 6. Menu: gom 2 mục lẻ vào nhóm "Thu chi & sổ sách" ---------- */
  function tidyNav() {
    var nav = document.getElementById('nav'); if (!nav) return;
    var loose = Array.prototype.slice.call(nav.children).filter(function (el) {
      return el.tagName === 'BUTTON' && (el.dataset.page === 'finance' || el.dataset.page === 'periodbooks');
    });
    var group = nav.querySelector('.nav-group[data-v1313="fin"]');
    if (!loose.length && !group) return;
    if (!group) {
      group = document.createElement('section');
      group.className = 'nav-group is-collapsed'; group.setAttribute('data-v1313', 'fin');
      var head = document.createElement('button'); head.type = 'button'; head.className = 'nav-group-toggle'; head.setAttribute('aria-expanded', 'false');
      head.innerHTML = '<span class="nav-group-title">Thu chi & sổ sách</span><span class="nav-group-arrow" aria-hidden="true">⌄</span>';
      var list = document.createElement('div'); list.className = 'nav-group-items';
      group.appendChild(head); group.appendChild(list);
      head.addEventListener('click', function () {
        var willOpen = group.classList.contains('is-collapsed');
        $$('.nav-group', nav).forEach(function (g) {
          g.classList.add('is-collapsed');
          var t = $('.nav-group-toggle', g); if (t) t.setAttribute('aria-expanded', 'false');
          var a = $('.nav-group-arrow', g); if (a) a.textContent = '⌄';
        });
        if (willOpen) { group.classList.remove('is-collapsed'); head.setAttribute('aria-expanded', 'true'); $('.nav-group-arrow', head).textContent = '⌃'; }
      });
      var admin = $$('.nav-group', nav).filter(function (g) { return /Quản trị/.test(($('.nav-group-title', g) || {}).textContent || ''); })[0];
      if (admin) nav.insertBefore(group, admin); else nav.appendChild(group);
    }
    var items = $('.nav-group-items', group);
    loose.forEach(function (b) { b.classList.add('nav-item'); items.appendChild(b); });
    var anyVisible = $$('.nav-item', group).some(function (b) { return b.style.display !== 'none' && !b.hidden && getComputedStyle(b).display !== 'none'; });
    group.style.display = anyVisible ? '' : 'none';
    var active = $('.nav-item.active', group);
    if (active && group.classList.contains('is-collapsed')) {
      $$('.nav-group', nav).forEach(function (g) { g.classList.add('is-collapsed'); });
      group.classList.remove('is-collapsed');
      $('.nav-group-toggle', group).setAttribute('aria-expanded', 'true'); $('.nav-group-arrow', group).textContent = '⌃';
    }
  }

  /* ---------- Điều phối: chạy sau mỗi lần nội dung thay đổi ---------- */
  var running = false;
  function decorate() {
    if (running) return; running = true;
    try {
      var c = $('#content'); if (c) { cardify(c); cleanSearchAttrs(c); renderBanner(); renderMeter(); }
      var m = $('#modalRoot'); if (m) { cardify(m); cleanSearchAttrs(m); }
      tidyNav();
    } catch (e) { console.error('V131.3 decorate', e); }
    finally { running = false; }
  }
  function start() {
    decorate();
    var c = $('#content'), m = $('#modalRoot');
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () { decorate(); });
      if (c) mo.observe(c, { childList: true, subtree: true });
      if (m) mo.observe(m, { childList: true, subtree: true });
    }
    document.addEventListener('change', function (e) { if (e.target && e.target.matches && e.target.matches('select')) setTimeout(tidyNav, 120); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  /* ---------- 7. PWA: đăng ký service worker, nút cài đặt, xin lưu trữ bền vững ---------- */
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW', e); }); });
    }
    if (navigator.storage && navigator.storage.persist && /^https?:$/.test(location.protocol)) navigator.storage.persist().catch(function () { });
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      var box = $('.top-actions'); if (!box || $('#v1313InstallBtn')) return;
      var b = document.createElement('button'); b.type = 'button'; b.id = 'v1313InstallBtn'; b.className = 'btn soft'; b.textContent = '⤓ Cài ứng dụng';
      b.onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; b.remove(); }); };
      box.insertBefore(b, box.firstChild);
    });
    window.addEventListener('appinstalled', function () { var b = $('#v1313InstallBtn'); if (b) b.remove(); });
  } catch (e) { console.warn('PWA', e); }
})();
