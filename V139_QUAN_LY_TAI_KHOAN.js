/* V139 – Bí thư tạo và quản lý tài khoản đoàn viên (chạy qua máy chủ).
 * Giao diện chỉ hiển thị cho Bí thư đã đăng nhập; QUYỀN thật được máy chủ kiểm tra ở /api/admin/users. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const A=()=>window.BALANG_AUTH;
  const STATUS={ACTIVE:'Đang hoạt động',LOCKED:'Đã khóa',DISABLED:'Vô hiệu'};
  let users=[],err='',busy=false;

  function slug(name){
    return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D')
      .toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'');
  }
  const fmt=v=>v?new Date(v).toLocaleString('vi-VN'):'Chưa đăng nhập';
  const toast=m=>{if(typeof window.toast==='function')window.toast(m);};

  async function load(){
    try{const r=await A().api('/admin/users');users=r.users;err='';}
    catch(e){err=e.message;}
    paint();
  }
  function paint(){
    const box=document.getElementById('v139Accounts');if(!box)return;
    if(err){box.innerHTML=`<div class="notice">${esc(err)}</div>`;return;}
    if(!users.length){box.innerHTML='<div class="notice">Chưa có tài khoản nào.</div>';return;}
    box.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Tên đăng nhập</th><th>Đoàn viên</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead><tbody>${
      users.map(u=>{
        const protectedAcc=u.role==='Bí thư';
        const acts=protectedAcc?'<span class="sub">Tài khoản quản trị</span>':
          `<button class="btn" data-v139="reset" data-id="${esc(u.id)}">Đặt lại mật khẩu</button> <button class="btn" data-v139="${u.status==='ACTIVE'?'lock':'unlock'}" data-id="${esc(u.id)}">${u.status==='ACTIVE'?'Khóa':'Mở khóa'}</button>`;
        return `<tr><td><b>${esc(u.username||u.email||'')}</b>${u.mustChangePassword?'<br><small>Chưa đổi mật khẩu tạm</small>':''}</td><td>${esc(u.memberName||'—')}</td><td>${esc(u.role)}</td><td>${esc(STATUS[u.status]||u.status)}</td><td>${esc(fmt(u.lastLoginAt))}</td><td>${acts}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /* ---- hộp thoại (dùng lớp CSS sẵn có của ứng dụng) ---- */
  function openModal(title,inner){
    const root=document.getElementById('modalRoot');if(!root)return null;
    root.innerHTML=`<div class="modalback" role="dialog" aria-modal="true"><div class="modal"><div class="modalhead"><h2>${esc(title)}</h2><button class="close" type="button" aria-label="Đóng" data-v139="close">×</button></div>${inner}</div></div>`;
    return root;
  }
  const closeModal=()=>{const r=document.getElementById('modalRoot');if(r)r.innerHTML='';};

  function openCreate(){
    let members=[];try{members=(db.members||[]).filter(m=>m&&m.id&&m.name);}catch{}
    const taken=new Set(users.map(u=>u.memberId));
    const free=members.filter(m=>!taken.has(m.id));
    if(!free.length){toast('Mọi đoàn viên trong danh sách đã có tài khoản. Hãy thêm hồ sơ đoàn viên trước.');return;}
    const root=openModal('Tạo tài khoản cho đoàn viên',`<form id="v139Create" novalidate><div class="formgrid">
      <div class="field full"><label>Đoàn viên *</label><select name="memberId" required>${free.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.id)})</option>`).join('')}</select></div>
      <div class="field"><label>Tên đăng nhập *</label><input name="username" type="text" required maxlength="100" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label>Vai trò</label><select name="role"><option>Đoàn viên</option><option>Ủy viên BCH</option><option>Phó Bí thư</option></select></div>
      <div class="field full"><label>Mật khẩu tạm (tùy chọn)</label><input name="password" type="text" minlength="12" maxlength="200" autocomplete="off" placeholder="Để trống: hệ thống tự tạo mật khẩu tạm ngẫu nhiên"></div>
      <div class="field full"><small>Đoàn viên bắt buộc đổi mật khẩu ở lần đăng nhập đầu. Không thể tạo thêm tài khoản Bí thư tại đây.</small></div>
      <div class="authmsg" id="v139Msg" role="alert" style="color:#a12828;grid-column:1/-1"></div></div>
      <div class="modalfoot"><button type="button" class="btn" data-v139="close">Hủy</button><button class="btn primary" type="submit" id="v139Submit">Tạo tài khoản</button></div></form>`);
    if(!root)return;
    const form=root.querySelector('#v139Create');const q=n=>form.querySelector('[name='+n+']');const sel=q('memberId'),un=q('username');let touched=false;
    const suggest=()=>{if(!touched){const m=free.find(x=>x.id===sel.value);un.value=slug(m?.name);}};
    un.addEventListener('input',()=>{touched=true;});sel.addEventListener('change',suggest);suggest();
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;
      const m=free.find(x=>x.id===sel.value);const msg=root.querySelector('#v139Msg');
      const body={username:un.value,role:q('role').value,memberId:m.id,fullName:m.name};
      const pwv=q('password').value;if(pwv)body.password=pwv;
      busy=true;const sb=root.querySelector('#v139Submit');sb.disabled=true;msg.textContent='';
      try{const r=await A().api('/admin/users',{method:'POST',body:JSON.stringify(body)});
        showSecret(`Đã tạo tài khoản “${r.user.username}”`,r.temporaryPassword,r.user.username,pwv?'Mật khẩu do bạn đặt đã được áp dụng. Hãy gửi cho đoàn viên qua kênh riêng.':null);
        await load();}
      catch(ex){msg.textContent=ex.message;sb.disabled=false;}
      finally{busy=false;}
    });
    un.focus();
  }
  function showSecret(title,pw,username,note){
    openModal(title,`<div class="formgrid"><div class="field full"><label>Tên đăng nhập</label><input readonly value="${esc(username)}"></div>
      ${pw?`<div class="field full"><label>Mật khẩu tạm (chỉ hiển thị MỘT lần)</label><input readonly id="v139Pw" value="${esc(pw)}" style="font-family:monospace;font-size:16px"></div>
      <div class="field full"><small>Hãy gửi cho đoàn viên qua kênh riêng. Hệ thống không lưu bản rõ và sẽ không hiển thị lại. Đoàn viên phải đổi mật khẩu khi đăng nhập lần đầu.</small></div>`:`<div class="field full"><small>${esc(note||'Hoàn tất.')}</small></div>`}</div>
      <div class="modalfoot">${pw?'<button type="button" class="btn" data-v139="copy">Sao chép mật khẩu</button>':''}<button type="button" class="btn primary" data-v139="close">Xong</button></div>`);
  }

  async function act(kind,id){
    const u=users.find(x=>x.id===id);if(!u)return;
    try{
      if(kind==='reset'){
        if(!confirm(`Đặt lại mật khẩu cho “${u.username}”? Mọi phiên đăng nhập hiện có sẽ bị đăng xuất.`))return;
        const r=await A().api(`/admin/users/${encodeURIComponent(id)}/reset-password`,{method:'POST',body:'{}'});
        showSecret(`Đã đặt lại mật khẩu “${u.username}”`,r.temporaryPassword,u.username);
      }else{
        const lock=kind==='lock';
        if(lock&&!confirm(`Khóa tài khoản “${u.username}”? Người này sẽ bị đăng xuất và không đăng nhập được.`))return;
        await A().api(`/admin/users/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status:lock?'LOCKED':'ACTIVE'})});
        toast(lock?'Đã khóa tài khoản.':'Đã mở khóa tài khoản.');
      }
      await load();
    }catch(e){toast(e.message);}
  }

  document.addEventListener('click',e=>{
    const t=e.target.closest&&e.target.closest('[data-v139]');if(!t)return;
    const k=t.dataset.v139;
    if(k==='close')closeModal();
    else if(k==='open')openCreate();
    else if(k==='copy'){const v=document.getElementById('v139Pw')?.value;
      if(v&&navigator.clipboard)navigator.clipboard.writeText(v).then(()=>toast('Đã sao chép.'),()=>toast('Không sao chép được; hãy chép thủ công.'));}
    else act(k,t.dataset.id);
  });

  const base=window.accountsPage;
  window.accountsPage=function(){
    const a=A();
    if(!a||!a.authenticated()||currentRole!=='Bí thư')return typeof base==='function'?base():'';
    setTimeout(load,0);
    return head('Tài khoản & phân quyền','Bí thư tạo tài khoản cho đoàn viên. Quyền được máy chủ kiểm tra; mật khẩu tạm chỉ hiển thị một lần.','<button class="btn primary" data-v139="open">＋ Tạo tài khoản đoàn viên</button>')+'<div class="card" id="v139Accounts">Đang tải danh sách tài khoản…</div>';
  };
})();
