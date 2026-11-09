/* THANH NIÊN BA LĂNG — QR Attendance module v1.0
 * Production mode uses the authenticated API; localStorage demo data is never treated as official check-in.
 */
(function () {
  'use strict';
  const cfg = window.BALANG_QR_CONFIG || {};
  const API = String(cfg.apiBaseUrl || '').replace(/\/$/, '');
  const TOKEN_KEY = 'balang_qr_access_token';
  const USER_KEY = 'balang_qr_user';
  let activeQrSession = null;
  let rotateTimer = null;
  let scannerStream = null;
  let scannerFrame = 0;
  let scannerActive = false;

  const $ = (s, root = document) => root.querySelector(s);
  const formatDateTime = d => typeof window.BalangFormatDateTime === 'function' ? window.BalangFormatDateTime(d) : new Date(d).toLocaleString('vi-VN');
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getToken = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const getUser = () => { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; } };
  const isLoggedIn = () => !!getToken() && !!getUser();
  const dateTimeLocal = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0,16); };
  const parseQrToken = raw => {
    const value = String(raw || '').trim();
    try {
      const u = new URL(value, location.href);
      const hash = new URLSearchParams(u.hash.replace(/^#/, '').replace(/^\?/, ''));
      const token = hash.get('qr-checkin') || u.searchParams.get('qr-checkin') || u.searchParams.get('token');
      if (token) return token;
    } catch (_) {}
    const m = value.match(/(?:#|[?&])qr-checkin=([^&]+)/) || value.match(/(?:#|[?&])token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : (value.length >= 32 && !/\s/.test(value) ? value : '');
  };
  function stopRotation() { if (rotateTimer) clearInterval(rotateTimer); rotateTimer = null; }
  function stopScanner() {
    scannerActive = false;
    if (scannerFrame) cancelAnimationFrame(scannerFrame);
    scannerFrame = 0;
    if (scannerStream) scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  function notify(message, type = 'info') {
    if (typeof window.toast === 'function') window.toast(message);
    else alert(message);
  }
  async function api(path, options = {}) {
    if (!API) throw new Error('Chưa cấu hình API Backend. Hãy mở QR_CONFIG.js và điền apiBaseUrl.');
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    const response = await fetch(`${API}${path}`, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); }
      throw new Error(data.message || `Yêu cầu thất bại (${response.status}).`);
    }
    return data;
  }
  async function login(email, password) {
    const result = await api('/api/auth/login', { method:'POST', body:{ email, password } });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return result.user;
  }
  function loginPanel(returnToCheckin = false) {
    return `<div class="panel qr-auth-panel"><h2>Đăng nhập hệ thống</h2><p class="muted">Sử dụng tài khoản cá nhân đã được quản trị cấp. Không chọn hồ sơ đoàn viên thủ công.</p>
      <form id="qrLoginForm" class="formgrid"><div class="field full"><label for="qrEmail">Email tài khoản</label><input id="qrEmail" type="email" autocomplete="username" required maxlength="254"></div>
      <div class="field full"><label for="qrPassword">Mật khẩu</label><input id="qrPassword" type="password" autocomplete="current-password" required maxlength="200"></div>
      <div class="field full"><button class="btn primary" type="submit">Đăng nhập</button></div></form><p id="qrLoginError" class="notice" hidden></p></div>`;
  }
  function roleCanOpen() { const role=getUser()?.role || window.currentRole; return ['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'].includes(String(role || '')); }
  function activities() { return Array.isArray(window.db?.activities) ? window.db.activities : []; }
  function renderNav() {
    const nav = $('#nav'); if (!nav) return;
    let button = nav.querySelector('[data-page="qr"]');
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.dataset.page = 'qr';
      button.innerHTML = '<span class="ico">▦</span><span class="navtext">Điểm danh QR</span>';
      button.addEventListener('click', () => window.showPage('qr'));
      nav.appendChild(button);
    }
    button.style.display = roleCanOpen() ? '' : 'none';
  }
  function pageShell(title, subtitle, content) {
    return `<div class="qr-module"><div class="pagehead"><div><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div></div>${content}</div>`;
  }
  function configWarning() {
    return `<div class="notice" style="border-left:4px solid #d97706"><b>Backend chưa được cấu hình.</b><br>Phân hệ QR chính thức không sử dụng localStorage. Hãy triển khai thư mục <code>backend</code>, cấu hình HTTPS và điền địa chỉ API trong <code>QR_CONFIG.js</code>. Trong lúc chưa cấu hình, các nút QR cũ vẫn giữ luồng demo localStorage; không dùng kết quả demo để điểm danh chính thức.</div>`;
  }
  function activityOptions(selected) {
    return activities().map(a => `<option value="${esc(a.id)}" ${String(a.id) === String(selected || '') ? 'selected' : ''}>${esc(a.name)} · ${esc(a.date || '')}</option>`).join('');
  }
  function renderCreateForm(selected) {
    const now = new Date(); const close = new Date(now.getTime() + 2*60*60*1000);
    return `<section class="panel"><div class="panelhead"><h2>Tạo phiên điểm danh QR</h2><span class="pill">Chỉ Bí thư</span></div>
      <form id="qrCreateForm" class="formgrid">
      <div class="field full"><label for="qrActivity">Hoạt động</label><select id="qrActivity" required><option value="">Chọn hoạt động</option>${activityOptions(selected)}</select></div>
      <div class="field"><label for="qrOpenAt">Thời gian mở</label><input id="qrOpenAt" type="datetime-local" value="${dateTimeLocal(now)}" required></div>
      <div class="field"><label for="qrCloseAt">Thời gian đóng</label><input id="qrCloseAt" type="datetime-local" value="${dateTimeLocal(close)}" required></div>
      <div class="field"><label for="qrRotation">Chu kỳ đổi mã</label><select id="qrRotation"><option value="30">30 giây</option><option value="60" selected>60 giây</option><option value="90">90 giây</option><option value="120">120 giây</option></select></div>
      <div class="field full"><button class="btn primary" type="submit">＋ Tạo phiên và phát hành QR</button></div></form><p class="muted small">Mã QR tự hết hạn và được đổi định kỳ. Đoàn viên phải đăng nhập tài khoản đã liên kết hồ sơ.</p></section>`;
  }
  function renderQrCard(result) {
    const s = result.session;
    return `<section class="panel qr-live-panel"><div class="panelhead"><h2>Phiên QR đang phát hành</h2><span class="pill success">${esc(s.status)}</span></div>
      <div class="qr-live-layout"><div class="qr-image-wrap"><img id="qrLiveImage" src="${result.qrDataUrl}" alt="Mã QR điểm danh phiên hiện tại"><p id="qrExpiryText" class="muted small">Mã hiện tại hết hạn: ${esc(new Date(result.tokenExpiresAt).toLocaleTimeString('vi-VN'))}</p></div>
      <div class="qr-session-info"><h3>${esc(window.__balangQrActivityName || 'Hoạt động')}</h3><p>Đóng phiên: <b>${esc(formatDateTime(s.closesAt))}</b></p><p>Chu kỳ đổi mã: ${esc(s.rotationSeconds)} giây</p><p>Phiên bản token: <b id="qrTokenVersion">${esc(s.tokenVersion)}</b></p><div class="toolbar"><button class="btn" data-action="qr-rotate" data-id="${esc(s.id)}">Đổi mã ngay</button><button class="btn danger" data-action="qr-close" data-id="${esc(s.id)}">Đóng phiên</button></div><p class="muted small">Không chụp/gửi mã QR ra ngoài phạm vi hoạt động. Khi đóng hoặc thu hồi, mã cũ lập tức mất hiệu lực.</p></div></div></section>`;
  }
  async function refreshSessions() {
    const result = await api('/api/qr/sessions');
    const body = $('#qrSessionsBody'); if (!body) return;
    const canManage=getUser()?.role==='Bí thư';
    body.innerHTML = result.sessions.map(s => `<tr><td>${esc(s.activityName)}</td><td>${esc(formatDateTime(s.createdAt))}</td><td>${esc(formatDateTime(s.closesAt))}</td><td><span class="pill">${esc(s.status)}</span></td><td>${canManage?(s.status==='OPEN'?`<button class="actionbtn" data-action="qr-rotate" data-id="${esc(s.id)}">Đổi mã</button><button class="actionbtn" data-action="qr-pause" data-id="${esc(s.id)}">Tạm dừng</button><button class="actionbtn" data-action="qr-close" data-id="${esc(s.id)}">Đóng</button>`:s.status==='PAUSED'?`<button class="actionbtn" data-action="qr-resume" data-id="${esc(s.id)}">Tiếp tục</button><button class="actionbtn" data-action="qr-close" data-id="${esc(s.id)}">Đóng</button>`:'Đã khóa'):'Chỉ xem'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có phiên QR.</td></tr>'; 
  }
  async function refreshAttendance(activityId) {
    const result = await api(`/api/qr/activities/${encodeURIComponent(activityId)}/attendance`);
    const body = $('#qrAttendanceBody'); if (!body) return;
    body.innerHTML = result.records.map(r => `<tr><td>${esc(r.memberName)}</td><td>${esc(r.memberId)}</td><td>${esc(r.status)}</td><td>${r.checkedAt ? esc(formatDateTime(r.checkedAt)) : '—'}</td><td>${esc(r.lateMinutes)}</td><td>${esc(r.method)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có lượt điểm danh.</td></tr>';
    const count = $('#qrAttendanceCount'); if (count) count.textContent = `Đã ghi nhận ${result.records.length} lượt điểm danh.`;
  }
  function renderQrManager(selectedActivity) {
    stopRotation();
    if (!API) { const html=pageShell('Điểm danh QR','Quản lý phiên QR, xác thực và kết quả tập trung.',configWarning()); if($('#content'))$('#content').innerHTML=html; return html; }
    if (!isLoggedIn()) { const html=pageShell('Điểm danh QR','Quản lý phiên QR và theo dõi điểm danh.',loginPanel()); if($('#content'))$('#content').innerHTML=html; return html; }
    const user=getUser();
    const canCreate=user?.role==='Bí thư';
    const canManage=user?.role==='Bí thư';
    const canRead=['Bí thư','Phó Bí thư'].includes(user?.role);
    let html = pageShell('Điểm danh QR','Phiên điểm danh có thời hạn · xác thực tài khoản · đồng bộ máy chủ.',
      `<div class="panel qr-userbar"><span>Đang đăng nhập: <b>${esc(user.email)}</b> · ${esc(user.role)}</span><button class="btn" data-action="qr-logout">Đăng xuất</button><button class="btn" data-action="qr-scan">▦ Quét mã QR</button></div>`+
      (canCreate?renderCreateForm(selectedActivity):'')+
      (canRead?`<section class="panel"><div class="panelhead"><h2>Quản lý phiên QR</h2><button class="btn" data-action="qr-refresh-sessions">Làm mới</button></div><div class="tablewrap"><table><thead><tr><th>Hoạt động</th><th>Tạo lúc</th><th>Đóng lúc</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="qrSessionsBody"><tr><td colspan="5">Đang tải…</td></tr></tbody></table></div></section>`:'')+
      (canRead?`<section class="panel"><div class="panelhead"><h2>Kết quả điểm danh</h2></div><div class="toolbar"><select id="qrAttendanceActivity"><option value="">Chọn hoạt động</option>${activityOptions(selectedActivity)}</select><button class="btn" data-action="qr-refresh-attendance">Tải kết quả</button><button class="btn" data-action="qr-export-attendance">Xuất CSV</button>${canManage?'<button class="btn danger" data-action="qr-lock-attendance">Chốt bảng điểm danh</button>':''}</div><p id="qrAttendanceCount" class="muted small"></p><div class="tablewrap"><table><thead><tr><th>Đoàn viên</th><th>Mã hồ sơ</th><th>Kết quả</th><th>Thời điểm</th><th>Trễ (phút)</th><th>Nguồn</th></tr></thead><tbody id="qrAttendanceBody"><tr><td colspan="6">Chọn hoạt động để xem dữ liệu.</td></tr></tbody></table></div>${canManage?`<hr><h3>Điểm danh thủ công / điều chỉnh</h3><form id="qrManualForm" class="formgrid"><div class="field"><label>Đoàn viên</label><select id="qrManualMember" required><option value="">Chọn đoàn viên</option>${(window.db?.members||[]).map(m=>`<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.id)}</option>`).join('')}</select></div><div class="field"><label>Trạng thái</label><select id="qrManualStatus"><option>Có mặt đúng giờ</option><option>Có mặt muộn</option><option>Vắng có phép</option><option>Vắng không lý do</option><option>Chưa xác nhận</option></select></div><div class="field full"><label>Lý do / ghi chú</label><input id="qrManualReason" maxlength="1000"></div><div class="field full"><button class="btn primary" type="submit">Lưu điểm danh thủ công</button></div></form>`:''}</section>`:`<section class="panel"><div class="panelhead"><h2>Điểm danh của tôi</h2><button class="btn" data-action="qr-refresh-my">Làm mới</button></div><div class="tablewrap"><table><thead><tr><th>Hoạt động</th><th>Ngày</th><th>Kết quả</th><th>Thời điểm</th><th>Trễ (phút)</th><th>Nguồn</th></tr></thead><tbody id="qrMyAttendanceBody"><tr><td colspan="6">Đang tải…</td></tr></tbody></table></div></section>`));
    $('#content').innerHTML=html;
    if(canRead)refreshSessions().catch(e=>notify(e.message));else refreshMyAttendance().catch(e=>notify(e.message));
    return html;
  }
  function scheduleRotation(session) {
    stopRotation();
    if (session?.status !== 'OPEN') return;
    rotateTimer=setInterval(()=>{if(!document.hidden)rotateSession(session.id).catch(e=>console.warn('QR auto rotate:',e.message));},Math.max(30000,(Number(session.rotationSeconds||60)-10)*1000));
  }
  async function rotateSession(id) {
    const result=await api(`/api/qr/sessions/${encodeURIComponent(id)}/rotate`,{method:'POST',body:{}});
    activeQrSession=result;
    scheduleRotation(result.session);
    const img=$('#qrLiveImage'); if(img)img.src=result.qrDataUrl;
    const expiry=$('#qrExpiryText'); if(expiry)expiry.textContent=`Mã hiện tại hết hạn: ${new Date(result.tokenExpiresAt).toLocaleTimeString('vi-VN')}`;
    const version=$('#qrTokenVersion'); if(version)version.textContent=result.session.tokenVersion;
    if(!img){const content=$('#content'); if(content){const card=renderQrCard(result);content.insertAdjacentHTML('afterbegin',card);}}
    return result;
  }
  async function createSession(form) {
    const activityId=$('#qrActivity')?.value;
    const openValue=$('#qrOpenAt')?.value; const closeValue=$('#qrCloseAt')?.value;
    if(!activityId||!openValue||!closeValue)throw new Error('Vui lòng chọn hoạt động và thời gian mở/đóng.');
    const activity=activities().find(a=>String(a.id)===String(activityId));
    const result=await api('/api/qr/sessions',{method:'POST',body:{activityId,opensAt:new Date(openValue).toISOString(),closesAt:new Date(closeValue).toISOString(),rotationSeconds:Number($('#qrRotation')?.value||60)}});
    window.__balangQrActivityName=activity?.name||'Hoạt động';
    activeQrSession=result;
    const content=$('#content'); content.insertAdjacentHTML('afterbegin',renderQrCard(result));
    scheduleRotation(result.session);
    await refreshSessions();
    notify('Đã tạo phiên QR. Hãy hiển thị mã tại địa điểm hoạt động.');
  }
  async function sessionAction(action,id) {
    if(action==='qr-rotate'){const r=await rotateSession(id);const s=r.session;const a=activities().find(x=>String(x.id)===String(s.activityId));window.__balangQrActivityName=a?.name||'Hoạt động';}
    else {const result=await api(`/api/qr/sessions/${encodeURIComponent(id)}/${action.replace('qr-','')}`,{method:'POST',body:{}});if(action==='qr-resume'){activeQrSession=result;const a=activities().find(x=>String(x.id)===String(result.session.activityId));window.__balangQrActivityName=a?.name||'Hoạt động';const content=$('#content');if(content)content.insertAdjacentHTML('afterbegin',renderQrCard(result));scheduleRotation(result.session);}else if(['qr-close','qr-pause'].includes(action))stopRotation();await refreshSessions();notify('Đã cập nhật trạng thái phiên QR.');}
  }
  async function checkinToken(token) {
    if(!token)throw new Error('Không đọc được token từ mã QR.');
    const preview=await api(`/api/qr/public/${encodeURIComponent(token)}`,{headers:{}});
    window.__balangQrPendingToken=token;
    const activityCard=`<section class="panel"><h2>${esc(preview.activity.name)}</h2><p>${esc(preview.activity.date)} · ${esc(preview.activity.startTime)} · ${esc(preview.activity.place||'')}</p><p>Phiên mở đến: ${esc(formatDateTime(preview.session.closesAt))}</p><p class="notice">Mã QR hiện còn hiệu lực đến ${esc(new Date(preview.session.tokenExpiresAt).toLocaleTimeString('vi-VN'))}. Chỉ xác nhận nếu bạn đang có mặt tại hoạt động.</p></section>`;
    if(!isLoggedIn()){
      $('#content').innerHTML=pageShell('Xác nhận điểm danh', 'Đăng nhập bằng tài khoản gắn với hồ sơ đoàn viên.',activityCard+loginPanel(true));
      return;
    }
    $('#content').innerHTML=pageShell('Xác nhận điểm danh', 'Kiểm tra hoạt động trước khi gửi xác nhận.',activityCard+`<section class="panel"><p>Đang đăng nhập: <b>${esc(getUser()?.email||'')}</b></p><button class="btn primary" data-action="qr-confirm-checkin">✓ Xác nhận điểm danh</button><p class="muted small">Máy chủ sẽ kiểm tra phiên, thời hạn QR, quyền tham gia và tình trạng điểm danh trùng trước khi ghi nhận.</p></section>`);
  }
  async function confirmCheckin() {
    const token=window.__balangQrPendingToken;
    if(!token)throw new Error('Không còn token QR. Hãy quét lại mã mới.');
    const result=await api('/api/qr/check-in',{method:'POST',body:{token}});
    $('#content').innerHTML=pageShell('Điểm danh hoàn tất','Máy chủ đã ghi nhận kết quả.',`<div class="panel"><h2>${esc(result.message)}</h2><p><b>${esc(result.attendance.status)}</b></p><p>Thời điểm: ${esc(formatDateTime(result.attendance.checkedAt))}</p><p>Trễ: ${esc(result.attendance.lateMinutes)} phút</p><button class="btn" data-action="qr-go-home">Quay lại website</button></div>`);
  }
  function renderCheckinRoute() {
    const m=location.hash.match(/^#qr-checkin=(.+)$/); if(!m)return false;
    const token=decodeURIComponent(m[1]);
    $('#content').innerHTML=pageShell('Đang xác minh mã QR','Không chia sẻ liên kết điểm danh cho người khác.','<div class="panel">Đang kiểm tra mã…</div>');
    checkinToken(token).catch(e=>{$('#content').innerHTML=pageShell('Không thể điểm danh','Mã QR không hợp lệ hoặc đã hết hạn.',`<div class="notice">${esc(e.message)}</div><button class="btn" data-action="qr-go-home">Quay lại</button>`);});
    return true;
  }
  async function startScanner() {
    if(!isLoggedIn()) { $('#content').innerHTML=pageShell('Quét mã QR','Đăng nhập bằng tài khoản cá nhân trước khi quét.',loginPanel()); return; }
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){notify('Camera chỉ hoạt động trên HTTPS hoặc localhost.');return;}
    const content=$('#content');
    content.insertAdjacentHTML('afterbegin',`<section class="panel" id="qrScannerPanel"><div class="panelhead"><h2>Quét mã QR</h2><button class="btn" data-action="qr-stop-scan">Đóng camera</button></div><video id="qrScannerVideo" autoplay muted playsinline style="width:100%;max-width:480px;aspect-ratio:4/3;background:#111;border-radius:12px"></video><p id="qrScannerStatus" class="notice">Đang mở camera…</p><div class="field"><label for="qrManualToken">Hoặc dán token/đường dẫn QR</label><input id="qrManualToken" placeholder="Token hoặc URL trong mã QR"><button class="btn" data-action="qr-submit-token">Xác nhận mã</button></div></section>`);
    try{
      scannerStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      const video=$('#qrScannerVideo'); if(!video)return stopScanner(); video.srcObject=scannerStream; await video.play();
      if(!('BarcodeDetector' in window)){const status=$('#qrScannerStatus');if(status)status.textContent='Trình duyệt chưa hỗ trợ đọc QR trực tiếp. Dùng camera điện thoại mở liên kết QR hoặc dán token vào ô bên dưới.';return;}
      const detector=new BarcodeDetector({formats:['qr_code']}); scannerActive=true;
      const tick=async()=>{if(!scannerActive)return;try{if(video.readyState>=2){const codes=await detector.detect(video);const raw=codes?.[0]?.rawValue;if(raw){const token=parseQrToken(raw);if(token){stopScanner();await checkinToken(token);return;}}}}catch(e){const status=$('#qrScannerStatus');if(status)status.textContent='Chưa đọc được mã. Hãy giữ điện thoại ổn định.';}if(scannerActive)scannerFrame=requestAnimationFrame(tick);}; tick();
    }catch(e){stopScanner();const status=$('#qrScannerStatus');if(status)status.textContent=e.name==='NotAllowedError'?'Bạn chưa cấp quyền camera. Hãy cấp quyền rồi thử lại.':'Không mở được camera. Hãy kiểm tra HTTPS và thiết bị.';}
  }
  async function refreshMyAttendance() {
    const result=await api('/api/qr/my-attendance');
    const body=$('#qrMyAttendanceBody'); if(!body)return;
    body.innerHTML=result.records.map(r=>`<tr><td>${esc(r.activityName)}</td><td>${esc(r.date)}</td><td>${esc(r.status)}</td><td>${r.checkedAt?esc(formatDateTime(r.checkedAt)):'—'}</td><td>${esc(r.lateMinutes)}</td><td>${esc(r.method||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Chưa có lịch sử điểm danh.</td></tr>';
  }
  function exportAttendance() {
    const rows=[...($('#qrAttendanceBody')?.querySelectorAll('tr')||[])].map(tr=>[...tr.cells].map(td=>td.textContent.trim()));
    if(!rows.length)return notify('Chưa có dữ liệu để xuất.');
    const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='diem-danh-qr.csv';a.click();URL.revokeObjectURL(url);
  }
  function bindEvents() {
    const content=$('#content'); if(!content||content.dataset.qrBound==='1')return;content.dataset.qrBound='1';
    content.addEventListener('submit',async e=>{
      if(e.target.id==='qrLoginForm'){
        e.preventDefault();const err=$('#qrLoginError');
        try{await login($('#qrEmail').value.trim(),$('#qrPassword').value);if(location.hash.startsWith('#qr-checkin='))await confirmCheckin();else renderQrManager();}
        catch(x){if(err){err.hidden=false;err.textContent=x.message;}else notify(x.message);} }
      if(e.target.id==='qrCreateForm'){e.preventDefault();try{await createSession(e.target);}catch(x){notify(x.message);}}
      if(e.target.id==='qrManualForm'){e.preventDefault();try{const aid=$('#qrAttendanceActivity')?.value;if(!aid)throw new Error('Hãy chọn hoạt động trước.');await api(`/api/qr/activities/${encodeURIComponent(aid)}/manual`,{method:'POST',body:{memberId:$('#qrManualMember').value,status:$('#qrManualStatus').value,reason:$('#qrManualReason').value}});notify('Đã lưu điểm danh thủ công.');await refreshAttendance(aid);}catch(x){notify(x.message);}}
    });
    content.addEventListener('click',async e=>{
      const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id;
      try{
        if(action==='qr-logout'){sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(USER_KEY);stopRotation();renderQrManager();}
        if(action==='qr-confirm-checkin')await confirmCheckin();
        if(action==='qr-scan')await startScanner();
        if(action==='qr-stop-scan')stopScanner();
        if(action==='qr-submit-token'){const token=parseQrToken($('#qrManualToken')?.value);await checkinToken(token);}
        if(['qr-rotate','qr-pause','qr-resume','qr-close'].includes(action))await sessionAction(action,id);
        if(action==='qr-refresh-sessions')await refreshSessions();
        if(action==='qr-refresh-my')await refreshMyAttendance();
        if(action==='qr-refresh-attendance'){const aid=$('#qrAttendanceActivity')?.value;if(!aid)throw new Error('Hãy chọn hoạt động.');await refreshAttendance(aid);}
        if(action==='qr-export-attendance')exportAttendance();
        if(action==='qr-lock-attendance'){const aid=$('#qrAttendanceActivity')?.value;if(!aid)throw new Error('Hãy chọn hoạt động.');if(!confirm('Chốt bảng điểm danh? Sau khi chốt, QR và chỉnh sửa thủ công sẽ bị khóa.'))return;await api(`/api/qr/activities/${encodeURIComponent(aid)}/lock`,{method:'POST',body:{}});notify('Đã khóa bảng điểm danh.');await refreshSessions();}
        if(action==='qr-go-home'){location.hash='';window.showPage('activities');}
      }catch(x){notify(x.message);}
    });
  }
  function renderOverride() {
    const old=window.render;
    window.render=function(){
      if(location.hash.startsWith('#qr-checkin=')){const handled=renderCheckinRoute();bindEvents();return handled;}
      if(window.page==='qr'){const html=renderQrManager(window.__balangQrSelectedActivity);bindEvents();return html;}
      return typeof old==='function'?old.apply(this,arguments):undefined;
    };
  }
  function showPageOverride() {
    const old=window.showPage;
    window.showPage=function(p){
      if(p==='qr'){if(!roleCanOpen())return notify('Vai trò hiện tại không được truy cập phân hệ QR.');window.page='qr';if(typeof window.setActive==='function')window.setActive();document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='qr'));renderQrManager();bindEvents();renderNav();return;}
      return typeof old==='function'?old.apply(this,arguments):undefined;
    };
  }
  function installStyles() {
    if ($('#balangQrStyles')) return;
    const style=document.createElement('style'); style.id='balangQrStyles';
    style.textContent='.qr-module{display:grid;gap:16px}.qr-module .qr-userbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.qr-live-layout{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:22px;align-items:center}.qr-image-wrap{text-align:center}.qr-image-wrap img{width:min(100%,320px);height:auto;background:#fff;padding:10px;border:1px solid var(--line,#ddd);border-radius:14px}.qr-session-info{min-width:0}.qr-module .formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.qr-module .field{min-width:0}.qr-module .field.full{grid-column:1/-1}.qr-module input,.qr-module select{max-width:100%}@media(max-width:700px){.qr-live-layout{grid-template-columns:1fr}.qr-module .formgrid{grid-template-columns:1fr}.qr-module .qr-userbar{align-items:flex-start;flex-direction:column}.qr-module .toolbar{flex-wrap:wrap}}';
    document.head.appendChild(style);
  }
  function install() {
    installStyles();
    renderNav();
    const oldVisibility=window.applyRoleVisibility;
    window.applyRoleVisibility=function(){if(typeof oldVisibility==='function')oldVisibility.apply(this,arguments);renderNav();};
    showPageOverride();renderOverride();bindEvents();
    if(location.hash.startsWith('#qr-checkin=')){renderCheckinRoute();bindEvents();}
    window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#qr-checkin=')){renderCheckinRoute();bindEvents();}});
    // Existing activity QR buttons now open the integrated session manager/scanner.
    if(API){
      window.showActivityQR=function(id){window.__balangQrSelectedActivity=String(id);window.showPage('qr');};
      window.scanActivityQR=function(){window.showPage('qr');startScanner();};
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

