
/* FITM comment center: public threads, per-editor read receipts, realtime updates. */
(() => {
'use strict';
window.createFitmCommentCenter=function({db,esc,accepted,affected,account,canEdit,projects,goToTask}){
 const $=id=>document.getElementById(id);
 const C='tracker_custom_comments',R='tracker_comment_reads';
 let rows=[],reads=new Set(),accountId=null,loaded=false,err='',ticket=0,timer=null,writing=false,refreshPending=false,channelState='connecting',page=1;
 const expanded=new Set(),drafts=new Map(),byTask=new Map(),byId=new Map(),children=new Map();
 const status=(s)=>{$('commentCenterFeedback').textContent=s;};
 const draft=id=>drafts.get(id)||{name:'',body:'',parent:''};
 const unread=c=>Boolean(accountId&&!reads.has(c.id));
 const date=c=>esc(new Date(c.created_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}));
 const scoped=id=>byTask.get(id)||[];
 const buttons=(c,center=false)=>'<div class="cc-actions">'+
   (center?'<button class="btn" type="button" data-cc-go="'+esc(c.id)+'">ไปยังงาน</button>':'')+
   '<button class="btn" type="button" data-cc-reply="'+esc(c.id)+'">ตอบกลับ</button>'+
   (accountId?'<button class="btn" type="button" data-cc-read="'+esc(c.id)+'">'+(reads.has(c.id)?'ยังไม่อ่าน':'อ่านแล้ว')+'</button>'+
   '<button class="btn danger" type="button" data-cc-delete="'+esc(c.id)+'">ลบ</button>':'')+'</div>';
 function commentCard(c,center=false,nested=false){
  const parent=byId.get(c.parent_id);
  const context=center?'<div class="cc-context">'+esc(c.projectName)+' · สัปดาห์ที่ '+esc(c.weekPosition)+'<br>'+esc(c.reference||'')+' '+esc(c.taskTitle)+(parent?'<small>ตอบกลับ '+esc(parent.author_name)+'</small>':'')+'</div>':'';
  const replies=!center&&!nested?(children.get(c.id)||[]).map(r=>commentCard(r,false,true)).join(''):'';
  return '<article class="cc-comment'+(nested?' cc-reply':'')+'"><div class="cc-meta"><strong>'+esc(c.author_name||'ผู้เยี่ยมชม')+'</strong><span>'+date(c)+(unread(c)?' · <b class="cc-new">ใหม่</b>':'')+'</span></div>'+context+
   '<p class="cc-body">'+esc(c.body)+'</p>'+buttons(c,center)+(replies?'<div class="cc-replies">'+replies+'</div>':'')+'</article>';
 }
 function form(id,center=false){
  const d=draft(id),parent=byId.get(d.parent);
  return '<form class="cc-form" data-cc-form="'+esc(id)+'"><div class="cc-reply-target" data-cc-target="'+esc(id)+'"'+(parent?'':' hidden')+'>'+ (parent?'ตอบกลับ '+esc(parent.author_name):'')+'</div>'+
   '<button type="button" class="btn cc-cancel" data-cc-cancel="'+esc(id)+'"'+(parent?'':' hidden')+'>ยกเลิกการตอบกลับ</button>'+
   '<label>ชื่อผู้แสดงความคิดเห็น (ไม่บังคับ)<input name="author_name" maxlength="80" placeholder="ผู้เยี่ยมชม" value="'+esc(d.name)+'"></label>'+
   '<label>ความคิดเห็น<textarea name="body" maxlength="2000" rows="3" required placeholder="เขียนความคิดเห็นของคุณ…">'+esc(d.body)+'</textarea></label>'+
   '<div class="cc-form-footer"><small>ไม่ต้อง Login · ชื่อไม่ได้รับการยืนยัน · ข้อความเป็นสาธารณะ</small><button class="btn primary" type="submit">ส่งความคิดเห็น</button></div><p class="cc-feedback" role="status"></p></form>';
 }
 function inline(id){
  return '<section class="cc-inline" data-cc-task="'+esc(id)+'"><div class="cc-inline-heading"><h4>ความคิดเห็น <span data-cc-total="'+esc(id)+'">…</span></h4><span class="cc-new" data-cc-unread="'+esc(id)+'"></span></div>'+
   '<div data-cc-list="'+esc(id)+'"></div><button type="button" class="btn cc-toggle" data-cc-toggle="'+esc(id)+'" hidden>ดูความคิดเห็นทั้งหมด</button>'+form(id)+'</section>';
 }
 function index(){
  byTask.clear();byId.clear();children.clear();
  for(const c of rows){byId.set(c.id,c);if(!byTask.has(c.task_id))byTask.set(c.task_id,[]);byTask.get(c.task_id).push(c);if(c.parent_id){if(!children.has(c.parent_id))children.set(c.parent_id,[]);children.get(c.parent_id).push(c);}}
  for(const a of children.values())a.reverse();
 }
 function paint(){
  for(const el of $('tasks').querySelectorAll('[data-cc-task]')){
   const id=el.dataset.ccTask,a=scoped(id),roots=a.filter(c=>!c.parent_id||!byId.has(c.parent_id)),n=a.filter(unread).length;
   el.querySelector('[data-cc-total]').textContent=loaded?'('+a.length+')':'';
   el.querySelector('[data-cc-unread]').textContent=n?n+' ข้อความใหม่':'';
   const list=el.querySelector('[data-cc-list]'),toggle=el.querySelector('[data-cc-toggle]');
   const html=err&&!loaded?'<p class="cc-empty">โหลดความคิดเห็นไม่สำเร็จ · กรุณารีเฟรช</p>':!loaded?'<p class="cc-empty">กำลังโหลดความคิดเห็น…</p>':roots.length?(expanded.has(id)?roots:roots.slice(0,1)).map(c=>commentCard(c)).join(''):'<p class="cc-empty">ยังไม่มีความคิดเห็น</p>';
   if(list.innerHTML!==html)list.innerHTML=html;
   toggle.hidden=roots.length<=1;toggle.textContent=expanded.has(id)?'ย่อความคิดเห็น':'ดูความคิดเห็นทั้งหมด ('+a.length+')';
   const count=el.closest('[data-task]').querySelector('[data-comment-count]');
   if(count){count.textContent=loaded?'('+a.length+')':'…';count.classList.toggle('cc-new',n>0);}
  }
  const open=$('openCommentCenter');open.hidden=!accountId;
  const n=rows.filter(unread).length;$('ccNotification').textContent=loaded?String(n):'…';
  $('ccNotification').classList.toggle('cc-hot',n>0);
  if($('commentCenterDialog').open&&accountId)paintCenter();
 }
 function filterOptions(){
  const p=$('ccProject'),w=$('ccWeek'),pv=p.value||'all',wv=w.value||'all';
  const ps=new Map(projects().map(x=>[x.id,x.name]));
  for(const c of rows)ps.set(c.projectId,c.projectName);
  p.innerHTML='<option value="all">ทุกโปรเจกต์</option>'+[...ps].map(([id,n])=>'<option value="'+esc(id)+'">'+esc(n)+'</option>').join('');
  p.value=ps.has(pv)?pv:'all';
  const ws=new Map(rows.filter(c=>p.value==='all'||c.projectId===p.value).map(c=>[c.weekId,c.projectName+' · สัปดาห์ที่ '+c.weekPosition]));
  w.innerHTML='<option value="all">ทุกสัปดาห์</option>'+[...ws].map(([id,n])=>'<option value="'+esc(id)+'">'+esc(n)+'</option>').join('');
  w.value=ws.has(wv)?wv:'all';
 }
 function paintCenter(){
  filterOptions();
  const base=rows.filter(c=>($('ccProject').value==='all'||c.projectId===$('ccProject').value)&&($('ccWeek').value==='all'||c.weekId===$('ccWeek').value));
  const n=base.filter(unread).length;
  $('ccAll').textContent=base.length;$('ccUnread').textContent=n;$('ccRead').textContent=base.length-n;
  const term=$('ccSearch').value.trim().toLocaleLowerCase(),filter=$('ccFilter').value;
  const selected=base.filter(c=>(filter==='all'||(filter==='unread'?unread(c):!unread(c)))&&[c.author_name,c.body,c.taskTitle,c.reference,c.projectName].join(' ').toLocaleLowerCase().includes(term));
  $('ccResult').textContent='พบ '+selected.length+' ความคิดเห็น · '+(channelState==='SUBSCRIBED'?'Realtime เชื่อมต่อแล้ว':'อัปเดตอัตโนมัติทุก 30 วินาที');
  const html=selected.slice(0,page*30).map(c=>commentCard(c,true)).join('')||'<p class="cc-empty">'+esc(err||(!loaded?'กำลังโหลด…':'ไม่พบความคิดเห็น'))+'</p>';
  if($('ccCenterList').innerHTML!==html)$('ccCenterList').innerHTML=html;
  $('ccMore').hidden=selected.length<=page*30;
  $('ccMarkAll').disabled=!loaded||!rows.some(unread)||writing;
 }
 async function allRows(make){
  const result=[];
  for(let offset=0;;offset+=500){
   const data=accepted(await make().range(offset,offset+499))||[];
   result.push(...data);
   if(data.length<500)return result;
  }
 }
 async function refresh(){
  if(!db)return;
  if(writing){refreshPending=true;return;}
  const seq=++ticket,id=account();
  try{
   const [raw,receipts]=await Promise.all([
    allRows(()=>db.from(C).select('id,task_id,parent_id,author_name,body,created_at,task:tracker_custom_tasks!tracker_custom_comments_task_id_fkey!inner(title,reference,week:tracker_custom_weeks!inner(id,position,project:tracker_custom_projects!inner(id,name)))').order('created_at',{ascending:false}).order('id',{ascending:false})),
    id?allRows(()=>db.from(R).select('comment_id').eq('user_id',id).order('comment_id')):Promise.resolve([])
   ]);
   if(seq!==ticket||id!==account()||writing)return;
   rows=raw.filter(c=>c.task?.week?.project).map(c=>({...c,taskTitle:c.task.title,reference:c.task.reference,weekId:c.task.week.id,weekPosition:c.task.week.position,projectId:c.task.week.project.id,projectName:c.task.week.project.name}));
   reads=new Set(receipts.map(r=>r.comment_id));loaded=true;err='';index();paint();
  }catch(e){if(seq===ticket){err='โหลดความคิดเห็นไม่สำเร็จ: '+e.message;status(err);paint();}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>void refresh(),200);}
 function syncAccount(){
  const id=account();
  if(id!==accountId){accountId=id;reads.clear();ticket++;if(!id&&$('commentCenterDialog').open)$('commentCenterDialog').close();paint();schedule();}
  else $('openCommentCenter').hidden=!id;
 }
 function updateDraft(formEl){
  const id=formEl.dataset.ccForm,d=draft(id);
  drafts.set(id,{...d,name:formEl.elements.author_name.value,body:formEl.elements.body.value});
 }
 function setReply(id,parent,focus=true){
  const d=draft(id);drafts.set(id,{...d,parent});
  for(const f of document.querySelectorAll('[data-cc-form]')){
   if(f.dataset.ccForm!==id)continue;
   const target=f.querySelector('[data-cc-target]'),cancel=f.querySelector('[data-cc-cancel]');
   target.hidden=!parent;cancel.hidden=!parent;target.textContent=parent?'ตอบกลับ '+(byId.get(parent)?.author_name||'ความคิดเห็น'):'';
   if(focus&&f.getClientRects().length){f.scrollIntoView({block:'nearest'});f.elements.body.focus({preventScroll:true});}
  }
 }
 function openTask(id,parent=''){
  const section=[...$('tasks').querySelectorAll('[data-cc-task]')].find(e=>e.dataset.ccTask===id);
  if(!section)return;
  expanded.add(id);paint();if(parent)setReply(id,parent,false);
  section.scrollIntoView({behavior:'smooth',block:'start'});section.querySelector('textarea')?.focus({preventScroll:true});
 }
 async function mutate(work,success){
  if(writing)return false;
  writing=true;ticket++;let ok=false;
  try{await work();ok=true;status(success);}
  catch(e){status('ไม่สำเร็จ: '+e.message);throw e;}
  finally{writing=false;refreshPending=false;await refresh();}
  return ok;
 }
 async function mark(ids,read){
  if(!accountId||!canEdit())return;
  const uid=accountId;
  await mutate(async()=>{
   for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100);
    if(read)accepted(await db.from(R).upsert(batch.map(comment_id=>({user_id:uid,comment_id})),{onConflict:'user_id,comment_id',ignoreDuplicates:true}));
    else accepted(await db.from(R).delete().eq('user_id',uid).in('comment_id',batch));
   }
  },read?'บันทึกว่าอ่านแล้ว':'ตั้งเป็นยังไม่ได้อ่าน');
 }
 document.addEventListener('input',e=>{const f=e.target.closest('[data-cc-form]');if(f)updateDraft(f);});
 document.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-cc-form]');if(!f)return;e.preventDefault();
  if(writing||!db)return;
  updateDraft(f);const id=f.dataset.ccForm,d=draft(id),body=d.body.trim(),name=d.name.trim()||'ผู้เยี่ยมชม',feedback=f.querySelector('.cc-feedback'),button=f.querySelector('[type=submit]');
  if(!body||body.length>2000||name.length>80){feedback.textContent='กรุณากรอกข้อความ 1–2,000 ตัวอักษร';return;}
  if(d.parent&&!byId.has(d.parent)){feedback.textContent='ข้อความต้นทางถูกลบแล้ว กรุณายกเลิกการตอบกลับ';return;}
  button.disabled=true;feedback.textContent='กำลังส่ง…';
  try{
   await mutate(async()=>{accepted(await db.from(C).insert({task_id:id,author_name:name,body,parent_id:d.parent||null}));drafts.set(id,{name:d.name,body:'',parent:''});expanded.add(id);
    for(const other of document.querySelectorAll('[data-cc-form]'))if(other.dataset.ccForm===id)other.elements.body.value='';
    setReply(id,'',false);
   },'ส่งความคิดเห็นแล้ว');
   feedback.textContent='ส่งความคิดเห็นแล้ว';
  }catch(error){feedback.textContent='ส่งไม่สำเร็จ: '+error.message;}
  finally{button.disabled=false;}
 });
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  const d=b.dataset;
  if(d.ccToggle){expanded.has(d.ccToggle)?expanded.delete(d.ccToggle):expanded.add(d.ccToggle);paint();return;}
  if(d.ccCancel){setReply(d.ccCancel,'');return;}
  const id=d.ccGo||d.ccReply||d.ccRead||d.ccDelete,c=byId.get(id);
  if(!c)return;
  try{
   if(d.ccGo){if(!accountId)return;$('commentCenterDialog').close();await goToTask(c);openTask(c.task_id);}
   else if(d.ccReply){
    const parent=c.parent_id||c.id;
    if(b.closest('#commentCenterDialog')){
     if(!accountId)return;const old=$('ccCenterComposer').querySelector('form');if(old)updateDraft(old);
     drafts.set(c.task_id,{...draft(c.task_id),parent});
     $('ccCenterComposer').innerHTML='<h4>ตอบกลับในงาน '+esc(c.taskTitle)+'</h4>'+form(c.task_id,true);
     setReply(c.task_id,parent);
    }else setReply(c.task_id,parent);
   }else if(d.ccRead){await mark([id],!reads.has(id));}
   else if(d.ccDelete&&accountId&&canEdit()&&confirm('ลบความคิดเห็นนี้และข้อความตอบกลับ (ถ้ามี) หรือไม่?')){
    await mutate(async()=>{affected(await db.from(C).delete().eq('id',id).select('id'));},'ลบความคิดเห็นแล้ว');
   }
  }catch(error){status(error.message);if(!$('commentCenterDialog').open){const f=b.closest('[data-cc-task]')?.querySelector('.cc-feedback');if(f)f.textContent=error.message;}}
 });
 $('openCommentCenter').addEventListener('click',()=>{if(!accountId)return;page=1;$('commentCenterDialog').showModal();paintCenter();void refresh();});
 $('ccClose').addEventListener('click',()=>{$('commentCenterDialog').close();});
 $('commentCenterDialog').addEventListener('close',()=>{$('ccCenterComposer').innerHTML='';});
 $('ccRefresh').addEventListener('click',()=>void refresh());
 $('ccSearch').addEventListener('input',()=>{page=1;paintCenter();});
 for(const id of ['ccProject','ccWeek','ccFilter'])$(id).addEventListener('change',()=>{page=1;if(id==='ccProject')$('ccWeek').value='all';paintCenter();});
 $('ccMore').addEventListener('click',()=>{page++;paintCenter();});
 $('ccMarkAll').addEventListener('click',async()=>{if(!accountId||!confirm('ทำเครื่องหมายความคิดเห็นทุกโปรเจกต์ว่าอ่านแล้วสำหรับบัญชีนี้หรือไม่?'))return;try{await mark(rows.filter(unread).map(c=>c.id),true);}catch(e){status(e.message);}});
 function start(){
  if(!db)return;
  syncAccount();void refresh();
  db.channel('fitm-comment-center-v2').on('postgres_changes',{event:'*',schema:'public',table:C},schedule).subscribe(s=>{channelState=s;if(s==='SUBSCRIBED')schedule();paint();});
  // Read receipts remain private and are not published through Realtime.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  setInterval(()=>{if(!document.hidden)schedule();},30000);
 }
 return {inline,paint,syncAccount,schedule,start,openTask};
};
})();
