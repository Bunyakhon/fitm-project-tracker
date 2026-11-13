/* Blank project tracker template; all writes secured by Supabase RLS. */
(() => {
'use strict';
const db=window.supabase?.createClient('https://epqbivhfjdnmcwivogah.supabase.co','sb_publishable_zoBBu3ha4ICyFIK6znarhA_xQpuxmeU');
const P='tracker_custom_projects', W='tracker_custom_weeks', T='tracker_custom_tasks';
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
 ['addTenWeeks',on&&hasProject&&!weeks.length],['editWeek',on&&hasWeek],
 ['deleteWeek',on&&hasWeek],['addTask',on&&hasWeek]
 ])$(id).disabled=!ok;
 $('loginForm').hidden=Boolean(user);$('signedIn').hidden=!user;
 $('whoami').textContent=user?.email||'';
 $('editorRole').textContent=user?(editor?'· Editor · แก้ไขข้อมูลส่วนกลางได้':'· Viewer · ยังไม่ได้รับสิทธิ์แก้ไข'):'';
}
function renderProjects(){
 const select=$('projectSelect');
 select.innerHTML=projects.length?projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join(''):'<option value="">ยังไม่มีโปรเจกต์</option>';
 select.value=projectId||'';
 $('projectSummary').textContent=currentProject()?
 (currentProject().description||'ยังไม่ระบุคำอธิบาย')+' · '+weeks.length+' สัปดาห์ · '+tasks.length+' ข้อ'
 :'ยังไม่มีโปรเจกต์ · ผู้ได้รับสิทธิ์ Editor สามารถสร้างโปรเจกต์ใหม่จาก Template นี้ได้';
}
function renderStats(){
 $('weekCount').textContent=weeks.length;$('totalCount').textContent=tasks.length;
 $('notStarted').textContent=tasks.filter(t=>t.status==='not_started').length;
 $('inProgress').textContent=tasks.filter(t=>t.status==='in_progress').length;
 $('completed').textContent=completed(tasks);
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
function card(t){
 const attr=canEdit()?'':' disabled';
 const options=Object.entries(labels).map(([value,label])=>'<option value="'+value+'"'+(t.status===value?' selected':'')+'>'+label+'</option>').join('');
 const description=esc(t.description||'ยังไม่ได้ระบุรายละเอียด');
 return '<article class="task" data-task="'+esc(t.id)+'">'+
 '<div class="task-top"><div class="task-left"><span class="task-badge">'+esc(t.reference||'ไม่มีเลขข้อ')+'</span>'+
 '<div class="task-title">'+esc(t.title)+'</div><span class="role"><b>บทบาท:</b> '+esc(t.role||'ยังไม่ระบุ')+'</span></div>'+
 '<label class="status-control">สถานะ<select data-status="'+esc(t.id)+'"'+attr+'>'+options+'</select></label></div>'+
 '<div class="scope scope-preview"><b>รายละเอียดขอบเขต</b><p class="task-description'+(expanded?'':' preview')+'">'+description+'</p></div>'+
 '<details class="details"'+(expanded?' open':'')+'><summary>อ่านรายละเอียดทั้งหมด / โน้ต</summary><p class="task-description">'+description+'</p>'+
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
  const p=accepted(await db.from(P).select('id,name,description,created_at').order('created_at',{ascending:false}).limit(200));
  if(ticket!==request)return;projects=p||[];
  if(!currentProject())projectId=projects[0]?.id||'';
  history.replaceState(null,'',location.pathname+(projectId?'?project='+encodeURIComponent(projectId):''));
  const w=projectId?accepted(await db.from(W).select('*').eq('project_id',projectId).order('position',{ascending:true}).limit(500)):[];
  if(ticket!==request)return;weeks=w||[];
  if(!currentWeek())weekId=weeks[0]?.id||'';
  const t=weeks.length?accepted(await db.from(T).select('*').in('week_id',weeks.map(x=>x.id)).order('position',{ascending:true}).limit(4000)):[];
  if(ticket!==request)return;tasks=t||[];
  ready=true;$('connection').textContent='เชื่อมต่อ Supabase แล้ว · ข้อมูลโปรเจกต์และงานใช้ร่วมกัน';render();
 }catch(e){
  ready=false;$('connection').textContent='ยังโหลด Template ไม่ได้ · ตรวจว่าได้รันไฟล์ SQL สำหรับ Template แล้ว';
  tell(e.message,true);permissions();
 }
}
async function account(){
 if(!db)return;
 try{
  const result=await db.auth.getUser();user=result.error?null:result.data.user;editor=false;
  if(user){const r=await db.from('tracker_editors').select('user_id').eq('user_id',user.id).maybeSingle();editor=!r.error&&!!r.data;}
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
 if(!name||name.length>120||description.length>2000)return tell('ชื่อหรือคำอธิบายไม่ถูกต้อง',true);
 void save(async()=>{
  if(editingProject)affected(await db.from(P).update({name,description}).eq('id',projectId).select('id'));
  else{
   const r=affected(await db.from(P).insert({name,description,created_by:user.id}).select('id'));
   projectId=r.id;weekId='';
  }
  $('projectForm').hidden=true;
 },'บันทึกโปรเจกต์เรียบร้อย');
});
$('addWeek').addEventListener('click',()=>weekDialog(''));
$('editWeek').addEventListener('click',()=>weekDialog(weekId));
$('addTenWeeks').addEventListener('click',()=>{
 if(!canEdit()||weeks.length)return;
 if(!confirm('สร้างสัปดาห์ว่าง 10 สัปดาห์ในโปรเจกต์นี้หรือไม่?'))return;
 void save(async()=>{
  accepted(await db.from(W).insert(Array.from({length:10},(_,i)=>({
   project_id:projectId,position:i+1,title:'สัปดาห์ที่ '+(i+1),goal:'',together:'',deliverable:''
  }))));
 },'เพิ่ม 10 สัปดาห์ว่างแล้ว');
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
  if(!t||!confirm('ลบข้อ '+t.title+' อย่างถาวรหรือไม่?'))return;
  return void save(async()=>{affected(await db.from(T).delete().eq('id',t.id).select('id'));},'ลบข้อแล้ว');
 }
 const note=e.target.closest('[data-save-note]');
 if(note){
  if(!canEdit())return;
  const value=note.closest('.task').querySelector('textarea[data-note]').value;
  if(value.length>10000)return tell('โน้ตต้องไม่เกิน 10,000 ตัวอักษร',true);
  void save(async()=>{affected(await db.from(T).update({note:value,updated_at:new Date().toISOString()}).eq('id',note.dataset.saveNote).select('id'));},'บันทึกโน้ตแล้ว');
 }
});
$('search').addEventListener('input',renderTasks);
$('statusFilter').addEventListener('change',renderTasks);
$('roleFilter').addEventListener('change',renderTasks);
$('expand').addEventListener('click',()=>{expanded=!expanded;$('expand').textContent=expanded?'ย่อรายละเอียดทั้งหมด':'ขยายรายละเอียดทั้งหมด';renderTasks();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
let timer;
async function start(){
 if(!db){$('connection').textContent='ไม่สามารถโหลด Supabase SDK ได้';render();return;}
 db.auth.onAuthStateChange(()=>setTimeout(()=>void account(),0));
 await load();await account();
 db.channel('fitm-custom-template')
 .on('postgres_changes',{event:'*',schema:'public',table:P},changedRealtime)
 .on('postgres_changes',{event:'*',schema:'public',table:W},changedRealtime)
 .on('postgres_changes',{event:'*',schema:'public',table:T},changedRealtime)
 .subscribe(state=>{if(['CHANNEL_ERROR','TIMED_OUT'].includes(state))tell('Realtime ขัดข้อง · กดรีเฟรชเพื่อดูข้อมูลล่าสุด',true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
}
function changedRealtime(){
 clearTimeout(timer);
 timer=setTimeout(()=>{if(!busy&&!document.querySelector('dialog[open]'))void load();},220);
}
void start();
})();