/* Blank project tracker template; all writes secured by Supabase RLS. */
(() => {
'use strict';
const db=window.supabase?.createClient('https://epqbivhfjdnmcwivogah.supabase.co','sb_publishable_zoBBu3ha4ICyFIK6znarhA_xQpuxmeU');
const P='tracker_custom_projects', W='tracker_custom_weeks', T='tracker_custom_tasks';
const E='tracker_custom_evidence', BUCKET='fitm-evidence';
const MAX_IMAGE_BYTES=5*1024*1024;
const ALLOWED_IMAGE_TYPES={ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
let evidence=[],signedEvidence=new Map();
let passwordFlow=/(?:[?&#])type=(?:invite|recovery)(?:&|$)/.test(location.hash + location.search);
const labels={not_started:'ยังไม่เริ่ม',in_progress:'กำลังดำเนินการ',completed:'เสร็จแล้ว'};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const accepted=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
const affected=result=>{const rows=accepted(result);if(!rows?.length)throw new Error('ไม่พบข้อมูลหรือไม่มีสิทธิ์แก้ไข');return rows[0];};
const completed=rows=>rows.filter(r=>r.status==='completed').length;
const percent=rows=>rows.length?Math.round(completed(rows)*100/rows.length):0;
let projects=[],weeks=[],tasks=[],projectId=new URLSearchParams(location.search).get('project')||'',weekId='';
let user=null,editor=false,ready=false,busy=false,expanded=false,editingProject=false,editingWeek='',editingTask='';
let request=0,reloadHandle;
const currentProject=()=>projects.find(p=>p.id===projectId);
const currentWeek=()=>weeks.find(w=>w.id===weekId);
const perWeek=id=>tasks.filter(t=>t.week_id===id);
const canEdit=()=>Boolean(ready&&user&&editor&&!busy);
const tell=(message,error=false)=>{$('feedback').textContent=message;$('feedback').classList.toggle('error',error);};
const ensure=()=>{if(!canEdit())throw new Error('บัญชีของคุณยังไม่ได้รับสิทธิ์ Editor');};
function permissions(){
 const on=canEdit(),hasProject=Boolean(currentProject()),hasWeek=Boolean(currentWeek());
 for(const [id,ok] of [
 ['toggleProject',on],['renameProject',on&&hasProject],['addWeek',on&&hasProject],
 ['addTenWeeks',on&&hasProject&&weeks.length<(currentProject()?.planned_weeks||0)],['editWeek',on&&hasWeek],
 ['deleteWeek',on&&hasWeek],['addTask',on&&hasWeek]
 ])$(id).disabled=!ok;
 $('loginForm').hidden=Boolean(user);$('signedIn').hidden=!user;
 $('passwordForm').hidden=!(user&&passwordFlow);
 $('togglePassword').hidden=!user;
 $('whoami').textContent=user?.email||'';
 $('editorRole').textContent=user?(editor?'· Editor · แก้ไขข้อมูลส่วนกลางได้':'· Viewer · ยังไม่ได้รับสิทธิ์แก้ไข'):'';
}
function renderProjects(){
 const select=$('projectSelect');
 select.innerHTML=projects.length?projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+(p.slug==='coopconnect-original'?' · ขอบเขตต้นฉบับ':'')+'</option>').join(''):'<option value="">ยังไม่มีโปรเจกต์</option>';
 select.value=projectId||'';
 $('projectSummary').textContent=currentProject()?
 (currentProject().description||'ยังไม่ระบุคำอธิบาย')+' · '+weeks.length+' / '+(currentProject().planned_weeks||0)+' สัปดาห์ · '+tasks.length+' ข้อ'
 :'ยังไม่มีโปรเจกต์ · ผู้ได้รับสิทธิ์ Editor สามารถสร้างโปรเจกต์ใหม่จาก Template นี้ได้';
}
function renderStats(){
 $('weekCount').textContent=weeks.length;$('totalCount').textContent=tasks.length;
 $('notStarted').textContent=tasks.filter(t=>t.status==='not_started').length;
 $('inProgress').textContent=tasks.filter(t=>t.status==='in_progress').length;
 $('completed').textContent=completed(tasks);
 $('overallProgress').textContent=percent(tasks)+'%';
}
function renderWeeks(){
 $('weeks').innerHTML=weeks.length?weeks.map(w=>{
  const list=perWeek(w.id),rate=percent(list);
  return '<button type="button" class="week '+(w.id===weekId?'active':'')+'" data-week="'+esc(w.id)+'" aria-pressed="'+(w.id===weekId)+'">'+
  '<span class="small">สัปดาห์ที่ '+w.position+' · '+list.length+' ข้อ</span><strong>'+esc(w.title)+'</strong>'+
  '<div class="mini"><span style="width:'+rate+'%"></span></div>'+
  '<span class="small">เสร็จแล้ว '+completed(list)+'/'+list.length+' · '+rate+'%</span></button>';
 }).join(''):'<div class="empty">ยังไม่มีสัปดาห์ · กดเพิ่มสัปดาห์เพื่อเริ่ม</div>';
}
function renderFilters(){
 const filter=$('roleFilter'),old=filter.value;
 const roles=[...new Set(perWeek(weekId).map(t=>t.role).filter(Boolean))].sort();
 filter.innerHTML='<option value="all">ทุกบทบาท</option>'+roles.map(role=>'<option value="'+esc(role)+'">'+esc(role)+'</option>').join('');
 filter.value=roles.includes(old)?old:'all';
}

function evidenceMarkup(t){
  const rows=evidence.filter(row=>row.task_id===t.id);
  const count=rows.length;
  const listing=rows.map(row=>{
    const url=signedEvidence.get(row.id);
    if(!url) return '<div class="evidence-item"><p>ไม่สามารถเปิดภาพนี้ได้</p></div>';
    return '<div class="evidence-item">'+
      '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="เปิดรูปขนาดเต็ม">'+
      '<img src="'+esc(url)+'" alt="'+esc(row.caption||row.file_name)+'" loading="lazy"></a>'+
      '<p>'+esc(row.caption||row.file_name)+'</p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">ดูภาพเต็ม</a>'+
      (canEdit()?'<button type="button" class="btn danger" data-delete-evidence="'+esc(row.id)+'">ลบรูป</button>':'')+
    '</div>';
  }).join('');
  return '<section class="task-evidence"><h4>รูปภาพหลักฐาน ('+count+')</h4>'+
    (!user?'<p class="evidence-note">กรุณาเข้าสู่ระบบเพื่อดูหลักฐานภาพ (Storage เป็น Private)</p>':
      '<div class="evidence-grid">'+listing+'</div>')+
    (canEdit()?'<label class="upload-field">เพิ่มรูปหลักฐาน JPG/PNG/WebP (รูปละไม่เกิน 5 MB)'+
      '<input data-evidence-upload="'+esc(t.id)+'" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>'+
      '<label class="upload-field">คำอธิบายรูป <input data-evidence-caption="'+esc(t.id)+'" type="text" maxlength="500" placeholder="เช่น หน้าเข้าสู่ระบบที่ทดสอบแล้ว"></label>':'')+
  '</section>';
}
function card(t){
 const attr=canEdit()?'':' disabled';
 const options=Object.entries(labels).map(([value,label])=>'<option value="'+value+'"'+(t.status===value?' selected':'')+'>'+label+'</option>').join('');
 const description=esc(t.description||'ยังไม่ได้ระบุรายละเอียด');
 const details=Array.isArray(t.details)?t.details:[];
 const bulletHtml=details.length?'<ul class="task-details-list">'+details.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'';
 const preview=details.length?'<ul class="task-details-list">'+details.slice(0,3).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'';
 return '<article class="task" data-task="'+esc(t.id)+'">'+
 '<div class="task-top"><div class="task-left"><span class="task-badge">'+esc(t.reference||'ไม่มีเลขข้อ')+'</span>'+
 '<div class="task-title">'+esc(t.title)+'</div><span class="role"><b>บทบาท:</b> '+esc(t.role||'ยังไม่ระบุ')+'</span></div>'+
 '<label class="status-control">สถานะ<select data-status="'+esc(t.id)+'"'+attr+'>'+options+'</select></label></div>'+
 '<div class="scope scope-preview"><b>รายละเอียดขอบเขต</b><p class="task-description'+(expanded?'':' preview')+'">'+description+'</p>'+preview+'</div>'+
 '<details class="details"'+(expanded?' open':'')+'><summary>อ่านรายละเอียดทั้งหมด / โน้ต</summary><p class="task-description">'+description+'</p>'+bulletHtml+evidenceMarkup(t)+
 '<div class="task-note"><label>โน้ตความคืบหน้า</label><textarea data-note="'+esc(t.id)+'" maxlength="10000"'+attr+'>'+
 esc(t.note||'')+'</textarea><div class="actions"><button type="button" class="btn primary" data-save-note="'+esc(t.id)+'"'+attr+'>บันทึกโน้ต</button></div></div></details>'+
 '<div class="task-commands"><button type="button" class="btn" data-edit-task="'+esc(t.id)+'"'+attr+'>แก้ไขข้อ / ย้ายสัปดาห์</button>'+
 '<button type="button" class="btn danger" data-delete-task="'+esc(t.id)+'"'+attr+'>ลบข้อ</button></div>'+
 '<div class="current-status">สถานะปัจจุบัน: <b>'+esc(labels[t.status]||labels.not_started)+'</b></div></article>';
}
function renderTasks(){
 const term=$('search').value.trim().toLocaleLowerCase(),s=$('statusFilter').value,r=$('roleFilter').value;
 const list=perWeek(weekId),visible=list.filter(t=>
  (s==='all'||t.status===s)&&(r==='all'||t.role===r)&&
  [t.reference,t.title,t.description,t.role].join(' ').toLocaleLowerCase().includes(term)
 );
 $('tasks').innerHTML=visible.length?visible.map(card).join(''):'<div class="empty">'+
  (list.length?'ไม่พบข้อที่ตรงกับตัวกรอง':'ยังไม่มีข้อ / งาน · กด + เพิ่มข้อ / งาน')+'</div>';
}
function renderActive(){
 const w=currentWeek();
 $('weekArea').hidden=!w;$('emptyProject').hidden=!!w;
 if(!w){$('emptyProject').textContent=currentProject()?'โปรเจกต์นี้ยังไม่มีสัปดาห์ · เพิ่มสัปดาห์เพื่อเริ่มต้น':'โปรดสร้างโปรเจกต์ใหม่เพื่อเริ่มต้น';return;}
 const list=perWeek(w.id),rate=percent(list);
 $('weekTitle').textContent='สัปดาห์ที่ '+w.position+' — '+w.title;
 $('weekSummary').textContent='งานทั้งหมด '+list.length+' ข้อ · เสร็จแล้ว '+completed(list)+' ข้อ · ความคืบหน้า '+rate+'%';
 $('weekProgress').textContent=rate+'% (เสร็จแล้ว '+completed(list)+'/'+list.length+')';
 $('weekGoal').textContent=w.goal||'';$('weekTogether').textContent=w.together||'';
 $('weekDeliverable').textContent=w.deliverable||'';$('weekBar').style.width=rate+'%';
 renderFilters();renderTasks();
}
function render(){renderProjects();renderStats();renderWeeks();renderActive();permissions();}
async function load(){
 if(!db){ready=false;$('connection').textContent='โหลด Supabase SDK ไม่สำเร็จ';render();return;}
 const ticket=++request;
 try{
  const p=accepted(await db.from(P).select('id,name,description,planned_weeks,slug,created_at').order('created_at',{ascending:false}).limit(200));
  if(ticket!==request)return;projects=p||[];
  if(!currentProject())projectId=projects.find(p=>p.slug==='coopconnect-original')?.id||projects[0]?.id||'';
  history.replaceState(null,'',location.pathname+(projectId?'?project='+encodeURIComponent(projectId):''));
  const w=projectId?accepted(await db.from(W).select('*').eq('project_id',projectId).order('position',{ascending:true}).limit(500)):[];
  if(ticket!==request)return;weeks=w||[];
  if(!currentWeek())weekId=weeks[0]?.id||'';
  const t=weeks.length?accepted(await db.from(T).select('*').in('week_id',weeks.map(x=>x.id)).order('position',{ascending:true}).limit(4000)):[];
  if(ticket!==request)return;tasks=t||[];
  await loadEvidence();
  if(ticket!==request)return;
  ready=true;$('connection').textContent='เชื่อมต่อ Supabase แล้ว · ข้อมูลโปรเจกต์และงานใช้ร่วมกัน';render();
 }catch(e){
  ready=false;$('connection').textContent='ยังโหลด Template ไม่ได้ · ตรวจว่าได้รันไฟล์ SQL สำหรับ Template แล้ว';
  tell(e.message,true);permissions();
 }
}

async function loadEvidence(){
 evidence=[];signedEvidence.clear();
 if(!user||!tasks.length)return;
 const ids=tasks.map(t=>t.id);
 const result=await db.from(E).select('id,task_id,file_path,file_name,mime_type,bytes,caption,created_at')
   .in('task_id',ids).order('created_at',{ascending:false}).limit(2000);
 if(result.error){tell('ไม่สามารถโหลดรายการหลักฐาน: '+result.error.message,true);return;}
 evidence=result.data||[];
 for(const row of evidence){
   const signed=await db.storage.from(BUCKET).createSignedUrl(row.file_path,900);
   if(!signed.error&&signed.data?.signedUrl)signedEvidence.set(row.id,signed.data.signedUrl);
 }
}
async function uploadEvidence(input){
 if(!canEdit())throw Error('ไม่มีสิทธิ์เพิ่มรูป');
 const taskId=input.dataset.evidenceUpload;
 if(!tasks.some(t=>t.id===taskId))throw Error('ไม่พบข้อกำหนด');
 const fileList=[...input.files];
 if(!fileList.length)return;
 const captionInput=input.closest('.task').querySelector('[data-evidence-caption]');
 const caption=(captionInput?.value||'').trim();
 if(caption.length>500)throw Error('คำอธิบายยาวเกิน 500 ตัวอักษร');
 if(evidence.filter(r=>r.task_id===taskId).length+fileList.length>30)throw Error('จำกัดไม่เกิน 30 รูปต่อข้อ');
 for(const file of fileList){
   if(!ALLOWED_IMAGE_TYPES[file.type])throw Error('รองรับเฉพาะ JPG, PNG, WebP');
   if(!file.size||file.size>MAX_IMAGE_BYTES)throw Error('รูปต้องมีขนาด 1 byte ถึง 5 MB');
 }
 busy=true;permissions();tell('กำลังอัปโหลดรูปภาพ '+fileList.length+' รูป…');
 try{
   for(const file of fileList){
     const filePath=taskId+'/'+crypto.randomUUID()+'.'+ALLOWED_IMAGE_TYPES[file.type];
     const stored=await db.storage.from(BUCKET).upload(filePath,file,{
       contentType:file.type,cacheControl:'3600',upsert:false
     });
     accepted(stored);
     const inserted=await db.from(E).insert({
       task_id:taskId,file_path:filePath,file_name:file.name.slice(0,250),
       mime_type:file.type,bytes:file.size,caption,uploaded_by:user.id
     });
     if(inserted.error){
       await db.storage.from(BUCKET).remove([filePath]);
       throw new Error('บันทึกข้อมูลหลักฐานไม่สำเร็จ: '+inserted.error.message);
     }
   }
   await loadEvidence();
   render();
   tell('บันทึกหลักฐาน '+fileList.length+' รูปลง Supabase แล้ว');
 }finally{busy=false;render();}
}
async function deleteEvidence(id){
 ensure();
 const row=evidence.find(x=>x.id===id);
 if(!row)throw Error('ไม่พบรูป');
 affected(await db.from(E).delete().eq('id',id).select('id'));
 const removed=await db.storage.from(BUCKET).remove([row.file_path]);
 if(removed.error)tell('ลบข้อมูลรูปแล้ว แต่ลบไฟล์ไม่สำเร็จ: '+removed.error.message,true);
 await loadEvidence();
}
async function account(){
 if(!db)return;
 try{
  const result=await db.auth.getUser();user=result.error?null:result.data.user;editor=false;
  if(user){const r=await db.from('tracker_editors').select('user_id').eq('user_id',user.id).maybeSingle();editor=!r.error&&!!r.data;}
  if(ready)await loadEvidence();
  render();
 }catch(e){tell(e.message,true);}
}
async function save(work,success){
 if(busy)return;
 try{ensure();busy=true;permissions();await work();await load();tell(success||'บันทึกสำเร็จ');}
 catch(e){tell('ไม่สำเร็จ: '+e.message,true);}
 finally{busy=false;render();}
}
function projectForm(edit){
 if(!canEdit())return;
 editingProject=edit;$('projectFormTitle').textContent=edit?'แก้ไขโปรเจกต์':'สร้างโปรเจกต์ใหม่';
 $('projectName').value=edit?currentProject()?.name||'':'';
 $('projectDescription').value=edit?currentProject()?.description||'':'';
 $('projectWeeks').value=edit?currentProject()?.planned_weeks||10:10;
 $('projectForm').hidden=false;$('projectName').focus();
}
function weekDialog(id){
 if(!canEdit())return;
 const w=weeks.find(x=>x.id===id);editingWeek=w?.id||'';
 const f=$('weekForm');f.reset();
 for(const key of ['title','goal','together','deliverable'])f.elements.namedItem(key).value=w?.[key]||'';
 $('weekDialogTitle').textContent=w?'แก้ไขสัปดาห์ที่ '+w.position:'เพิ่มสัปดาห์ใหม่';
 $('weekDialog').showModal();
}
function taskDialog(id){
 if(!canEdit())return;
 const t=tasks.find(x=>x.id===id);editingTask=t?.id||'';
 const f=$('taskForm');f.reset();
 const weeksSelect=f.elements.namedItem('week_id');
 weeksSelect.innerHTML=weeks.map(w=>'<option value="'+esc(w.id)+'">สัปดาห์ที่ '+w.position+' — '+esc(w.title)+'</option>').join('');
 weeksSelect.value=t?.week_id||weekId;
 for(const key of ['reference','title','role','description','status'])f.elements.namedItem(key).value=t?.[key]||(key==='status'?'not_started':'');
 f.elements.namedItem('details').value=Array.isArray(t?.details)?t.details.join('\n'):'';
 $('taskDialogTitle').textContent=t?'แก้ไขข้อ / ย้ายสัปดาห์':'เพิ่มข้อ / งานใหม่';
 $('taskDialog').showModal();
}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!db)return tell('Supabase ไม่พร้อมใช้งาน',true);
 try{
  accepted(await db.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value}));
  $('loginPassword').value='';await account();tell('เข้าสู่ระบบสำเร็จ');
 }catch(x){tell(x.message,true);}
});
$('logout').addEventListener('click',async()=>{
 try{accepted(await db.auth.signOut());user=null;editor=false;render();tell('ออกจากระบบแล้ว');}
 catch(x){tell(x.message,true);}
});
$('projectSelect').addEventListener('change',e=>{
 projectId=e.target.value;weekId='';$('search').value='';$('statusFilter').value='all';void load();
});
$('toggleProject').addEventListener('click',()=>projectForm(false));
$('renameProject').addEventListener('click',()=>projectForm(true));
$('cancelProject').addEventListener('click',()=>{$('projectForm').hidden=true;});
$('projectForm').addEventListener('submit',e=>{
 e.preventDefault();
 const name=$('projectName').value.trim(),description=$('projectDescription').value.trim();
 const plannedWeeks=Number($('projectWeeks').value);
 if(!name||name.length>120||description.length>2000||!Number.isInteger(plannedWeeks)||plannedWeeks<1||plannedWeeks>104)return tell('ชื่อหรือคำอธิบายไม่ถูกต้อง',true);
 void save(async()=>{
  if(editingProject)affected(await db.from(P).update({name,description,planned_weeks:plannedWeeks}).eq('id',projectId).select('id'));
  else{
   const r=affected(await db.from(P).insert({name,description,planned_weeks:plannedWeeks,created_by:user.id}).select('id'));
   projectId=r.id;weekId='';
   const created=await db.from(W).insert(Array.from({length:plannedWeeks},(_,i)=>({
     project_id:r.id,position:i+1,title:'สัปดาห์ที่ '+(i+1),goal:'',together:'',deliverable:''
   })));
   if(created.error)throw Error('สร้างโครงการแล้ว แต่สร้างสัปดาห์ไม่ครบ: '+created.error.message+' · ใช้ปุ่มเติมสัปดาห์เพื่อแก้ไข');
  }
  $('projectForm').hidden=true;
 },'บันทึกโปรเจกต์เรียบร้อย');
});
$('addWeek').addEventListener('click',()=>weekDialog(''));
$('editWeek').addEventListener('click',()=>weekDialog(weekId));
$('addTenWeeks').addEventListener('click',()=>{
 if(!canEdit()||!currentProject())return;
 const desired=currentProject().planned_weeks||0;
 const missing=Array.from({length:desired},(_,i)=>i+1).filter(n=>!weeks.some(w=>w.position===n));
 if(!missing.length)return;
 if(!confirm('เติมสัปดาห์ว่างที่ขาดอยู่ '+missing.length+' สัปดาห์หรือไม่?'))return;
 void save(async()=>{
  accepted(await db.from(W).insert(missing.map(position=>({
   project_id:projectId,position,title:'สัปดาห์ที่ '+position,goal:'',together:'',deliverable:''
  }))));
 },'เติมสัปดาห์ตามจำนวนที่กำหนดแล้ว');
});
$('weeks').addEventListener('click',e=>{
 const b=e.target.closest('[data-week]');if(!b)return;
 weekId=b.dataset.week;$('search').value='';$('statusFilter').value='all';expanded=false;render();
});
$('weekForm').addEventListener('submit',e=>{
 e.preventDefault();
 const f=e.currentTarget,values={};
 for(const key of ['title','goal','together','deliverable'])values[key]=f.elements.namedItem(key).value.trim();
 if(!values.title||values.title.length>160)return tell('ชื่อสัปดาห์ไม่ถูกต้อง',true);
 void save(async()=>{
  if(editingWeek)affected(await db.from(W).update(values).eq('id',editingWeek).select('id'));
  else{
   values.project_id=projectId;values.position=Math.max(0,...weeks.map(w=>w.position))+1;
   weekId=affected(await db.from(W).insert(values).select('id')).id;
  }
  $('weekDialog').close();
 },'บันทึกสัปดาห์แล้ว');
});
$('deleteWeek').addEventListener('click',()=>{
 const w=currentWeek();if(!w||!canEdit())return;
 if(!confirm('ลบสัปดาห์ '+w.title+' พร้อมงาน '+perWeek(w.id).length+' ข้ออย่างถาวรหรือไม่?'))return;
 void save(async()=>{affected(await db.from(W).delete().eq('id',w.id).select('id'));weekId='';},'ลบสัปดาห์แล้ว');
});
$('addTask').addEventListener('click',()=>taskDialog(''));
$('taskForm').addEventListener('submit',e=>{
 e.preventDefault();
 const f=e.currentTarget,values={};
 for(const key of ['week_id','reference','title','role','description','status'])values[key]=f.elements.namedItem(key).value.trim();
 values.details=f.elements.namedItem('details').value.split('\n').map(v=>v.trim()).filter(Boolean);
 if(values.details.length>100||values.details.some(x=>x.length>1000))return tell('รายการย่อยต้องไม่เกิน 100 รายการ และแต่ละรายการไม่เกิน 1,000 ตัวอักษร',true);
 if(!values.title||values.title.length>250||!labels[values.status]||!weeks.some(w=>w.id===values.week_id))
  return tell('ชื่อข้อ สถานะ หรือสัปดาห์ไม่ถูกต้อง',true);
 void save(async()=>{
  if(editingTask){
   const old=tasks.find(t=>t.id===editingTask);
   if(!old)throw new Error('ไม่พบข้อ');
   if(old.week_id!==values.week_id){
    values.position=Math.max(0,...perWeek(values.week_id).map(t=>t.position))+1;
    weekId=values.week_id;
   }
   values.updated_at=new Date().toISOString();
   affected(await db.from(T).update(values).eq('id',editingTask).select('id'));
  }else{
   values.position=Math.max(0,...perWeek(values.week_id).map(t=>t.position))+1;
   affected(await db.from(T).insert(values).select('id'));weekId=values.week_id;
  }
  $('taskDialog').close();
 },'บันทึกข้อ / งานแล้ว');
});
$('tasks').addEventListener('change',e=>{
 const s=e.target.closest('select[data-status]');if(!s||!canEdit()||!labels[s.value])return;
 void save(async()=>{affected(await db.from(T).update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.status).select('id'));},'เปลี่ยนสถานะแล้ว');
});
$('tasks').addEventListener('click',e=>{
 const edit=e.target.closest('[data-edit-task]');
 if(edit)return taskDialog(edit.dataset.editTask);
 const del=e.target.closest('[data-delete-task]');
 if(del){
  if(!canEdit())return;
  const t=tasks.find(x=>x.id===del.dataset.deleteTask);
  if(!t||!confirm('ลบข้อ '+t.title+' พร้อมภาพหลักฐานอย่างถาวรหรือไม่?'))return;
  return void save(async()=>{affected(await db.from(T).delete().eq('id',t.id).select('id'));},'ลบข้อแล้ว');
 }
 const delEvidence=e.target.closest('[data-delete-evidence]');
 if(delEvidence){
   if(!canEdit()||!confirm('ลบรูปภาพหลักฐานนี้หรือไม่?'))return;
   return void save(async()=>{await deleteEvidence(delEvidence.dataset.deleteEvidence);},'ลบรูปหลักฐานแล้ว');
 }
 const note=e.target.closest('[data-save-note]');
 if(note){
  if(!canEdit())return;
  const value=note.closest('.task').querySelector('textarea[data-note]').value;
  if(value.length>10000)return tell('โน้ตต้องไม่เกิน 10,000 ตัวอักษร',true);
  void save(async()=>{affected(await db.from(T).update({note:value,updated_at:new Date().toISOString()}).eq('id',note.dataset.saveNote).select('id'));},'บันทึกโน้ตแล้ว');
 }
});
$('tasks').addEventListener('change',e=>{
 const input=e.target.closest('input[data-evidence-upload]');
 if(!input)return;
 void uploadEvidence(input).catch(error=>tell('อัปโหลดไม่สำเร็จ: '+error.message,true));
});
$('resetPassword').addEventListener('click',async()=>{
 const email=$('loginEmail').value.trim();
 if(!email)return tell('กรุณากรอกอีเมลก่อนขอลิงก์ตั้งรหัสผ่าน',true);
 try{
   accepted(await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}));
   tell('ส่งคำขอแล้ว โปรดตรวจอีเมลและเปิดลิงก์ตั้งรหัสผ่าน');
 }catch(error){tell(error.message,true);}
});
$('togglePassword').addEventListener('click',()=>{passwordFlow=!passwordFlow;permissions();});
$('passwordForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const pass=$('newPassword').value;
 if(pass.length<8||pass!==$('confirmPassword').value)return tell('รหัสผ่านทั้งสองช่องต้องตรงกันและยาวอย่างน้อย 8 ตัวอักษร',true);
 try{
   accepted(await db.auth.updateUser({password:pass}));
   passwordFlow=false;$('newPassword').value='';$('confirmPassword').value='';
   permissions();tell('เปลี่ยนรหัสผ่านสำเร็จ');
 }catch(error){tell('ตั้งรหัสผ่านไม่สำเร็จ: '+error.message,true);}
});
$('search').addEventListener('input',renderTasks);
$('statusFilter').addEventListener('change',renderTasks);
$('roleFilter').addEventListener('change',renderTasks);
$('expand').addEventListener('click',()=>{expanded=!expanded;$('expand').textContent=expanded?'ย่อรายละเอียดทั้งหมด':'ขยายรายละเอียดทั้งหมด';renderTasks();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
let timer;
async function start(){
 if(!db){$('connection').textContent='ไม่สามารถโหลด Supabase SDK ได้';render();return;}
 db.auth.onAuthStateChange(event=>{
   if(event==='PASSWORD_RECOVERY')passwordFlow=true;
   setTimeout(()=>void account(),0);
 });
 await load();await account();
 db.channel('fitm-custom-template')
 .on('postgres_changes',{event:'*',schema:'public',table:P},changedRealtime)
 .on('postgres_changes',{event:'*',schema:'public',table:W},changedRealtime)
 .on('postgres_changes',{event:'*',schema:'public',table:T},changedRealtime)
 .on('postgres_changes',{event:'*',schema:'public',table:E},changedRealtime)
 .subscribe(state=>{if(['CHANNEL_ERROR','TIMED_OUT'].includes(state))tell('Realtime ขัดข้อง · กดรีเฟรชเพื่อดูข้อมูลล่าสุด',true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
}
function changedRealtime(){
 clearTimeout(timer);
 timer=setTimeout(()=>{if(!busy&&!document.querySelector('dialog[open]'))void load();},220);
}
void start();
})();