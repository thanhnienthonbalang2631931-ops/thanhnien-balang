/* V131: activity workflow stabilization + account/permission UX safeguards.
   This is a browser-local demo patch; server-side authentication is not provided here. */
(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  // V131 reliability: initialize shared activity filter before any legacy renderer reads it.
  if(typeof window.activityFilter!=='string') window.activityFilter='Tất cả';
  var activityFilter = window.activityFilter;
  const safe = v => typeof esc==='function' ? esc(v==null?'':String(v)) : String(v??'');
  function ensureCollections(){
    ['activities','notifications','accounts','members','attendance','userGrants','auditLog'].forEach(k=>{
      if(!db[k]) db[k] = k==='userGrants'?{}:[];
    });
  }
  function activityCanEdit(){return currentRole==='Bí thư'||(typeof can==='function'&&can('activities_edit'));}
  function activityCanDelete(){return currentRole==='Bí thư'||(typeof can==='function'&&can('activities_delete'));}
  window.openActivity=function(id=''){
    ensureCollections();
    if(!activityCanEdit()) return toast('Bạn chưa được cấp quyền tạo hoặc sửa hoạt động.');
    const old=db.activities.find(x=>String(x.id)===String(id))||{};
    if(id&&!old.id) return toast('Không tìm thấy hoạt động cần chỉnh sửa.');
    const members=db.members.map(m=>`<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 10px 4px 0"><input type="checkbox" name="v131RequiredMember" value="${safe(m.id)}" ${(old.requiredMembers||[]).includes(m.id)?'checked':''}>${safe(m.name)}</label>`).join('');
    const body=
      field('Tên hoạt động','name',old.name||'','text',true,true)+
      organizerOptions(old.organizer||'')+
      selectField('Trạng thái','status',['Dự kiến','Đang mở đăng ký','Đang diễn ra','Đã hoàn thành','Hoãn','Hủy'],old.status||'Đang mở đăng ký')+
      field('Ngày tổ chức','date',old.date||new Date().toISOString().slice(0,10),'date',true)+
      field('Giờ bắt đầu','time',old.time||'08:00','time',true)+
      field('Giờ kết thúc','endTime',old.endTime||'','time')+
      field('Địa điểm','place',old.place||'','text',true)+
      field('Hạn đăng ký','registrationEndAt',old.registrationEndAt||'','datetime-local')+
      selectField('Đối tượng bắt buộc','requiredMode',['Tất cả đoàn viên phải đi','Chỉ một số đoàn viên phải đi'],old.requiredMode||'Tất cả đoàn viên phải đi')+
      `<div class="field full" id="v131RequiredBox" style="${old.requiredMode==='Chỉ một số đoàn viên phải đi'?'':'display:none'}"><label>Chọn đoàn viên</label><div style="max-height:150px;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:9px">${members||'<span class="muted">Chưa có hồ sơ đoàn viên; bạn có thể bổ sung sau.</span>'}</div></div>`+
      field('Trang phục','uniform',old.uniform||'','text')+
      field('Dụng cụ / vật tư','equipment',old.equipment||'','textarea',false,true)+
      field('Người phụ trách','owner',old.owner||'','text')+
      field('Mô tả hoạt động','description',old.description||'','textarea',false,true);
    modal(old.id?'Chỉnh sửa hoạt động':'Tạo hoạt động mới',body,function(f){
      const name=String(f.get('name')||'').trim(),date=String(f.get('date')||''),time=String(f.get('time')||'');
      if(!name) return toast('Vui lòng nhập tên hoạt động.');
      if(!date||!time) return toast('Vui lòng chọn ngày và giờ tổ chức.');
      let organizer=f.get('organizer')||'Chi đoàn tổ chức';
      if(['Đơn vị khác','Phối hợp tổ chức'].includes(organizer)) organizer=String(f.get('organizerOther')||'').trim()||organizer;
      const o={name,organizer,status:f.get('status'),date,time,endTime:f.get('endTime'),place:String(f.get('place')||'').trim(),registrationEndAt:f.get('registrationEndAt'),requiredMode:f.get('requiredMode'),uniform:f.get('uniform'),equipment:f.get('equipment'),owner:f.get('owner'),description:f.get('description'),updatedAt:new Date().toISOString()};
      o.requiredMembers=[...document.querySelectorAll('input[name="v131RequiredMember"]:checked')].map(x=>x.value);
      if(o.requiredMode==='Tất cả đoàn viên phải đi') o.requiredMembers=db.members.map(m=>m.id);
      if(old.id){Object.assign(old,o)}else{
        o.id='HD'+Date.now().toString(36).toUpperCase();o.attendees={};o.createdAt=o.updatedAt;db.activities.push(o);
        db.notifications.unshift({id:'TB'+Date.now().toString(36).toUpperCase(),title:'Mời đăng ký: '+name,body:`${date} · ${time} · ${o.place}. Vui lòng vào mục Hoạt động để phản hồi.`,date:new Date().toISOString().slice(0,10),target:'Toàn Chi đoàn',audience:'Toàn Chi đoàn',activityId:o.id,read:false,sender:activeDemoName||currentRole});
      }
      if(typeof logAction==='function') logAction(old.id?'Sửa hoạt động':'Tạo hoạt động',name);
      const saved=save();
      if(saved===false) return;
      closeModal();render();toast(old.id?'Đã cập nhật hoạt động.':'Đã tạo hoạt động và lưu thông báo.');
    });
    const mode=$('#modalForm select[name="requiredMode"]');
    if(mode) mode.addEventListener('change',()=>{const box=$('#v131RequiredBox');if(box)box.style.display=mode.value==='Chỉ một số đoàn viên phải đi'?'':'none'});
  };
  window.activitiesPage=function(){
    ensureCollections();
    const list=db.activities.filter(a=>(window.activityFilter==='Tất cả'||a.organizer===window.activityFilter));
    const add=activityCanEdit()?btn('＋ Tạo hoạt động','openActivity()','primary'):'';
    return head('Hoạt động & đăng ký','Tạo, chỉnh sửa, theo dõi đăng ký và quản lý hoạt động Chi đoàn.',add)+
      `<div class="panel"><div class="toolbar"><div class="search"><input id="activitySearch" placeholder="Tìm tên hoạt động, địa điểm..." oninput="filterActivityRows()"></div><select id="organizerFilter" onchange="window.activityFilter=this.value;render()"><option>Tất cả</option>${[...new Set(list.map(a=>a.organizer).filter(Boolean))].map(x=>`<option>${safe(x)}</option>`).join('')}</select></div><div class="tablewrap"><table><thead><tr><th>Hoạt động</th><th>Ngày giờ</th><th>Đơn vị</th><th>Đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="activityRows">${list.map(a=>{const yes=Object.values(a.attendees||{}).filter(v=>v==='Đăng ký tham gia').length;const no=Object.values(a.attendees||{}).filter(v=>v==='Bận không tham gia').length;let actions=`<button class="actionbtn" onclick="viewActivityInfo('${safe(a.id)}')">Xem</button>`;if(activityCanEdit())actions+=` <button class="actionbtn" onclick="openActivity('${safe(a.id)}')">Sửa</button>`;if(activityCanDelete())actions+=` <button class="actionbtn danger" onclick="deleteRecord('activities','${safe(a.id)}','hoạt động')">Xóa</button>`;return `<tr data-search="${safe((a.name+' '+a.place+' '+a.organizer).toLowerCase())}"><td><b>${safe(a.name)}</b><div class="muted small">${safe(a.place||'')}</div></td><td>${safe(a.date||'')} ${safe(a.time||'')}</td><td>${safe(a.organizer||'—')}</td><td>${yes} tham gia · ${no} bận</td><td>${typeof pill==='function'?pill(a.status||'Dự kiến'):safe(a.status)}</td><td><div class="actions">${actions}</div></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Chưa có hoạt động. Bấm “Tạo hoạt động” để bắt đầu.</td></tr>'}</tbody></table></div></div>`;
  };
  window.filterActivityRows=function(){const q=($('#activitySearch')?.value||'').toLowerCase();document.querySelectorAll('#activityRows tr[data-search]').forEach(r=>r.style.display=r.dataset.search.includes(q)?'':'none')};
  // Make activity navigation and render resilient after all legacy extensions load.
  const priorShow=window.showPage;
  window.showPage=function(p){if(p==='activities'&&!(rolePagePermissions[currentRole]||[]).includes('activities')&&currentRole!=='Bí thư')return toast('Vai trò hiện tại không được truy cập hoạt động.');return priorShow(p)};
  ensureCollections();
  // Keep the global binding available to legacy classic scripts and inline onchange handlers.
  try { if(typeof window.activityFilter!=='string') window.activityFilter='Tất cả'; } catch(_) {}
  window.__BALANG_V131__={version:'131.1',activityCreateEditDelete:true,accountsMode:'demo-local-only',activityFilterInitialized:true};
})();
