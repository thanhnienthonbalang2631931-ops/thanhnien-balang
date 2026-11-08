/* V134 - Giai doan 1: khoa lai cac quyen nhay cam theo quy tac da duoc Chu bi thu chot.
 * Day la lop bao ve giao dien/demo. Khong thay the phan quyen tai backend.
 */
(function(){
  'use strict';
  const role=()=>String(typeof currentRole!=='undefined'?currentRole:(window.currentRole||''));
  const isSecretary=()=>role()==='Bí thư';
  const isGuest=()=>role()==='Khách';
  const arr=v=>Array.isArray(v)?v:[];
  const esc=v=>typeof window.esc==='function'?window.esc(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const save=()=>typeof window.save==='function'?window.save():localStorage.setItem('balang_db',JSON.stringify(db));
  const personalMember=()=>{
    try{
      const id=localStorage.getItem('balang_current_account_id');
      const account=arr(db.accounts).find(a=>String(a.id)===String(id));
      if(account&&account.memberId){const linked=arr(db.members).find(m=>String(m.id)===String(account.memberId));if(linked)return linked;}
    }catch(_){}
    return typeof window.demoMember==='function'?window.demoMember():null;
  };
  const ownRequest=r=>{const m=personalMember();return !!m&&String(r.memberId)===String(m.id);};

  if(typeof permissionCatalog!=='undefined'&&Array.isArray(permissionCatalog)){
    for(let i=permissionCatalog.length-1;i>=0;i--)if(['finance_view','finance_edit','requests_view','requests_approve'].includes(permissionCatalog[i][1]))permissionCatalog.splice(i,1);
  }
  const priorCan=window.can;
  window.can=function(permission){
    if(['finance_view','finance_edit','requests_view','requests_approve'].includes(permission))return isSecretary();
    return typeof priorCan==='function'?priorCan.apply(this,arguments):isSecretary();
  };
  const priorGrantMode=window.delegatedGrantMode;
  window.delegatedGrantMode=function(permission){
    if(['finance_view','finance_edit','requests_view','requests_approve'].includes(permission))return isSecretary()?'edit':'none';
    return typeof priorGrantMode==='function'?priorGrantMode.apply(this,arguments):'none';
  };
  window.explicitlyGranted=function(permission){
    if(['finance_view','finance_edit','requests_view','requests_approve'].includes(permission))return isSecretary();
    return isSecretary()||(typeof window.delegatedGrantMode==='function'&&window.delegatedGrantMode(permission)!=='none');
  };

  const priorVisibility=window.applyRoleVisibility;
  window.applyRoleVisibility=function(){
    if(typeof priorVisibility==='function')priorVisibility.apply(this,arguments);
    document.querySelectorAll('#nav button[data-page="finance"]').forEach(b=>{b.hidden=!isSecretary();b.style.display=isSecretary()?'':'none';});
    document.querySelectorAll('#nav button[data-page="requests"]').forEach(b=>{const ok=!isGuest();b.hidden=!ok;b.style.display=ok?'':'none';});
  };
  const priorShow=window.showPage;
  window.showPage=function(p){
    if(p==='finance'&&!isSecretary()){toast('Chỉ Bí thư được xem và quản lý thu/chi.');return false;}
    if(p==='requests'){
      if(isGuest()){toast('Khách không được truy cập mục Xin phép.');return false;}
      page='requests';if(typeof window.setActive==='function')window.setActive();if(typeof window.render==='function')window.render();return true;
    }
    return typeof priorShow==='function'?priorShow.apply(this,arguments):false;
  };

  window.openRequestForm=function(kind){
    if(isGuest())return toast('Khách không được gửi yêu cầu nội bộ.');
    if(!['busy','absence','transfer'].includes(kind))return;
    const member=personalMember();
    if(!member)return toast('Tài khoản demo chưa được liên kết với hồ sơ cá nhân. Hãy liên kết hồ sơ trước khi gửi yêu cầu.');
    const title=kind==='busy'?'Báo bận không tham gia hoạt động':kind==='absence'?'Xin phép vắng hoạt động':'Thông báo thời gian không tham gia sinh hoạt hè';
    const activities=arr(db.activities);
    const activityOptions=activities.map(a=>a.id+' — '+a.name+' ('+(a.date||'')+')');
    let body='';
    if(kind!=='transfer')body+=selectField('Hoạt động','activity',activityOptions,activityOptions[0]||'',true);
    if(kind==='transfer')body+=selectField('Nội dung thông báo','transferType',['Chuyển sinh hoạt hè về Chi đoàn','Về quê / đi xa trong thời gian hè','Chuyển sinh hoạt đến đơn vị khác','Thông báo khác'],'Chuyển sinh hoạt hè về Chi đoàn',true)+field('Từ ngày','startDate','','date',true)+field('Dự kiến đến ngày','endDate','','date',false);
    body+=field('Lý do / nội dung','reason','','textarea',true,true)+field('Thông tin bổ sung','details','','textarea',false,true);
    modal(title,'<div class="notice">Hồ sơ gửi yêu cầu: <b>'+esc(member.name)+'</b></div>'+body,f=>{
      const activityValue=f.get('activity')||'';const activityId=activityValue?activityValue.split(' — ')[0]:'';const activity=activities.find(a=>String(a.id)===String(activityId));
      if(kind!=='transfer'&&!activity)return toast('Vui lòng chọn hoạt động.');
      const reason=String(f.get('reason')||'').trim();if(!reason)return toast('Vui lòng nhập lý do / nội dung.');
      const rec={id:'YC'+Date.now(),memberId:member.id,memberName:member.name,type:kind==='busy'?'Báo bận khi đăng ký hoạt động':kind==='absence'?'Xin phép vắng hoạt động':String(f.get('transferType')||'Thông báo khác'),activityId:activity?.id||'',activityName:activity?.name||'',date:kind==='transfer'?String(f.get('startDate')||''):(activity?.date||''),endDate:String(f.get('endDate')||''),reason,details:String(f.get('details')||''),status:'Chờ duyệt',createdAt:typeof fmtDT==='function'?fmtDT(new Date().toISOString()):new Date().toISOString(),reviewer:'',reviewedAt:'',reviewNote:''};
      db.requests=arr(db.requests);db.requests.push(rec);
      if(kind==='busy'&&activity){activity.attendees=activity.attendees||{};activity.attendees[member.id]='Bận không tham gia';activity.absenceRequests=activity.absenceRequests||{};activity.absenceRequests[member.id]=rec.id;}
      if(typeof window.logAction==='function')window.logAction('Gửi yêu cầu '+rec.type,member.name+' · '+(activity?.name||''));
      save();if(typeof window.closeModal==='function')window.closeModal();if(typeof window.render==='function')window.render();toast('Đã gửi yêu cầu. Chỉ Bí thư có quyền xem và xử lý.');
    },'Gửi yêu cầu');
  };

  const priorOpenRegistration=window.openRegistration;
  window.openRegistration=function(activityId){
    if(isGuest())return toast('Khách không được đăng ký hoạt động nội bộ.');
    if(isSecretary())return typeof priorOpenRegistration==='function'?priorOpenRegistration.apply(this,arguments):false;
    const member=personalMember();
    if(!member)return toast('Tài khoản demo chưa được liên kết với hồ sơ cá nhân.');
    const activity=arr(db.activities).find(a=>String(a.id)===String(activityId));
    if(!activity)return toast('Không tìm thấy hoạt động.');
    if(typeof window.registrationClosed==='function'&&window.registrationClosed(activity))return toast('Đã hết hạn đăng ký hoạt động.');
    modal('Đăng ký / báo bận hoạt động','<div class="field full"><b>'+esc(activity.name)+'</b><p class="muted small">Hồ sơ: '+esc(member.name)+'</p></div>'+selectField('Phản hồi','response',['Đăng ký tham gia','Bận không tham gia'],activity.attendees?.[member.id]||'Đăng ký tham gia',true)+field('Lý do (bắt buộc nếu báo bận)','reason','','textarea',false,true),f=>{
      const response=String(f.get('response')||'');const reason=String(f.get('reason')||'').trim();
      if(response==='Bận không tham gia'&&!reason)return toast('Vui lòng nhập lý do báo bận.');
      activity.attendees=activity.attendees||{};activity.attendees[member.id]=response;
      if(response==='Bận không tham gia'){
        const rec={id:'YC'+Date.now(),memberId:member.id,memberName:member.name,type:'Báo bận khi đăng ký hoạt động',activityId:activity.id,activityName:activity.name,date:activity.date||'',reason,details:'',status:'Chờ duyệt',createdAt:typeof fmtDT==='function'?fmtDT(new Date().toISOString()):new Date().toISOString(),reviewer:'',reviewedAt:'',reviewNote:''};
        db.requests=arr(db.requests);db.requests.push(rec);activity.absenceRequests=activity.absenceRequests||{};activity.absenceRequests[member.id]=rec.id;
      }
      if(typeof window.logAction==='function')window.logAction('Phản hồi đăng ký hoạt động',member.name+' · '+activity.name+' · '+response);
      save();if(typeof window.closeModal==='function')window.closeModal();if(typeof window.render==='function')window.render();toast(response==='Bận không tham gia'?'Đã gửi báo bận, chờ Bí thư xem xét.':'Đã ghi nhận đăng ký tham gia.');
    },'Gửi phản hồi');
  };

  const priorRender=window.render;
  window.render=function(){
    const result=typeof priorRender==='function'?priorRender.apply(this,arguments):undefined;
    if(page==='requests'){
      const rows=isSecretary()?arr(db.requests):arr(db.requests).filter(ownRequest);
      const controls=isSecretary()?'<div class="toolbar"><select id="v134RequestFilter" onchange="document.querySelectorAll(\'#v134RequestRows tr\').forEach(r=>r.hidden=!!this.value&&r.dataset.status!==this.value)"><option value="">Tất cả trạng thái</option><option>Chờ duyệt</option><option>Đã đồng ý</option><option>Không đồng ý</option></select></div>':'';
      const tr=rows.slice().reverse().map(r=>'<tr data-status="'+esc(r.status||'')+'"><td>'+esc(r.memberName||'')+'</td><td>'+esc(r.type||'')+'</td><td>'+esc(r.activityName||'—')+'<div class="muted small">'+esc(r.date||'')+'</div></td><td>'+esc(r.reason||'')+'</td><td>'+esc(r.status||'')+'</td><td>'+esc(r.reviewNote||'—')+'</td><td>'+(isSecretary()&&['Chờ duyệt','Chờ tiếp nhận'].includes(r.status)?'<button class="actionbtn" onclick="reviewRequest(\''+esc(r.id)+'\',\'approve\')">Đồng ý</button> <button class="actionbtn" onclick="reviewRequest(\''+esc(r.id)+'\',\'reject\')">Không đồng ý</button>':'—')+'</td></tr>').join('');
      const box=document.getElementById('content');
      if(box)box.innerHTML='<div class="pagehead"><div><h1>Xin phép</h1><p>'+(isSecretary()?'Danh sách yêu cầu của toàn Chi đoàn.':'Chỉ hiển thị yêu cầu do tài khoản của bạn gửi.')+'</p></div><div><button class="btn primary" onclick="openRequestForm(\'absence\')">＋ Xin phép vắng</button> <button class="btn" onclick="openRequestForm(\'transfer\')">＋ Thông báo thời gian</button></div></div>'+controls+'<div class="panel"><div class="tablewrap"><table><thead><tr><th>Người gửi</th><th>Loại yêu cầu</th><th>Hoạt động / thời gian</th><th>Lý do</th><th>Trạng thái</th><th>Phản hồi</th><th>Thao tác</th></tr></thead><tbody id="v134RequestRows">'+(tr||'<tr><td colspan="7" class="empty">Chưa có yêu cầu nào trong phạm vi tài khoản.</td></tr>')+'</tbody></table></div></div>';
    }
    if(typeof window.applyRoleVisibility==='function')window.applyRoleVisibility();
    return result;
  };
  const priorReview=window.reviewRequest;
  window.reviewRequest=function(id,decision){if(!isSecretary()){toast('Chỉ Bí thư được xem và duyệt đơn xin phép.');return false;}return typeof priorReview==='function'?priorReview.apply(this,arguments):false;};
  window.commentRequest=function(){if(!isSecretary()){toast('Chỉ Bí thư được xem và xử lý danh sách đơn xin phép.');return false;}return false;};

  const priorCertificates=window.certificatesPage||(typeof certificatesPage==='function'?certificatesPage:null);
  const safeCertificates=function(){if(isGuest())return '<div class="empty">Giấy chứng nhận chỉ được xác minh qua mã QR riêng của từng giấy.</div>';return typeof priorCertificates==='function'?priorCertificates.apply(this,arguments):'';};
  window.certificatesPage=safeCertificates;
  if(typeof certificatesPage==='function')certificatesPage=safeCertificates;

  window.__BALANG_V134_G1__={version:'134-G1',policy:'secretary-only-finance-and-request-review; own-request-scope; no-guest-certificate-list'};
})();
