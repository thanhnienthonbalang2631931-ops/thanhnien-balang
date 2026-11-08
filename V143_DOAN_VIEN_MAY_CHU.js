/* V143 – Trang "Đoàn viên & thanh niên" dùng hồ sơ trên MÁY CHỦ (Google Sheets/Apps Script hoặc Node/PostgreSQL).
 * - Chỉ hoạt động khi CAU_HINH.js đặt BALANG_GAS_URL (hoặc BALANG_USE_API=true). Không cấu hình = giữ nguyên chế độ thử cục bộ cũ.
 * - Hồ sơ đoàn viên KHÔNG còn được ghi vào localStorage; chỉ nằm trong bộ nhớ khi Bí thư đã đăng nhập và bị xóa khi đăng xuất.
 * - Hồ sơ cũ còn trong trình duyệt được GIỮ NGUYÊN cho tới khi Bí thư tải bản sao lưu, đưa lên máy chủ và tự bấm xóa.
 * - Quyền thật do máy chủ kiểm tra; ở đây chỉ là giao diện. */
(function () {
  'use strict';
  const serverMode = () => !!window.BALANG_GAS_URL || window.BALANG_USE_API === true;
  if (!serverMode()) return;
  const $ = s => document.querySelector(s);
  const A = () => window.BALANG_AUTH;
  const STATUS = ['Đang sinh hoạt', 'Học tập/làm việc xa', 'Chuyển sinh hoạt', 'Trưởng thành Đoàn', 'Không còn sinh hoạt', 'Chờ bổ sung'];
  const JOINED = ['Đã kết nạp Đoàn', 'Chưa kết nạp Đoàn', 'Đang xác minh'];
  const LABELS = ['Mã hồ sơ', 'Họ tên', 'Ngày sinh', 'Giới tính', 'Họ tên bố/mẹ', 'Nhóm dân cư', 'Tình trạng kết nạp', 'Tình trạng sinh hoạt', 'Ngày vào Đoàn', 'Điện thoại', 'Facebook', 'Ghi chú', 'Thông tin bổ sung'];
  const KEYS = ['id', 'name', 'birth', 'gender', 'parents', 'group', 'joined', 'status', 'joinDate', 'phone', 'facebook', 'notes', 'extra'];
  const S = { legacy: [], archived: [], loading: false, error: '', loaded: false, showArchived: false, backedUp: false, imported: false, busy: false };
  const e_ = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast_ = m => { if (typeof toast === 'function') toast(m); };
  const today = () => new Date().toISOString().slice(0, 10);
  const isSecretary = () => !!(A() && A().authenticated() && A().user.role === 'Bí thư');

  /* ---------- 1. Cách ly hồ sơ cũ trong trình duyệt + không ghi hồ sơ từ máy chủ xuống localStorage ---------- */
  try { S.legacy = Array.isArray(db.members) ? db.members.slice() : []; db.members = []; } catch (x) { /* chưa có db */ }
  const nativeSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'balang_db' && serverMode()) { try { const o = JSON.parse(v); o.members = S.legacy; v = JSON.stringify(o); } catch (x) { /* giữ nguyên */ } }
    return nativeSet.call(this, k, v);
  };

  /* ---------- 2. Gọi máy chủ & ánh xạ dữ liệu ---------- */
  const api = (m, p, b) => A().api(p, { method: m, body: b === undefined ? undefined : JSON.stringify(b) });
  const toLegacy = m => ({ id: m.id, name: m.fullName, birth: m.birthDate || '', gender: m.gender || 'Không cung cấp', parents: m.parents || '', group: m.groupName || '', joined: m.unionStatus || 'Chưa kết nạp Đoàn',
    kind: m.kind || 'Đoàn viên', status: m.activityStatus, joinDate: m.joinDate || '', phone: m.phone || '', facebook: m.facebook || '', notes: m.notes || '', extra: m.extra || '', _version: m.version, _archived: !!m.archived });
  const toServer = f => { const g = f.gender, j = f.joined; return { fullName: f.name, birthDate: f.birth || null, gender: g === 'Không cung cấp' || !g ? null : g, parents: f.parents || null, groupName: f.group || null, unionStatus: j || null,
    kind: j === 'Đã kết nạp Đoàn' ? 'Đoàn viên' : 'Thanh niên', activityStatus: f.status, joinDate: f.joinDate || null, phone: f.phone || null, facebook: f.facebook || null, notes: f.notes || null, extra: f.extra || null }; };
  const rerender = () => { try { if (typeof render === 'function') render(); } catch (x) { console.error(x); } };

  async function loadMembers() {
    const u = A() && A().user; if (!u || u.mustChangePassword) return;   // còn mật khẩu tạm: máy chủ chưa cho dùng, chờ đổi xong
    S.loading = true; S.error = ''; rerender();
    try {
      if (u.role === 'Bí thư') {
        let all = [], off = 0, total = 0;
        do { const r = await api('GET', `/members?limit=200&offset=${off}`); total = r.total; all = all.concat(r.members); off += 200; } while (off < total);
        db.members = all.map(toLegacy); S.loaded = true;
      } else if (u.memberId) {
        const r = await api('GET', '/members/me'); db.members = [toLegacy(r.member)]; try { activeDemoName = r.member.fullName; } catch (x) { }
      } else db.members = [];
    } catch (err) { S.error = err.message; }
    S.loading = false; rerender();
  }
  async function loadArchived() {
    try { const r = await api('GET', '/members?archived=true&limit=200'); S.archived = r.members.map(toLegacy); } catch (err) { S.error = err.message; }
    rerender();
  }
  A().subscribe(user => { if (!user) { db.members = []; S.archived = []; S.loaded = false; S.error = ''; S.showArchived = false; S.backedUp = false; S.imported = false; } else loadMembers(); });

  /* ---------- 3. Giao diện ---------- */
  const pill_ = t => (typeof pill === 'function' ? pill(t) : `<span class="pill">${e_(t)}</span>`);
  function rowHTML(m, archived) {
    const act = archived ? `<button class="actionbtn" data-v143="history" data-id="${e_(m.id)}">Lịch sử</button>` :
      `<button class="actionbtn" data-v143="edit" data-id="${e_(m.id)}">Sửa</button><button class="actionbtn" data-v143="status" data-id="${e_(m.id)}">Trạng thái</button><button class="actionbtn" data-v143="history" data-id="${e_(m.id)}">Lịch sử</button><button class="actionbtn" data-v143="archive" data-id="${e_(m.id)}">Lưu trữ</button>`;
    return `<tr data-search="${e_((m.id + ' ' + m.name + ' ' + m.group + ' ' + m.status + ' ' + m.phone).toLowerCase())}" data-status="${e_(m.status)}" data-joined="${e_(m.joined)}"><td><div class="person"><div class="miniavatar">${e_((m.name || '?').split(' ').slice(-1)[0][0])}</div><div><b>${e_(m.name)}</b><small>${e_(m.id)}</small><div class="muted small">${e_(m.phone || '')}</div></div></div></td><td>${e_(m.birth || '—')}<div class="muted small">${e_(m.gender || '—')}</div></td><td>${e_(m.group || '—')}</td><td>${pill_(m.joined || 'Chưa cập nhật')}</td><td>${pill_(m.status || '')}</td><td><div class="actions">${act}</div></td></tr>`;
  }
  function migrationBanner() {
    if (!S.legacy.length) return '';
    return `<div class="notice" id="v143Migrate" style="margin-bottom:14px"><b>Còn ${S.legacy.length} hồ sơ đoàn viên cũ lưu trong trình duyệt này, chưa có trên máy chủ.</b><div class="muted small" style="margin:6px 0 10px">Làm lần lượt: ① tải bản sao lưu → ② đưa lên máy chủ → ③ xóa bản cũ khỏi trình duyệt (chỉ bấm được sau ① và ②). Hồ sơ cũ KHÔNG bị xóa nếu bạn không bấm ③.</div>
      <button class="btn" data-v143="mig-backup">① Tải bản sao lưu (Excel)</button> <button class="btn primary" data-v143="mig-upload" ${S.busy ? 'disabled' : ''}>② Đưa ${S.legacy.length} hồ sơ lên máy chủ</button> <button class="btn" data-v143="mig-clear" ${S.backedUp && S.imported ? '' : 'disabled'}>③ Xóa bản cũ khỏi trình duyệt</button></div>`;
  }
  const secretaryPage = () => {
    const list = S.showArchived ? S.archived : db.members;
    const body = S.loading && !list.length ? '<tr><td colspan="6" class="empty">Đang tải hồ sơ từ máy chủ…</td></tr>' : S.error ? `<tr><td colspan="6" class="empty">${e_(S.error)} <button class="actionbtn" data-v143="reload">Thử lại</button></td></tr>` : list.map(m => rowHTML(m, S.showArchived)).join('') || '<tr><td colspan="6" class="empty">Chưa có hồ sơ</td></tr>';
    return head('Đoàn viên & thanh niên', 'Dữ liệu lưu trên máy chủ, mọi thay đổi đều có lịch sử. Hồ sơ không bị xóa mà được lưu trữ.', `<div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">${btn('＋ Thêm hồ sơ', "", 'primary').replace('onclick=""', 'data-v143="add"')}${btn('↑ Nhập Excel', '', '').replace('onclick=""', 'data-v143="import"')}</div>`) +
      migrationBanner() +
      `<div class="panel"><div class="toolbar"><div class="search"><input id="memberSearch" placeholder="Tìm tên, mã, nhóm dân cư, số điện thoại..." oninput="filterMembers()"></div>
      <select id="memberStatus" onchange="filterMembers()"><option value="">Mọi tình trạng sinh hoạt</option>${STATUS.map(x => `<option>${e_(x)}</option>`).join('')}</select>
      <select id="memberJoined" onchange="filterMembers()"><option value="">Mọi tình trạng kết nạp</option>${JOINED.map(x => `<option>${e_(x)}</option>`).join('')}</select></div>
      <div class="toolbar" style="padding-top:0"><button class="btn" data-v143="export">↓ Xuất Excel</button><button class="btn" data-v143="missing">Kiểm tra hồ sơ thiếu</button><button class="btn" data-v143="dups">Rà soát trùng</button><button class="btn" data-v143="toggleArch">${S.showArchived ? '← Quay lại danh sách' : 'Xem hồ sơ đã lưu trữ'}</button></div>
      <div class="tablewrap"><table><thead><tr><th>Hồ sơ</th><th>Ngày sinh / giới tính</th><th>Nhóm dân cư</th><th>Kết nạp Đoàn</th><th>Tình trạng sinh hoạt</th><th>Thao tác</th></tr></thead><tbody id="memberRows">${body}</tbody></table></div></div>`;
  };
  const selfPage = () => {
    const m = db.members[0];
    const rows = m ? [['Mã hồ sơ', m.id], ['Họ tên', m.name], ['Ngày sinh', m.birth], ['Giới tính', m.gender], ['Nhóm dân cư', m.group], ['Kết nạp Đoàn', m.joined], ['Tình trạng sinh hoạt', m.status], ['Điện thoại', m.phone]] : [];
    return head('Hồ sơ của tôi', 'Danh sách đoàn viên đầy đủ chỉ dành cho Bí thư. Bạn chỉ xem được hồ sơ của chính mình.', '') +
      `<div class="panel"><div style="padding:18px">${S.loading ? 'Đang tải…' : S.error ? e_(S.error) : m ? rows.map(([k, v]) => `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #eef3ef"><b style="min-width:170px">${e_(k)}</b><span>${e_(v || '—')}</span></div>`).join('') : 'Tài khoản này chưa gắn hồ sơ đoàn viên. Hãy liên hệ Bí thư.'}</div></div>`;
  };
  const baseMembersPage = window.membersPage;
  window.membersPage = function () {
    if (!A() || !A().authenticated()) return typeof baseMembersPage === 'function' ? baseMembersPage() : '';
    return isSecretary() ? secretaryPage() : selfPage();
  };
  window.filterMembers = function () {
    const q = ($('#memberSearch') ? $('#memberSearch').value : '').toLowerCase(), s = $('#memberStatus') ? $('#memberStatus').value : '', j = $('#memberJoined') ? $('#memberJoined').value : '';
    document.querySelectorAll('#memberRows tr[data-search]').forEach(r => { r.style.display = r.dataset.search.includes(q) && (!s || r.dataset.status === s) && (!j || r.dataset.joined === j) ? '' : 'none'; });
  };
  window.removeMember = () => toast_('Hồ sơ đoàn viên không bị xóa. Hãy dùng "Lưu trữ" để giữ lịch sử.');  // chặn đường xóa cứng cũ

  /* ---------- 4. Hộp thoại ---------- */
  function openInfo(title, inner, wide) {
    const root = $('#modalRoot'); if (!root) return;
    root.innerHTML = `<div class="modalback" role="dialog" aria-modal="true"><div class="modal" ${wide ? 'style="max-width:860px"' : ''}><div class="modalhead"><h2>${e_(title)}</h2><button class="close" type="button" aria-label="Đóng" data-v143="close">×</button></div>${inner}</div></div>`;
  }
  const closeInfo = () => { const r = $('#modalRoot'); if (r) r.innerHTML = ''; };
  const errBox = html => { const b = $('#v143Err'); if (b) b.innerHTML = html; };
  const findM = id => db.members.find(x => x.id === id) || S.archived.find(x => x.id === id);

  function openEdit(id, prefill) {
    const m = (id && findM(id)) || prefill || {}; const isNew = !id;
    modal(isNew ? 'Thêm hồ sơ đoàn viên' : 'Sửa hồ sơ đoàn viên',
      field('Họ và tên', 'name', m.name || '', 'text', true) + (isNew ? '<div class="field"><label>Mã hồ sơ</label><input value="Hệ thống tự cấp" disabled></div>' : `<div class="field"><label>Mã hồ sơ</label><input value="${e_(m.id)}" disabled></div>`) +
      field('Ngày sinh', 'birth', m.birth || '', 'date') + selectField('Giới tính', 'gender', ['Nam', 'Nữ', 'Khác', 'Không cung cấp'], m.gender || 'Không cung cấp') +
      field('Họ tên bố/mẹ', 'parents', m.parents || '', 'text', false, true) + field('Nhóm dân cư', 'group', m.group || '', 'text', false, true) +
      selectField('Tình trạng kết nạp Đoàn', 'joined', JOINED, m.joined || 'Chưa kết nạp Đoàn') + selectField('Tình trạng sinh hoạt', 'status', STATUS, m.status || 'Đang sinh hoạt') +
      field('Ngày vào Đoàn', 'joinDate', m.joinDate || '', 'date') + field('Số điện thoại', 'phone', m.phone || '', 'tel') + field('Link Facebook', 'facebook', m.facebook || '', 'url') +
      field('Ghi chú', 'notes', m.notes || '', 'textarea', false, true) + field('Thông tin bổ sung', 'extra', m.extra || '', 'textarea', false, true) + '<div id="v143Err" style="grid-column:1/-1;color:#a12828;font-size:13px"></div>',
      async f => {
        if (S.busy) return; const o = {}; for (const k of ['name', 'birth', 'gender', 'parents', 'group', 'joined', 'status', 'joinDate', 'phone', 'facebook', 'notes', 'extra']) o[k] = String(f.get(k) || '').trim();
        const body = toServer(o), btnEl = document.querySelector('#modalForm button[type=submit]'); S.busy = true; if (btnEl) btnEl.disabled = true; errBox('');
        try {
          if (isNew) await api('POST', '/members', body); else await api('PATCH', `/members/${encodeURIComponent(id)}`, { ...body, expectedVersion: m._version });
          closeInfo(); toast_('Đã lưu hồ sơ'); await loadMembers();
        } catch (err) {
          const b = err.body || {};
          if (b.code === 'DUPLICATE_CANDIDATE') errBox(`<b>Có hồ sơ có thể trùng:</b> ${(b.candidates || []).map(c => `${e_(c.fullName)} (${e_(c.id)}${c.birthDate ? ', ' + e_(c.birthDate) : ''})`).join('; ')}.<br><button type="button" class="btn" id="v143Force">Đây là người khác — vẫn tạo</button>`),
            ($('#v143Force') || {}).onclick = async () => { try { await api('POST', '/members', { ...body, confirmNotDuplicate: true }); closeInfo(); toast_('Đã lưu hồ sơ'); await loadMembers(); } catch (e2) { errBox(e_(e2.message)); } };
          else if (b.code === 'VERSION_CONFLICT') errBox(`Hồ sơ vừa được người khác cập nhật. <button type="button" class="btn" id="v143Fresh">Tải bản mới nhất</button>`), ($('#v143Fresh') || {}).onclick = async () => { await loadMembers(); openEdit(id); };
          else errBox(e_(err.message));
          if (btnEl) btnEl.disabled = false;
        } finally { S.busy = false; }
      });
    setTimeout(() => { const i = document.querySelector('#modalForm [name=name]'); if (i) i.focus(); }, 0);
  }
  function openStatus(id) {
    const m = findM(id); if (!m) return;
    modal('Đổi tình trạng sinh hoạt – ' + e_(m.name), selectField('Tình trạng mới', 'status', STATUS, m.status) + field('Có hiệu lực từ ngày', 'date', today(), 'date', true) + field('Nơi chuyển đến/đi (nếu có)', 'destination', '', 'text', false, true) + field('Ghi chú', 'note', '', 'textarea', false, true) + '<div id="v143Err" style="grid-column:1/-1;color:#a12828;font-size:13px"></div>',
      async f => { try { await api('POST', `/members/${encodeURIComponent(id)}/status`, { status: f.get('status'), effectiveDate: f.get('date'), destination: String(f.get('destination') || '').trim() || undefined, note: String(f.get('note') || '').trim() || undefined, expectedVersion: m._version }); closeInfo(); toast_('Đã cập nhật tình trạng'); await loadMembers(); }
        catch (err) { errBox(e_((err.body && err.body.code === 'VERSION_CONFLICT') ? 'Hồ sơ vừa được người khác cập nhật. Hãy đóng hộp thoại và tải lại.' : err.message)); } }, 'Cập nhật');
  }
  function openArchive(id) {
    const m = findM(id); if (!m) return;
    modal('Lưu trữ hồ sơ – ' + e_(m.name), '<div class="field full"><small>Hồ sơ không bị xóa: toàn bộ lịch sử được giữ. Tài khoản đăng nhập của người này (nếu có) sẽ bị khóa và đăng xuất ngay.</small></div>' + field('Lý do lưu trữ', 'reason', '', 'textarea', true, true) + '<div id="v143Err" style="grid-column:1/-1;color:#a12828;font-size:13px"></div>',
      async f => { try { await api('POST', `/members/${encodeURIComponent(id)}/archive`, { reason: String(f.get('reason') || '').trim(), expectedVersion: m._version }); closeInfo(); toast_('Đã lưu trữ hồ sơ'); await loadMembers(); if (S.showArchived) await loadArchived(); }
        catch (err) { errBox(e_(err.message)); } }, 'Lưu trữ hồ sơ');
  }
  async function openHistory(id) {
    const m = findM(id); openInfo('Lịch sử hồ sơ – ' + (m ? m.name : id), '<div style="padding:16px">Đang tải…</div>', true);
    try {
      const r = await api('GET', `/members/${encodeURIComponent(id)}/history`);
      const detail = h => { const c = h.details && h.details.changes; if (c) return Object.keys(c).map(k => `${k}: ${c[k].from == null ? '—' : c[k].from} → ${c[k].to == null ? '—' : c[k].to}`).join('; '); if (h.details && h.details.destination) return 'Nơi chuyển: ' + h.details.destination; return ''; };
      openInfo('Lịch sử hồ sơ – ' + (m ? m.name : id), `<div class="tablewrap" style="padding:0 16px 16px"><table><thead><tr><th>Ngày</th><th>Sự kiện</th><th>Nội dung</th><th>Người thực hiện</th></tr></thead><tbody>${r.history.map(h => `<tr><td>${e_(h.date)}</td><td>${e_(h.type)}</td><td>${e_(h.description)}${detail(h) ? `<div class="muted small">${e_(detail(h))}</div>` : ''}</td><td>${e_(h.by || '—')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có lịch sử</td></tr>'}</tbody></table></div><div class="modalfoot"><button class="btn primary" data-v143="close">Đóng</button></div>`, true);
    } catch (err) { openInfo('Lịch sử hồ sơ', `<div style="padding:16px">${e_(err.message)}</div><div class="modalfoot"><button class="btn" data-v143="close">Đóng</button></div>`); }
  }

  /* ---------- 5. Kiểm tra dữ liệu: thiếu thông tin, trùng ---------- */
  function openMissing() {
    const need = [['birth', 'Ngày sinh'], ['phone', 'Số điện thoại'], ['group', 'Nhóm dân cư'], ['gender', 'Giới tính', v => !v || v === 'Không cung cấp']];
    const rows = db.members.map(m => ({ m, miss: need.filter(([k, , f]) => (f ? f(m[k]) : !m[k])).map(x => x[1]).concat(m.joined === 'Đã kết nạp Đoàn' && !m.joinDate ? ['Ngày vào Đoàn'] : []) })).filter(x => x.miss.length);
    openInfo(`Hồ sơ thiếu thông tin (${rows.length}/${db.members.length})`, `<div class="tablewrap" style="padding:0 16px 16px"><table><thead><tr><th>Hồ sơ</th><th>Còn thiếu</th><th></th></tr></thead><tbody>${rows.map(({ m, miss }) => `<tr><td><b>${e_(m.name)}</b><small> ${e_(m.id)}</small></td><td>${e_(miss.join(', '))}</td><td><button class="actionbtn" data-v143="edit" data-id="${e_(m.id)}">Bổ sung</button></td></tr>`).join('') || '<tr><td colspan="3" class="empty">Tất cả hồ sơ đã đủ thông tin cơ bản.</td></tr>'}</tbody></table></div><div class="modalfoot"><button class="btn primary" data-v143="close">Đóng</button></div>`, true);
  }
  const nameKey = s => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  function openDups() {
    const groups = [], used = new Set();
    db.members.forEach((a, i) => { if (used.has(a.id)) return; const g = [a]; db.members.slice(i + 1).forEach(b => { if (!used.has(b.id) && ((nameKey(a.name) === nameKey(b.name) && (!a.birth || !b.birth || a.birth === b.birth)) || (a.phone && a.phone === b.phone))) { g.push(b); used.add(b.id); } }); if (g.length > 1) { used.add(a.id); groups.push(g); } });
    openInfo(`Rà soát trùng (${groups.length} nhóm nghi trùng)`, `<div style="padding:0 16px 16px">${groups.map(g => `<div class="panel" style="margin-bottom:10px;padding:10px">${g.map(m => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0"><span><b>${e_(m.name)}</b> <small>${e_(m.id)} · ${e_(m.birth || 'chưa có ngày sinh')} · ${e_(m.phone || 'chưa có SĐT')}</small></span><button class="actionbtn" data-v143="edit" data-id="${e_(m.id)}">Mở</button></div>`).join('')}</div>`).join('') || '<div class="empty">Không phát hiện hồ sơ nghi trùng.</div>'}</div><div class="modalfoot"><button class="btn primary" data-v143="close">Đóng</button></div>`, true);
  }

  /* ---------- 6. Xuất/nhập Excel ---------- */
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  const rowsOf = list => [LABELS, ...list.map(m => KEYS.map(k => (k === 'gender' && m[k] === 'Không cung cấp') ? '' : (m[k] == null ? '' : m[k])))];
  function exportXlsx(list, filename) { download(window.BALANG_XLSX.write(rowsOf(list), 'Đoàn viên'), filename || `danh-sach-doan-vien-${today()}.xlsx`); }
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const HDR = { id: ['ma ho so', 'ma', 'id', 'ma doan vien'], name: ['ho ten', 'ho va ten', 'ten', 'ho ten doan vien'], birth: ['ngay sinh', 'sinh nhat', 'nam sinh'], gender: ['gioi tinh'], parents: ['ho ten bo me', 'bo me', 'ho ten cha me'],
    group: ['nhom dan cu', 'doi dan cu', 'nhom', 'to dan cu'], joined: ['tinh trang ket nap', 'ket nap', 'tinh trang ket nap doan'], status: ['tinh trang sinh hoat', 'trang thai', 'trang thai sinh hoat'], joinDate: ['ngay vao doan', 'ngay ket nap'],
    phone: ['dien thoai', 'so dien thoai', 'sdt', 'so dt'], facebook: ['facebook', 'link facebook'], notes: ['ghi chu'], extra: ['thong tin bo sung', 'bo sung'] };
  const cellStr = v => { if (v && typeof v === 'object' && 'num' in v) { const n = Number(v.num); return Number.isFinite(n) && /e/i.test(v.num) ? n.toFixed(0) : String(v.num); } return String(v == null ? '' : v).trim(); };
  function isoDate(y, m, d) { y = +y; m = +m; d = +d; const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; }
  function parseDate(v) {
    if (v && typeof v === 'object' && 'num' in v) { const n = parseFloat(v.num); return n >= 20000 && n < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10) : null; }
    const s = cellStr(v); if (!s) return ''; let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return isoDate(m[1], m[2], m[3]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s))) return isoDate(m[3], m[2], m[1]);   // ngày/tháng/năm theo kiểu Việt Nam
    return null;
  }
  function mapRows(table) {
    const head = (table[0] || []).map(norm), col = {}; for (const k of Object.keys(HDR)) { const i = head.findIndex(h => HDR[k].includes(h)); if (i >= 0) col[k] = i; }
    const warnings = [], members = []; let skipped = 0;
    if (col.name == null) return { error: 'Không tìm thấy cột "Họ tên" ở dòng đầu. Hãy dùng đúng tiêu đề cột như bản mẫu (Xuất Excel để lấy mẫu).', members, warnings, skipped };
    table.slice(1).forEach((r, i) => {
      if (!r || !r.some(c => cellStr(c))) return; const line = i + 2, g = k => (col[k] == null ? '' : r[col[k]]), name = cellStr(g('name'));
      if (name.length < 2) { skipped++; warnings.push({ line, message: 'Thiếu họ tên → bỏ qua dòng.' }); return; }
      const o = { name }; const id = cellStr(g('id')); if (id) o.id = id;
      for (const k of ['birth', 'joinDate']) { const d = parseDate(g(k)); if (d === null) { warnings.push({ line, message: `${k === 'birth' ? 'Ngày sinh' : 'Ngày vào Đoàn'} "${cellStr(g(k))}" không hiểu được (dùng dd/mm/yyyy) → để trống.` }); o[k] = ''; } else o[k] = d; }
      const gn = norm(cellStr(g('gender'))); o.gender = gn === 'nam' ? 'Nam' : gn === 'nu' ? 'Nữ' : gn === 'khac' ? 'Khác' : '';
      const jn = norm(cellStr(g('joined'))); o.joined = !jn ? 'Chưa kết nạp Đoàn' : /chua/.test(jn) ? 'Chưa kết nạp Đoàn' : /xac minh/.test(jn) ? 'Đang xác minh' : /da|ket nap/.test(jn) ? 'Đã kết nạp Đoàn' : 'Chưa kết nạp Đoàn'; o.kind = o.joined === 'Đã kết nạp Đoàn' ? 'Đoàn viên' : 'Thanh niên';
      const sv = cellStr(g('status')), st = STATUS.find(x => norm(x) === norm(sv)); if (sv && !st) warnings.push({ line, message: `Tình trạng sinh hoạt "${sv}" không có trong danh mục → dùng "Đang sinh hoạt".` }); o.status = st || 'Đang sinh hoạt';
      let ph = cellStr(g('phone')); if (ph && /^\d{9}$/.test(ph) && g('phone') && typeof g('phone') === 'object') { warnings.push({ line, message: 'Số điện thoại bị Excel đổi thành số, đã bổ sung số 0 đầu. Lần sau hãy định dạng cột là Văn bản.' }); ph = '0' + ph; } o.phone = ph;
      for (const k of ['parents', 'group', 'facebook', 'notes', 'extra']) o[k] = cellStr(g(k));
      members.push(o);
    });
    return { members, warnings, skipped };
  }
  function parseCSV(text) {
    text = text.replace(/^\ufeff/, ''); const first = text.split(/\r?\n/, 1)[0] || '', delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',', rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === delim) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); } return rows;
  }
  async function importChunks(members) {
    const total = { created: 0, skippedExisting: 0, rejected: [], warnings: [], historyAdded: 0 };
    for (let i = 0; i < members.length; i += 200) {
      const r = await api('POST', '/members/import', { members: members.slice(i, i + 200), ...(i === 0 && S._history ? { memberHistory: S._history } : {}) });
      const rep = r.report; total.created += rep.created; total.skippedExisting += rep.skippedExisting; total.historyAdded += rep.historyAdded; total.rejected.push(...rep.rejected); total.warnings.push(...rep.warnings);
    }
    return total;
  }
  const reportHTML = (t, pre) => `<div style="padding:16px"><p><b>Đã tạo mới: ${t.created}</b> · đã có sẵn (bỏ qua): ${t.skippedExisting} · bị từ chối: ${t.rejected.length}${t.historyAdded ? ` · lịch sử nhập: ${t.historyAdded}` : ''}</p>${(pre || []).length ? `<p class="muted small">Cảnh báo khi đọc tệp (${pre.length}):</p><ul class="small">${pre.slice(0, 30).map(w => `<li>Dòng ${w.line}: ${e_(w.message)}</li>`).join('')}${pre.length > 30 ? `<li>… và ${pre.length - 30} cảnh báo khác</li>` : ''}</ul>` : ''}${t.warnings.length ? `<p class="muted small">Cảnh báo từ máy chủ (${t.warnings.length}):</p><ul class="small">${t.warnings.slice(0, 30).map(w => `<li>${e_(w.id)}: ${e_(w.message)}</li>`).join('')}</ul>` : ''}${t.rejected.length ? `<ul class="small">${t.rejected.map(w => `<li>${e_(w.id)}: ${e_(w.reason)}</li>`).join('')}</ul>` : ''}</div><div class="modalfoot"><button class="btn primary" data-v143="close">Xong</button></div>`;
  function openImport() {
    openInfo('Nhập hồ sơ từ Excel', `<div style="padding:16px"><p>Chọn tệp <b>.xlsx</b> (hoặc .csv UTF-8). Dòng đầu là tiêu đề cột; cần có cột <b>Họ tên</b>. Cột <b>Mã hồ sơ</b> có thể để trống (hệ thống tự cấp). Ngày nhập dạng <b>dd/mm/yyyy</b>.</p><p class="small muted">Chưa có mẫu? Bấm <button type="button" class="actionbtn" data-v143="template">Tải tệp mẫu</button>. Hồ sơ đã có mã trùng sẽ được bỏ qua, nên nhập lại cùng một tệp không gây nhân đôi.</p><input type="file" id="v143File" accept=".xlsx,.csv,.txt"><div id="v143Preview" style="margin-top:12px"></div></div>`);
    const inp = $('#v143File'); if (inp) inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; const box = $('#v143Preview'); box.textContent = 'Đang đọc tệp…';
      try {
        if (f.size > 8 * 1024 * 1024) throw new Error('Tệp quá lớn (tối đa 8 MB).');
        const table = /\.xlsx$/i.test(f.name) ? await window.BALANG_XLSX.read(await f.arrayBuffer()) : parseCSV(await f.text()), res = mapRows(table);
        if (res.error) { box.innerHTML = `<div class="notice">${e_(res.error)}</div>`; return; }
        S._pending = res.members;
        box.innerHTML = `<div class="notice"><b>Đọc được ${res.members.length} hồ sơ</b>${res.skipped ? `, bỏ qua ${res.skipped} dòng thiếu họ tên` : ''}${res.warnings.length ? `, ${res.warnings.length} cảnh báo` : ''}.</div>
          <div class="tablewrap"><table><thead><tr><th>Họ tên</th><th>Ngày sinh</th><th>Nhóm</th><th>SĐT</th><th>Sinh hoạt</th></tr></thead><tbody>${res.members.slice(0, 5).map(m => `<tr><td>${e_(m.name)}</td><td>${e_(m.birth || '—')}</td><td>${e_(m.group || '—')}</td><td>${e_(m.phone || '—')}</td><td>${e_(m.status)}</td></tr>`).join('')}</tbody></table></div>
          ${res.warnings.length ? `<ul class="small">${res.warnings.slice(0, 8).map(w => `<li>Dòng ${w.line}: ${e_(w.message)}</li>`).join('')}${res.warnings.length > 8 ? `<li>… và ${res.warnings.length - 8} cảnh báo khác (xem đầy đủ sau khi nhập)</li>` : ''}</ul>` : ''}
          <div class="modalfoot" style="padding:0"><button class="btn primary" id="v143Go" ${res.members.length ? '' : 'disabled'}>Nhập ${res.members.length} hồ sơ</button></div>`;
        const go = $('#v143Go'); if (go) go.onclick = async () => { go.disabled = true; go.textContent = 'Đang nhập…'; try { S._history = null; const t = await importChunks(S._pending); await loadMembers(); openInfo('Kết quả nhập hồ sơ', reportHTML(t, res.warnings)); } catch (err) { box.innerHTML = `<div class="notice">${e_(err.message)}</div>`; } };
      } catch (err) { box.innerHTML = `<div class="notice">${e_(err.message)}</div>`; }
    };
  }

  /* ---------- 7. Chuyển hồ sơ cũ từ trình duyệt lên máy chủ ---------- */
  async function migrationUpload() {
    if (S.busy || !S.legacy.length) return; S.busy = true; rerender();
    try {
      S._history = Array.isArray(db.memberHistory) ? db.memberHistory.filter(h => h && h.memberId).map(h => ({ memberId: h.memberId, type: h.type || 'Sự kiện', date: h.date, description: h.description })) : null;
      const t = await importChunks(S.legacy.map(m => ({ ...m, _version: undefined, _archived: undefined }))); S._history = null;
      S.imported = true; await loadMembers(); openInfo('Kết quả đưa hồ sơ lên máy chủ', reportHTML(t, []) + (S.backedUp ? '' : '<div class="notice" style="margin:0 16px 16px">Nhớ bấm ① Tải bản sao lưu trước khi xóa bản cũ khỏi trình duyệt.</div>'));
    } catch (err) { toast_('Không đưa lên được: ' + err.message); }
    S.busy = false; rerender();
  }

  /* ---------- 8. Điều khiển sự kiện ---------- */
  document.addEventListener('click', async ev => {
    const t = ev.target.closest && ev.target.closest('[data-v143]'); if (!t) return; const k = t.dataset.v143, id = t.dataset.id;
    switch (k) {
      case 'close': closeInfo(); break;
      case 'add': openEdit(''); break;
      case 'edit': closeInfo(); openEdit(id); break;
      case 'status': openStatus(id); break;
      case 'archive': openArchive(id); break;
      case 'history': openHistory(id); break;
      case 'reload': loadMembers(); break;
      case 'import': openImport(); break;
      case 'template': download(window.BALANG_XLSX.write([LABELS, ['', 'Nguyễn Văn A', '15/03/2002', 'Nam', 'Nguyễn Văn B - Trần Thị C', 'Đội 1', 'Đã kết nạp Đoàn', 'Đang sinh hoạt', '26/03/2020', '0905123456', '', '', '']], 'Đoàn viên'), 'mau-nhap-doan-vien.xlsx'); break;
      case 'export': exportXlsx(db.members); break;
      case 'missing': openMissing(); break;
      case 'dups': openDups(); break;
      case 'toggleArch': S.showArchived = !S.showArchived; if (S.showArchived) await loadArchived(); else rerender(); break;
      case 'mig-backup': exportXlsx(S.legacy, `sao-luu-doan-vien-trinh-duyet-${today()}.xlsx`); try { download(new Blob([JSON.stringify(S.legacy, null, 1)], { type: 'application/json' }), `sao-luu-doan-vien-trinh-duyet-${today()}.json`); } catch (x) { } S.backedUp = true; rerender(); toast_('Đã tải bản sao lưu. Hãy cất ở nơi an toàn.'); break;
      case 'mig-upload': migrationUpload(); break;
      case 'mig-clear': if (S.backedUp && S.imported && confirm(`Xóa ${S.legacy.length} hồ sơ cũ khỏi trình duyệt này? Bản trên máy chủ và bản sao lưu bạn đã tải vẫn còn.`)) { S.legacy = []; try { save(); } catch (x) { } rerender(); toast_('Đã xóa hồ sơ cũ khỏi trình duyệt.'); } break;
    }
  });
  window.V143 = { _state: S, toLegacy, toServer, mapRows, parseCSV, parseDate, loadMembers };
})();
