/* V138 – Đăng nhập / Đăng xuất.
 * - Mở website: luôn là chế độ KHÁCH (chỉ trang công khai).
 * - Một nút duy nhất ở CUỐI thanh menu bên trái: "Đăng nhập" (Khách) <-> "Đăng xuất" (đã xác thực).
 * - Đăng nhập bằng TÊN ĐĂNG NHẬP (vd. TKBTCĐTBL), không tự đổi thành email.
 * - Danh tính và quyền do MÁY CHỦ quyết định (/auth/login, /auth/me, /auth/logout).
 *   Lớp ẩn/hiện ở giao diện chỉ là phòng thủ bổ sung, KHÔNG phải ranh giới bảo mật.
 */
(function(){
  'use strict';
  const API=(window.BALANG_API_BASE||((location.hostname==='localhost'||location.hostname==='127.0.0.1')?'http://localhost:4000/api':'/api')).replace(/\/$/,'');
  const TOKEN_KEY='balang_auth_token_v136';
  const FALLBACK_GUEST_PAGES=['public','news','tradition','media','feedback','honours','awards'];
  const ROLES=['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'];
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readToken=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||'';}catch{return '';}};
  const writeToken=v=>{try{v?sessionStorage.setItem(TOKEN_KEY,v):sessionStorage.removeItem(TOKEN_KEY);}catch{}};
  const state={token:readToken(),user:null,busy:false};
  const listeners=[];
  const emit=()=>listeners.slice().forEach(f=>{try{f(state.user);}catch(e){console.error('auth listener',e);}});

  /* ---------- Trang được phép khi là Khách ---------- */
  function guestPages(){
    try{ if(typeof rolePagePermissions!=='undefined'&&Array.isArray(rolePagePermissions['Khách']))return rolePagePermissions['Khách']; }catch{}
    return FALLBACK_GUEST_PAGES;
  }
  const isGuest=()=>!state.user;

  /* ---------- Gọi API ---------- */
  // Nếu CAU_HINH.js đặt BALANG_GAS_URL: gọi Google Apps Script (POST text/plain để không cần preflight CORS; token nằm trong thân yêu cầu).
  // Nếu không: gọi máy chủ Node/PostgreSQL như trước.
  async function transport(path,opts,headers){
    const gas=window.BALANG_GAS_URL||'';
    if(!gas)return fetch(API+path,{...opts,headers});
    const [p,qs]=path.split('?');
    const query=Object.fromEntries(new URLSearchParams(qs||''));
    let body;try{body=opts.body?JSON.parse(opts.body):undefined;}catch{body=undefined;}
    const token=(headers.Authorization||'').replace(/^Bearer\s+/,'')||undefined;
    const r=await fetch(gas,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({method:String(opts.method||'GET').toUpperCase(),path:p,query,body,token}),redirect:'follow'});
    const env=await r.json();      // { status, body } – Apps Script luôn trả HTTP 200 nên mã thật nằm trong thân
    return {ok:env.status<400,status:env.status,json:async()=>env.body};
  }
  async function api(path,opts={}){
    const headers={'Content-Type':'application/json',...(opts.headers||{})};
    if(state.token)headers.Authorization='Bearer '+state.token;
    let res;
    try{ res=await transport(path,opts,headers); }
    catch{ throw Object.assign(new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi thử lại.'),{network:true}); }
    const body=await res.json().catch(()=>({ok:false,message:'Phản hồi máy chủ không hợp lệ.'}));
    if(!res.ok){
      // Phiên hết hạn/bị thu hồi ở máy chủ -> về chế độ Khách ngay.
      if(res.status===401&&state.token&&!path.startsWith('/auth/login')){ toGuest('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',{silent:false}); }
      throw Object.assign(new Error(body.message||'Yêu cầu không thành công.'),{status:res.status,body});
    }
    return body;
  }

  /* ---------- CSS ---------- */
  function ensureStyle(){
    if($('#v138AuthStyle'))return;
    const st=document.createElement('style');st.id='v138AuthStyle';
    st.textContent=`
      #v136AuthGate[hidden],#v136SecurityBanner[hidden],#v138AuthDock[hidden]{display:none!important}
      #v136AuthGate{position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#f3f8f5,#e8f2ec);display:grid;place-items:center;padding:18px;overflow:auto}
      #v136AuthGate .authcard{width:min(440px,100%);background:#fff;border:1px solid #dce9e0;border-radius:22px;padding:28px;box-shadow:0 18px 60px #0a3b211a}
      #v136AuthGate h1{font-size:24px;margin:0 0 6px;color:#073d28}#v136AuthGate p{color:#607368;margin:0 0 18px;font-size:14px}
      #v136AuthGate form{display:grid;gap:12px}#v136AuthGate label{font-size:12px;font-weight:800;color:#526158}#v136AuthGate input{width:100%;margin-top:5px}
      #v136AuthGate button{border:0;border-radius:10px;padding:12px 16px;background:#087f45;color:#fff;font-weight:800}
      #v136AuthGate button.secondary{background:#eef6f0;color:#145b35}#v136AuthGate button[disabled]{opacity:.6;cursor:wait}
      #v136AuthGate .authmsg{font-size:13px;color:#a12828;min-height:18px}#v136AuthGate .authfoot{font-size:11px;color:#75857b;margin-top:16px}
      #v136PublicVerify{position:fixed;inset:0;z-index:1100;background:#f5f8f6;overflow:auto;padding:24px;display:grid;place-items:center}
      #v136PublicVerify .verifycard{width:min(620px,100%);background:#fff;border:1px solid #dce9e0;border-radius:18px;padding:26px;box-shadow:0 14px 45px #12352212}
      #v136SecurityBanner{margin:12px 30px 0;padding:11px 14px;border:1px solid #f2d39b;background:#fff8e8;border-radius:10px;color:#805400;font:13px/1.45 Arial,sans-serif}
      /* Nút Đăng nhập/Đăng xuất: phần tử CUỐI CÙNG của thanh menu bên trái */
      .sidebar .v138-auth-dock{flex:0 0 auto;margin-top:6px;padding:10px 0 0;border-top:1px solid #ffffff20}
      .v138-auth-btn{width:100%;border:0;border-radius:10px;padding:11px 12px;display:flex;gap:12px;align-items:center;font:inherit;font-weight:700;color:#fff;background:#0a9a55;text-align:left;cursor:pointer}
      .v138-auth-btn:hover,.v138-auth-btn:focus-visible{background:#0cb061;outline:2px solid #ffffff80;outline-offset:1px}
      .v138-auth-btn.logout{background:#ffffff1c;color:#ffd9d9}.v138-auth-btn.logout:hover,.v138-auth-btn.logout:focus-visible{background:#ffffff2e}
      .v138-auth-btn .ico{width:20px;text-align:center}
      @media(max-width:1050px){.v138-auth-btn{justify-content:center;padding:13px 5px}}
      @media(max-width:720px){
        .sidebar .v138-auth-dock{display:flex;align-items:center;margin:0;padding:0 0 0 6px;border-top:0;border-left:1px solid #ffffff30;position:sticky;right:0;background:#073d28;z-index:2}
        .v138-auth-btn{display:grid;gap:0;min-width:64px;width:auto;padding:7px 8px;font-size:10px;text-align:center;justify-content:center}
        .v138-auth-btn .navtext{display:block!important}.v138-auth-btn .ico{width:auto;font-size:17px}
      }
      /* Nút Đăng nhập/Đăng xuất trên thanh trên cùng: chỉ hiện khi thanh menu bên trái bị thu nhỏ/ẩn (<=1050px) */
      .v138-top-auth{display:none}
      @media(max-width:1050px){
        .top-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .v138-top-auth{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:9px 14px;font:inherit;font-size:14px;font-weight:800;line-height:1;white-space:nowrap;cursor:pointer;color:#fff;background:#087f45;box-shadow:0 2px 8px #087f4540}
        .v138-top-auth.logout{color:#8a1c1c;background:#fdeeee;box-shadow:none;border:1px solid #f3c9c9}
        .v138-top-auth:focus-visible{outline:3px solid #087f4580;outline-offset:2px}
        .topbar>div:first-child{min-width:0;flex:1 1 auto}.topbar .crumb{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      }
      @media(max-width:520px){.topbar>div:first-child>div:nth-child(2){display:none}.v138-top-auth{padding:9px 12px;font-size:13px}}
      /* Khách: ẩn điều khiển nội bộ trên thanh trên cùng */
      body.v138-guest .top-actions .iconbtn,body.v138-guest #activeUserLabel,body.v138-guest .top-actions .avatar{display:none!important}
      @media(max-width:600px){#v136AuthGate .authcard{padding:22px}#v136SecurityBanner{margin:10px}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- Khung đăng nhập / xác minh ---------- */
  function ensureShell(){
    ensureStyle();
    if(!$('#v136AuthGate')){
      const gate=document.createElement('div');gate.id='v136AuthGate';gate.hidden=true;gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-label','Đăng nhập');
      gate.innerHTML='<div class="authcard"><div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><div style="width:46px;height:46px;border-radius:14px;background:#e8f6ed;color:#087f45;display:grid;place-items:center;font-weight:900;font-size:20px">BL</div><div><b style="display:block;color:#073d28">THANH NIÊN BA LĂNG</b><small style="color:#74847a">Đăng nhập hệ thống</small></div></div><div id="v136AuthBody"></div><div class="authfoot">Tài khoản được xác thực bởi máy chủ. Không có chế độ chọn vai trò thử nghiệm.</div></div>';
      document.body.appendChild(gate);
      gate.addEventListener('keydown',e=>{if(e.key==='Escape'&&!state.busy&&!(state.user&&state.user.mustChangePassword))backToGuest();});
    }
    if(!$('#v136SecurityBanner')){
      const b=document.createElement('div');b.id='v136SecurityBanner';b.hidden=true;
      b.textContent='Đã xác thực tài khoản bằng máy chủ. Tài khoản và hồ sơ đoàn viên được lưu trên máy chủ; các phân hệ còn lại (hoạt động, KPI, khen thưởng, tin tức…) vẫn lưu trong trình duyệt và chưa chuyển sang máy chủ. Bản này chỉ dùng thử nghiệm: chưa nhập dữ liệu thật của các phân hệ đó.';
      const main=$('.main');if(main)main.insertBefore(b,main.children[1]||null);
    }
  }
  const gateEl=()=>$('#v136AuthGate');
  function openGate(){const g=gateEl();if(g)g.hidden=false;}
  function closeGate(){const g=gateEl();if(g)g.hidden=true;}

  /* ---------- Nút Đăng nhập / Đăng xuất (cuối thanh menu) ---------- */
  function ensureDock(){
    const side=$('.sidebar');if(!side)return null;
    document.querySelectorAll('#v137AuthActions,#v136LoginButton,#v136LogoutButton').forEach(n=>n.remove()); // dọn nút cũ (V136/V137)
    let dock=$('#v138AuthDock');
    if(!dock){dock=document.createElement('div');dock.id='v138AuthDock';dock.className='v138-auth-dock';}
    if(dock.parentElement!==side||side.lastElementChild!==dock)side.appendChild(dock); // luôn là phần tử cuối cùng
    const authed=!!state.user,mode=authed?'logout':'login';
    let btn=dock.querySelector('button');
    if(!btn||btn.dataset.mode!==mode){
      dock.innerHTML='';
      btn=document.createElement('button');btn.type='button';btn.dataset.mode=mode;
      btn.id=authed?'v138LogoutButton':'v138LoginButton';btn.className='v138-auth-btn '+mode;
      const label=authed?'Đăng xuất':'Đăng nhập';
      btn.innerHTML=`<span class="ico" aria-hidden="true">${authed?'⎋':'🔑'}</span><span class="navtext">${label}</span>`;
      btn.title=label;btn.setAttribute('aria-label',label);
      btn.addEventListener('click',authed?logout:()=>showLogin());
      dock.appendChild(btn);
    }
    return dock;
  }

  /* ---------- Nút Đăng nhập/Đăng xuất ở cuối thanh trên cùng (điện thoại, máy tính bảng) ---------- */
  function ensureTopButton(){
    const ta=$('.top-actions');if(!ta)return;
    let b=$('#v142TopAuth');
    if(!b){
      b=document.createElement('button');b.type='button';b.id='v142TopAuth';b.className='v138-top-auth';
      b.addEventListener('click',()=>{ if(state.user)logout(); else showLogin(); });
    }
    if(ta.lastElementChild!==b)ta.appendChild(b);          // luôn là phần tử cuối của thanh trên
    const authed=!!state.user,label=authed?'Đăng xuất':'Đăng nhập';
    if(b.textContent!==label)b.textContent=label;
    b.classList.toggle('logout',authed);b.title=label;b.setAttribute('aria-label',label);
  }

  /* ---------- Vai trò & nhãn người dùng ---------- */
  function setRole(user){
    const r=ROLES.includes(user?.role)?user.role:'Khách';
    try{currentRole=r;}catch{} window.currentRole=r;
    try{ activeDemoName=(r==='Khách')?'':(user?.memberName||''); }catch{}
    syncIdentity();
  }
  function syncIdentity(){
    const label=$('#activeUserLabel');
    if(label)label.textContent=state.user?((state.user.memberName||state.user.username||state.user.email||'')+' · '+state.user.role):'Khách';
    const av=$('.avatar');
    if(av)av.textContent=state.user?String(state.user.memberName||state.user.username||state.user.email||'?').trim().slice(0,2).toUpperCase():'KH';
    document.body.classList.toggle('v138-guest',isGuest());
    document.body.classList.toggle('v138-authed',!isGuest());
  }

  /* ---------- Ép chế độ Khách ở giao diện (phòng thủ bổ sung) ---------- */
  function enforceGuestUI(){
    if(!isGuest())return;
    const allowed=guestPages();
    document.querySelectorAll('#nav button[data-page]').forEach(b=>{
      if(!allowed.includes(b.dataset.page)){b.style.display='none';b.setAttribute('aria-hidden','true');b.tabIndex=-1;}
    });
    try{ if(!allowed.includes(page)){page='public';} }catch{}
  }
  function wrapRouting(){
    if(window.__v138Wrapped)return;window.__v138Wrapped=true;
    const sp=window.showPage;
    if(typeof sp==='function')window.showPage=function(p){ if(isGuest()&&!guestPages().includes(p))p='public'; return sp.call(this,p); };
    const rd=window.render;
    if(typeof rd==='function')window.render=function(){
      if(isGuest()){try{currentRole='Khách';}catch{} try{ if(!guestPages().includes(page))page='public'; }catch{}}
      const out=rd.apply(this,arguments);
      afterRender();
      return out;
    };
    const av=window.applyRoleVisibility;
    if(typeof av==='function')window.applyRoleVisibility=function(){const out=av.apply(this,arguments);enforceGuestUI();return out;};
  }
  function afterRender(){ensureDock();ensureTopButton();enforceGuestUI();syncIdentity();}

  /* ---------- Trạng thái Khách / Đã đăng nhập ---------- */
  function resetInternalUI(){
    const mr=$('#modalRoot');if(mr)mr.innerHTML='';            // đóng mọi hộp thoại nội bộ đang mở
    document.querySelectorAll('.modalback').forEach(n=>n.remove());
    const banner=$('#v136SecurityBanner');if(banner)banner.hidden=true;
    if(location.hash&&/^#(?!survey=|qr-checkin=)/.test(location.hash)){try{history.replaceState(null,'',location.pathname+location.search);}catch{}}
  }
  function toGuest(message,{silent=true}={}){
    state.token='';state.user=null;writeToken('');
    ensureShell();
    setRole(null);
    emit();                         // các phân hệ xóa dữ liệu riêng tư khỏi bộ nhớ trước khi dựng giao diện Khách
    resetInternalUI();
    closeGate();
    try{page='public';}catch{}
    try{window.render?.();}catch(e){console.error('Lỗi dựng giao diện Khách',e);}
    afterRender();
    if(!silent&&typeof window.toast==='function'){try{window.toast(message);}catch{}}
  }
  function backToGuest(){closeGate();afterRender();}

  async function loadMe(){
    const r=await api('/auth/me');
    state.user=r.user;
    setRole(r.user);
    emit();
    closeGate();
    const banner=$('#v136SecurityBanner');if(banner)banner.hidden=false;
    try{ if(typeof page!=='undefined'&&!(typeof rolePagePermissions!=='undefined'&&(rolePagePermissions[r.user.role]||[]).includes(page)))page='dashboard'; }catch{}
    try{window.render?.();}catch(e){console.error(e);}
    afterRender();
    if(r.user.mustChangePassword)showChangePassword(true);
  }

  async function logout(){
    const btn=$('#v138LogoutButton');if(btn)btn.disabled=true;
    try{ if(state.token)await api('/auth/logout',{method:'POST',body:'{}'}); }catch{/* dù máy chủ không phản hồi, giao diện vẫn về chế độ Khách */}
    toGuest('',{silent:true});
  }

  /* ---------- Màn hình đăng nhập ---------- */
  function showLogin(message=''){
    ensureShell();
    const body=$('#v136AuthBody');if(!body)return;
    body.innerHTML=`<h1>Đăng nhập</h1><p>Sử dụng tên đăng nhập và mật khẩu do quản trị viên cấp cho bạn.</p>
      <form id="v138LoginForm" novalidate>
        <label>Tên đăng nhập<input name="username" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" required maxlength="254" placeholder="Nhập tên đăng nhập"></label>
        <label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required maxlength="200" placeholder="Nhập mật khẩu"></label>
        <div class="authmsg" id="v136AuthMessage" role="alert" aria-live="polite">${esc(message)}</div>
        <button type="submit" id="v138Submit">Đăng nhập</button>
        <button type="button" class="secondary" id="v138Cancel">Quay lại chế độ Khách</button>
        ${window.BALANG_GAS_URL?'<p class="authfoot" style="margin:4px 0 0">Quên mật khẩu? Liên hệ Bí thư để được đặt lại mật khẩu.</p>':'<button type="button" class="secondary" id="v136Forgot">Quên mật khẩu?</button>'}
      </form>`;
    openGate();
    const form=$('#v138LoginForm');
    form.onsubmit=async e=>{
      e.preventDefault();if(state.busy)return;
      const f=new FormData(form);const username=String(f.get('username')||'');const password=String(f.get('password')||'');
      const msg=$('#v136AuthMessage');
      if(!username.trim()||!password){msg.textContent='Vui lòng nhập tên đăng nhập và mật khẩu.';return;}
      state.busy=true;const btn=$('#v138Submit');btn.disabled=true;btn.textContent='Đang xác thực…';msg.textContent='';
      try{
        // Gửi đúng tên đăng nhập người dùng nhập (không đổi sang email, không đổi chữ hoa/thường).
        const r=await api('/auth/login',{method:'POST',body:JSON.stringify({username,password})});
        state.token=r.token;writeToken(r.token);
        await loadMe();
      }catch(err){
        state.token='';writeToken('');state.user=null;
        const m=$('#v136AuthMessage');if(m)m.textContent=err.message;
        const pw=form.querySelector('[name=password]');if(pw){pw.value='';pw.focus();}
      }finally{state.busy=false;const b=$('#v138Submit');if(b){b.disabled=false;b.textContent='Đăng nhập';}}
    };
    $('#v138Cancel').onclick=backToGuest;
    const fg=$('#v136Forgot');if(fg)fg.onclick=showResetRequest;
    setTimeout(()=>form.querySelector('[name=username]')?.focus(),0);
  }
  function showChangePassword(forced){
    ensureShell();openGate();
    const body=$('#v136AuthBody');
    body.innerHTML=`<h1>${forced?'Đổi mật khẩu tạm':'Đổi mật khẩu'}</h1><p>${forced?'Tài khoản của bạn đang dùng mật khẩu tạm do Bí thư cấp. Hãy đặt mật khẩu riêng (ít nhất 12 ký tự) để tiếp tục.':'Nhập mật khẩu hiện tại và mật khẩu mới (ít nhất 12 ký tự).'}</p>
      <form id="v139ChangePw" novalidate>
        <label>Mật khẩu hiện tại<input name="cur" type="password" autocomplete="current-password" required maxlength="200"></label>
        <label>Mật khẩu mới<input name="new1" type="password" autocomplete="new-password" required minlength="12" maxlength="200"></label>
        <label>Nhập lại mật khẩu mới<input name="new2" type="password" autocomplete="new-password" required minlength="12" maxlength="200"></label>
        <div class="authmsg" id="v136AuthMessage" role="alert" aria-live="polite"></div>
        <button type="submit">Đổi mật khẩu</button>
        <button type="button" class="secondary" id="v139Cancel">${forced?'Đăng xuất':'Hủy'}</button>
      </form>`;
    $('#v139Cancel').onclick=()=>forced?logout():closeGate();
    $('#v139ChangePw').onsubmit=async e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);const m=$('#v136AuthMessage');
      const cur=String(f.get('cur')||''),n1=String(f.get('new1')||''),n2=String(f.get('new2')||'');
      if(n1.length<12){m.textContent='Mật khẩu mới phải có ít nhất 12 ký tự.';return;}
      if(n1!==n2){m.textContent='Hai lần nhập mật khẩu mới chưa khớp.';return;}
      try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:cur,newPassword:n1})});
        if(state.user)state.user.mustChangePassword=false;closeGate();
        emit();                         // nạp lại dữ liệu của phân hệ (trước đó bị chặn vì còn mật khẩu tạm)
        if(typeof window.toast==='function')window.toast('Đã đổi mật khẩu.');}
      catch(err){m.textContent=err.message;}
    };
    setTimeout(()=>$('#v139ChangePw [name=cur]')?.focus(),0);
  }
  function showResetRequest(){
    const body=$('#v136AuthBody');
    body.innerHTML='<h1>Khôi phục mật khẩu</h1><p>Nhập email đã đăng ký cho tài khoản. Nếu tài khoản có email và dịch vụ thư hoạt động, hướng dẫn sẽ được gửi. Tài khoản quản trị không dùng email: hãy liên hệ người quản lý máy chủ.</p><form id="v136ResetRequest"><label>Email<input name="email" type="email" required maxlength="254"></label><div class="authmsg" id="v136AuthMessage" role="alert"></div><button>Gửi hướng dẫn</button><button type="button" class="secondary" id="v136Back">Quay lại đăng nhập</button></form>';
    $('#v136ResetRequest').onsubmit=async e=>{e.preventDefault();try{const email=new FormData(e.currentTarget).get('email');const r=await api('/auth/password-reset/request',{method:'POST',body:JSON.stringify({email})});$('#v136AuthMessage').textContent=r.message;}catch(err){$('#v136AuthMessage').textContent=err.message;}};
    $('#v136Back').onclick=()=>showLogin();
  }
  function showResetConfirm(token){
    ensureShell();openGate();
    const body=$('#v136AuthBody');
    body.innerHTML='<h1>Đặt mật khẩu mới</h1><p>Mật khẩu phải có ít nhất 12 ký tự.</p><form id="v136ResetConfirm"><label>Mật khẩu mới<input name="password" type="password" minlength="12" maxlength="200" required autocomplete="new-password"></label><div class="authmsg" id="v136AuthMessage" role="alert"></div><button>Đổi mật khẩu</button><button type="button" class="secondary" id="v138Cancel">Về chế độ Khách</button></form>';
    $('#v138Cancel').onclick=backToGuest;
    $('#v136ResetConfirm').onsubmit=async e=>{e.preventDefault();try{const password=new FormData(e.currentTarget).get('password');const r=await api('/auth/password-reset/confirm',{method:'POST',body:JSON.stringify({token,newPassword:password})});$('#v136AuthMessage').textContent=r.message;}catch(err){$('#v136AuthMessage').textContent=err.message;}};
  }

  /* ---------- Xác minh giấy chứng nhận công khai ---------- */
  async function verifyPublic(token){
    ensureShell();closeGate();
    const root=document.createElement('div');root.id='v136PublicVerify';
    root.innerHTML='<div class="verifycard"><p>Đang xác minh giấy chứng nhận…</p></div>';document.body.appendChild(root);
    const home=()=>{try{history.replaceState(null,'',location.pathname);}catch{}root.remove();toGuest('',{silent:true});};
    try{
      const r=await fetch(API+'/certificates/public/verify/'+encodeURIComponent(token));const d=await r.json();
      if(!r.ok)throw new Error(d.message||'Không xác minh được giấy chứng nhận.');
      const c=d.certificate;
      root.innerHTML=`<div class="verifycard"><div style="font-weight:800;color:#087f45;letter-spacing:.08em;font-size:12px">THANH NIÊN BA LĂNG · XÁC MINH ĐIỆN TỬ</div><h1 style="color:#073d28">${d.valid?'Giấy chứng nhận hợp lệ':'Giấy chứng nhận đã thu hồi'}</h1><p>${esc(d.message||'')}</p>${c?`<div style="border-top:1px solid #e4ece7;padding-top:14px;display:grid;gap:9px"><div><small>Người được cấp</small><br><b>${esc(c.recipientName)}</b></div><div><small>Nội dung chứng nhận</small><br><b>${esc(c.title)}</b></div><div><small>Ngày cấp</small><br>${esc(c.issuedOn)}</div><div><small>Người ký/cấp</small><br>${esc(c.issuerName)}</div>${c.publicNote?`<div><small>Ghi chú công khai</small><br>${esc(c.publicNote)}</div>`:''}</div>`:''}<button id="v136VerifyHome" style="margin-top:22px;border:0;border-radius:10px;padding:12px 16px;background:#087f45;color:#fff;font-weight:800">Về trang chủ công khai</button></div>`;
    }catch(e){
      root.innerHTML=`<div class="verifycard"><h1>Không xác minh được</h1><p>${esc(e.message)}</p><button id="v136VerifyHome" style="margin-top:18px;border:0;border-radius:10px;padding:12px 16px;background:#087f45;color:#fff">Về trang chủ công khai</button></div>`;
    }
    $('#v136VerifyHome').onclick=home;
  }

  /* ---------- Loại bỏ điều khiển chọn vai trò thử nghiệm cũ ---------- */
  function removeDemoControls(){
    ['rolePicker','demoMemberPicker'].forEach(id=>{const el=document.getElementById(id);if(el){const p=el.closest('div');if(p&&/demo|thử nghiệm/i.test(p.textContent))p.remove();else el.remove();}});
    document.querySelectorAll('#qrDemoMember').forEach(el=>el.closest('.field')?.remove());
    document.querySelectorAll('button[onclick*="activeDemoName="]').forEach(b=>b.remove());
  }

  window.BALANG_AUTH={get user(){return state.user;},get token(){return state.token;},api,logout,showLogin,showChangePassword,subscribe:f=>{listeners.push(f);},authenticated:()=>!!state.user,isGuest};

  /* ---------- Khởi động ---------- */
  async function boot(){
    ensureShell();removeDemoControls();
    wrapRouting();
    setRole(null);                 // MẶC ĐỊNH: Khách
    closeGate();
    ensureDock();ensureTopButton();enforceGuestUI();
    const params=new URLSearchParams(location.search);
    const verify=params.get('verify-certificate')||params.get('verify')||(location.pathname.toLowerCase().includes('verify-certificate')?params.get('token'):null);
    const reset=params.get('reset-token')||(location.pathname.toLowerCase().includes('reset-password')?params.get('token'):null);
    if(verify){await verifyPublic(verify);return;}
    if(reset){try{history.replaceState(null,'',location.pathname);}catch{} showResetConfirm(reset);return;} // gỡ mã khỏi thanh địa chỉ
    if(state.token){
      try{await loadMe();return;}                       // chỉ khi MÁY CHỦ xác nhận phiên còn hiệu lực
      catch{state.token='';writeToken('');}
    }
    toGuest('',{silent:true});
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',boot);else boot();
})();
