/* THANH NIEN BA LANG V132 - account permission policy, certificate QR public flow */
(function(){
 'use strict';
 const role=()=>String(typeof currentRole!=='undefined'?currentRole:(window.currentRole||''));
 const isSecretary=()=>role()==='Bí thư';
 const mode=k=>{if(isSecretary())return 'edit';try{return typeof window.delegatedGrantMode==='function'?window.delegatedGrantMode(k):'none'}catch(_){return 'none'}};
 const granted=k=>mode(k)!=='none';
 const data=()=>typeof db!=='undefined'?db:(window.db||{});
 const pageAccess={
  dashboard:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],activities:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],
  members:['Bí thư','Phó Bí thư','Ủy viên BCH'],memberprofile:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],
  tasks:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],attendance:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],
  news:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],tradition:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],
  kpi:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],awards:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],
  bch:['Bí thư','Phó Bí thư','Ủy viên BCH'],surveys:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],media:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],
  accounts:['Bí thư'],audit:['Bí thư'],backup:['Bí thư'],reports:['Bí thư','Phó Bí thư'],notifications:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],
  public:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],feedback:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],
  certificates:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],honours:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên','Khách'],
  requests:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],finance:['Bí thư','Phó Bí thư','Ủy viên BCH','Đoàn viên'],periodbooks:['Bí thư','Phó Bí thư']
 };
 function canPage(p){
  if(p==='accounts'||p==='audit'||p==='backup')return isSecretary();
  if(p==='finance')return isSecretary()||granted('finance_view')||mode('finance_edit')==='edit';
  if(p==='requests')return isSecretary()||role()==='Đoàn viên'||(role()!=='Khách'&&(granted('requests_view')||mode('requests_approve')==='edit'));
  if(p==='certificates')return role()!=='Khách'&&!!pageAccess[p]?.includes(role());
  if(p==='members')return isSecretary()||granted('members_view');
  if(p==='reports')return isSecretary()||granted('reports');
  if(p==='bch')return isSecretary()||granted('bch_view');
  if(p==='periodbooks')return isSecretary()||granted('periodbooks_view');
  return !!pageAccess[p]?.includes(role());
 }
 const oldApply=window.applyRoleVisibility;
 window.applyRoleVisibility=function(){if(typeof oldApply==='function')try{oldApply.apply(this,arguments)}catch(e){};if(window.__BALANG_CERT_VERIFY__){document.querySelectorAll('#nav button[data-page]').forEach(b=>{b.hidden=true;b.style.display='none';b.setAttribute('aria-hidden','true')});return;}document.querySelectorAll('#nav button[data-page]').forEach(b=>{const ok=canPage(b.dataset.page);b.hidden=!ok;b.style.display=ok?'':'none';b.setAttribute('aria-hidden',ok?'false':'true');});if(!canPage(typeof page!=='undefined'?page:'dashboard')){if(typeof page!=='undefined')page=role()==='Khách'?'public':'dashboard';}};
 const oldShow=window.showPage;
 window.showPage=function(p){if(window.__BALANG_CERT_VERIFY__){if(typeof window.toast==='function')window.toast('Hãy trở về trang chủ công khai trước khi mở nội dung khác.');return false;}if(!canPage(p)){if(typeof window.toast==='function')window.toast('Bạn chưa được cấp quyền truy cập mục này.');return false;}if(p==='finance'){page=p;if(typeof window.setActive==='function')window.setActive();if(typeof window.render==='function')window.render();return true;}return oldShow.apply(this,arguments);};
 // Certificate register: Secretary sees all; every other authenticated role sees only the linked person's certificates.
 window.certificatesPage=function(){
  if(role()==='Khách')return '';
  const member=typeof window.demoMember==='function'?window.demoMember():null;
  const rows=isSecretary()?(data().certificates||[]):(data().certificates||[]).filter(c=>member&&String(c.memberId)===String(member.id));
  const esc=window.esc||((v)=>String(v??''));
  return `<div class="pagehead"><div><h1>Giấy chứng nhận điện tử</h1><p>Chỉ hiển thị giấy chứng nhận thuộc phạm vi tài khoản đang đăng nhập.</p></div>${isSecretary()?'<button class="btn primary" onclick="openCertificate()">＋ Tạo giấy chứng nhận</button>':''}</div><div class="feed">${rows.map(c=>`<article class="panel feedpost"><h2>${esc(c.title)}</h2><p>${esc(c.memberName||'')} · ${esc(c.year||'')}</p>${c.certificateFile?`<img src="${c.certificateFile}" alt="Giấy chứng nhận" style="max-width:100%;max-height:350px">`:''}<p>Mã xác minh: <code>${esc(c.code||'')}</code></p>${c.code?`<img alt="QR xác minh" style="width:140px;height:140px" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(location.href.split('#')[0]+'#certificate='+c.code)}">`:''}${isSecretary()?`<div class="actions"><button class="actionbtn" onclick="openCertificate('${esc(c.id)}')">Sửa</button><button class="actionbtn" onclick="deleteRecord('certificates','${esc(c.id)}','giấy chứng nhận')">Xóa</button></div>`:''}</article>`).join('')||'<div class="panel empty">Chưa có giấy chứng nhận thuộc tài khoản này.</div>'}</div>`;
 };
 // A QR verification URL is a one-certificate public view. Leaving it switches to Guest/public home and removes the certificate entry point.
 const oldPublicCertificate=window.renderPublicCertificate;
 window.renderPublicCertificate=function(code){
  window.__BALANG_CERT_VERIFY__=true;
  const matches=(data().certificates||[]).filter(x=>String(x.code)===String(code));
  const c=matches.length===1?matches[0]:null;
  document.querySelectorAll('#nav button').forEach(b=>{b.hidden=true;b.style.display='none';b.setAttribute('aria-hidden','true')});
  const esc=window.esc||((v)=>String(v??''));
  const content=document.getElementById('content');if(!content)return;
  const home=`${location.href.split('#')[0]}`;
  document.getElementById('crumb').textContent='Xác minh giấy chứng nhận';
  content.innerHTML=`<section class="publichero"><div><div class="eyebrow">THANH NIÊN BA LĂNG</div><h2>Xác minh giấy chứng nhận</h2><p>Trang công khai chỉ hiển thị giấy chứng nhận gắn với mã QR vừa quét.</p></div></section><section class="panel">${c?`<h2>${esc(c.title)}</h2><p>Người được chứng nhận: <b>${esc(c.memberName||'')}</b></p><p>Năm: ${esc(c.year||'')}</p>${c.certificateFile?`<img src="${c.certificateFile}" alt="Giấy chứng nhận" style="max-width:100%;max-height:600px">`:''}<p>Mã xác minh: ${esc(c.code||'')}</p>`:'<h2>Mã xác minh không hợp lệ</h2><p>Không tìm thấy giấy chứng nhận tương ứng.</p>'}<button class="btn primary" id="v132PublicHome">← Trở về trang chủ công khai</button></section>`;
  document.getElementById('v132PublicHome').onclick=function(){try{window.__BALANG_CERT_VERIFY__=false;if(typeof currentRole!=='undefined')currentRole='Khách';localStorage.setItem('balang_role','Khách');localStorage.removeItem('balang_current_account_id');localStorage.removeItem('balang_demo_name');if(typeof activeDemoName!=='undefined')activeDemoName='';if(typeof page!=='undefined')page='public';history.replaceState(null,'',home);if(typeof window.render==='function')window.render();}catch(e){location.href=home;}};
 };
 // When the QR route is loaded, renderPublicCertificate above takes over; the certificate menu stays unavailable to Guest afterwards.
 if(location.hash.startsWith('#certificate=')){if(typeof currentRole!=='undefined')currentRole='Khách';try{localStorage.setItem('balang_role','Khách')}catch(e){}}
 // Hide all page-local controls that are not granted in the account permission editor, without changing the account-management screen.
 const oldRender=window.render;
 function syncActionVisibility(){
  const canPerm=k=>{try{return typeof window.can==='function'?!!window.can(k):isSecretary()}catch(_){return isSecretary()}};
  const rules=[
   [/openActivity/, 'activities_edit'],
   [/deleteRecord\(['"]activities['"]/, 'activities_delete'],
   [/openBch|deleteRecord\(['"]bch['"]/, 'bch_edit'],
   [/openSurvey|deleteRecord\(['"]surveys['"]/, 'surveys_edit'],
   [/openNews|toggleNews/, 'news_edit'],[/deleteRecord\(['"]news['"]/, 'news_delete'],
   [/openTradition/, 'tradition_edit'],[/deleteRecord\(['"]tradition['"]/, 'tradition_delete'],
   [/openHonour|deleteRecord\(['"]honours['"]/, 'honours_edit'],
   [/openTask/, 'tasks_edit'],[/deleteRecord\(['"]tasks['"]/, 'tasks_delete'],
   [/openAward|deleteRecord\(['"]awards['"]/, 'awards_edit'],
   [/replyFeedback/, 'feedback_reply'],
   [/v128LibraryAdd|v128LibraryEdit|v128LibraryDelete/, 'library_edit'],
   [/v128LibraryApprove/, 'library_approve'],
   [/openCertificate|deleteRecord\(['"]certificates['"]/, '__secretary__'],
   [/openAccount|resetAccountPassword|deleteRecord\(['"]accounts['"]/, '__secretary__']
  ];
  document.querySelectorAll('button[onclick],a[onclick]').forEach(el=>{
   const code=el.getAttribute('onclick')||'';let required=null;
   for(const [pattern,key] of rules){if(pattern.test(code)){required=key;break;}}
   if(!required)return;
   const ok=required==='__secretary__'?isSecretary():canPerm(required);
   if(!ok){el.hidden=true;el.style.display='none';el.setAttribute('aria-hidden','true');}
  });
 }
 // UI hiding is paired with guards on the underlying mutation handlers.
 const oldDelete=window.deleteRecord;
 window.deleteRecord=function(collection,id,label){
  const required={activities:'activities_delete',members:'members_delete',tasks:'tasks_delete',news:'news_delete',tradition:'tradition_delete',bch:'bch_edit',surveys:'surveys_edit',awards:'awards_edit',honours:'honours_edit'}[collection];
  if(collection==='certificates'||collection==='accounts'){if(!isSecretary()){if(typeof window.toast==='function')window.toast('Chỉ Bí thư được thực hiện thao tác này.');return;}}
  else if(required&&!canPerm(required)){if(typeof window.toast==='function')window.toast('Bạn chưa được cấp quyền thực hiện thao tác này.');return;}
  return oldDelete.apply(this,arguments);
 };
 window.render=function(){const out=oldRender.apply(this,arguments);if(typeof window.applyRoleVisibility==='function')window.applyRoleVisibility();if(!window.__BALANG_CERT_VERIFY__)syncActionVisibility();return out;};
 window.__BALANG_V132_POLICY__={version:'132',canPage,grantMode:mode};
})();

