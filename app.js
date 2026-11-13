/*
 * CoopConnect Project Progress Tracker
 * Development progress is stored locally and is independent from the scope data.
 */
const TASKS = DATA.tasks;
const WEEKS = DATA.weeks;
const PLANS = DATA.weeklyPlan;
const STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
};
const STATUS_LABELS = {
  [STATUS.NOT_STARTED]: 'ยังไม่เริ่ม',
  [STATUS.IN_PROGRESS]: 'กำลังดำเนินการ',
  [STATUS.COMPLETED]: 'เสร็จแล้ว'
};
const CLOUD = window.TrackerCloud;
const drafts = new Map();
const noteTimers = new Map();
const noteSaving = new Set();
let week = 1;
let expanded = false;
let state = {};
const el = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const initialState = () => Object.fromEntries(TASKS.map(task => [
  task.id, { status: STATUS.NOT_STARTED, note: '', updatedAt: null }
]));
const normalizeState = saved => Object.fromEntries(TASKS.map(task => {
  const value = saved[task.id];
  return [task.id, value && Object.values(STATUS).includes(value.status)
    ? { status: value.status, note: String(value.note || ''), updatedAt: value.updatedAt || null }
    : { status: STATUS.NOT_STARTED, note: '', updatedAt: null }];
}));
state = normalizeState(state);
const record = task => state[task.id] || { status: STATUS.NOT_STARTED, note: '', updatedAt: null };
const ownStatus = task => [STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.COMPLETED].includes(record(task).status)
  ? record(task).status
  : STATUS.NOT_STARTED;
const countStatus = (items, status) => items.filter(task => ownStatus(task) === status).length;
const progress = items => items.length ? Math.round(countStatus(items, STATUS.COMPLETED) * 100 / items.length) : 0;
const totalProgress = () => Math.round(countStatus(TASKS, STATUS.COMPLETED) * 100 / TASKS.length);
const formatDate = value => value ? new Date(value).toLocaleString('th-TH', {
  dateStyle: 'medium', timeStyle: 'short'
}) : 'ยังไม่มีการปรับปรุง';

function errorMessage(error) { window.alert('บันทึกข้อมูลกลางไม่สำเร็จ: ' + error.message); }
function updateActionPermissions() {
  el('import').disabled = !CLOUD.canEdit();
  el('reset').disabled = !CLOUD.canEdit();
  el('export').disabled = !CLOUD.isReady();
}
function updateDashboard() {
  el('totalCount').textContent = TASKS.length;
  el('notStartedCount').textContent = countStatus(TASKS, STATUS.NOT_STARTED);
  el('inProgressCount').textContent = countStatus(TASKS, STATUS.IN_PROGRESS);
  el('completedCount').textContent = countStatus(TASKS, STATUS.COMPLETED);
  el('totalProgress').textContent = CLOUD.isReady() ? `${totalProgress()}%` : 'กำลังโหลด…';
  updateActionPermissions();
}

function renderWeeks() {
  el('weeks').innerHTML = WEEKS.map((name, index) => {
    const group = TASKS.filter(task => task.week === index + 1);
    const done = countStatus(group, STATUS.COMPLETED);
    const percent = progress(group);
    return `<button type="button" class="week ${week === index + 1 ? 'active' : ''}" aria-pressed="${week === index + 1}" data-week="${index + 1}">
      <span class="small">สัปดาห์ที่ ${index + 1} · ${group.length} ข้อ</span>
      <strong>${safe(name)}</strong>
      <div class="mini" aria-label="ความคืบหน้า ${percent}%"><span style="width:${percent}%"></span></div>
      <span class="small">เสร็จแล้ว ${done}/${group.length} · ${percent}%</span>
    </button>`;
  }).join('');
}

function renderScope(task, full) {
  const description = String(task.description || '');
  const paragraphs = description.split('\n').filter(Boolean);
  const items = Array.isArray(task.details) ? task.details : [];
  const visibleParagraphs = full ? paragraphs : paragraphs.slice(0, 1);
  const visibleItems = full ? items : items.slice(0, 3);
  return `<div class="scope ${full ? 'scope-full' : 'scope-preview'}">
    <b>รายละเอียดขอบเขต</b>
    ${visibleParagraphs.map(paragraph => `<p>${safe(paragraph)}</p>`).join('')}
    ${visibleItems.length ? `<ul>${visibleItems.map(item => `<li>${safe(item)}</li>`).join('')}</ul>` : ''}
    ${!full && (paragraphs.length > 1 || items.length > 3) ? '<span class="more-hint">มีรายละเอียดเพิ่มเติม</span>' : ''}
  </div>`;
}

function renderTask(task) {
  const saved = record(task);
  const status = ownStatus(task);
  const editable = CLOUD.canEdit();
  const note = drafts.has(task.id) ? drafts.get(task.id) : saved.note;
  const reference = String(task.reference || '').replace(/^\s*[—–-]\s*/, '').trim();
  return `<article class="task">
    <div class="task-top">
      <div class="task-left">
        <span class="tag" aria-label="เลขข้อ PDF: ${safe(reference)}">${safe(reference)}</span>
        <div class="task-title">${safe(task.title)}</div>
        <span class="role"><b>บทบาท:</b> ${safe(task.role)}</span>
      </div>
      <label class="status-control">สถานะ
        <select data-status="${safe(task.id)}" aria-label="สถานะ ${safe(task.id)}" ${editable ? "" : "disabled"}>
          <option value="${STATUS.NOT_STARTED}" ${status === STATUS.NOT_STARTED ? 'selected' : ''}>ยังไม่เริ่ม</option>
          <option value="${STATUS.IN_PROGRESS}" ${status === STATUS.IN_PROGRESS ? 'selected' : ''}>กำลังดำเนินการ</option>
          <option value="${STATUS.COMPLETED}" ${status === STATUS.COMPLETED ? 'selected' : ''}>เสร็จแล้ว</option>
        </select>
      </label>
    </div>
    ${renderScope(task, false)}
    <details class="details" ${expanded ? 'open' : ''}>
      <summary>${expanded ? 'ย่อรายละเอียด' : 'อ่านรายละเอียดทั้งหมด'}</summary>
      ${renderScope(task, true)}
      <label for="note-${safe(task.id)}">โน้ตความคืบหน้า</label>
      <textarea id="note-${safe(task.id)}" data-note="${safe(task.id)}" maxlength="10000" placeholder="${editable ? "บันทึกโน้ตของงานนี้" : "เข้าสู่ระบบและรับสิทธิ์ก่อนแก้ไข"}" ${editable ? "" : "disabled"}>${safe(note)}</textarea>
      <div class="updated">ปรับปรุงล่าสุด: ${safe(formatDate(saved.updatedAt))}</div>
    </details>
    <div class="current-status">สถานะปัจจุบัน: <b>${STATUS_LABELS[status]}</b></div>
  </article>`;
}

function render() {
  const group = TASKS.filter(task => task.week === week).sort((a, b) => a.order - b.order);
  const statusFilter = el('statusFilter').value;
  const roleFilter = el('roleFilter').value;
  const query = el('search').value.trim().toLocaleLowerCase();
  const shown = group.filter(task => {
    const searchable = [task.id, task.title, task.reference, task.description, task.role]
      .join(' ').toLocaleLowerCase();
    return (statusFilter === 'all' || ownStatus(task) === statusFilter)
      && (roleFilter === 'all' || task.role === roleFilter)
      && searchable.includes(query);
  });
  const done = countStatus(group, STATUS.COMPLETED);
  const percent = progress(group);

  updateDashboard();
  renderWeeks();
  el('weekTitle').textContent = `สัปดาห์ที่ ${week} — ${WEEKS[week - 1]}`;
  el('weekDesc').textContent = `งานทั้งหมด ${group.length} ข้อ · เสร็จแล้ว ${done} ข้อ · ความคืบหน้า ${percent}%`;
  el('weekGoal').textContent = PLANS[week - 1].goal;
  el('weekTogether').textContent = PLANS[week - 1].together;
  el('weekDeliverable').textContent = PLANS[week - 1].deliverable;
  el('weekBar').style.width = `${percent}%`;
  el('weekSummary').textContent = `ความคืบหน้าสัปดาห์นี้ ${percent}% (เสร็จแล้ว ${done}/${group.length})`;
  el('tasks').innerHTML = shown.length
    ? shown.map(renderTask).join('')
    : '<div class="empty">ไม่พบรายการตามตัวกรอง</div>';
}

async function resetAll() {
  if (!CLOUD.canEdit()) return;
  if (!window.confirm('รีเซ็ตสถานะและล้างโน้ตทั้ง 68 ข้อสำหรับทุกคนหรือไม่?')) return;
  try { await CLOUD.saveMany(initialState()); drafts.clear(); render(); }
  catch(error) { errorMessage(error); }
}
async function saveNote(id) {
  if (!CLOUD.canEdit() || noteSaving.has(id) || !drafts.has(id)) return;
  noteSaving.add(id);
  try {
    while (drafts.has(id)) {
      const value = drafts.get(id);
      await CLOUD.saveField(id,'note',value);
      if(drafts.get(id)===value) drafts.delete(id);
    }
    if(!document.activeElement?.matches('[data-note]')) render();
  } catch(error) { errorMessage(error); }
  finally { noteSaving.delete(id); }
}
el('weeks').addEventListener('click', event => {
  const button = event.target.closest('[data-week]');
  if (!button) return;
  week = Number(button.dataset.week);
  el('search').value = '';
  el('statusFilter').value = 'all';
  el('roleFilter').value = 'all';
  expanded = false;
  render();
});

el('tasks').addEventListener('change', async event => {
  const input = event.target;
  if(input.matches('[data-note]')) {
    const id=input.dataset.note;
    clearTimeout(noteTimers.get(id));
    await saveNote(id);
    return;
  }
  if(!input.matches('[data-status]') || !CLOUD.canEdit()) return;
  input.disabled = true;
  try { await CLOUD.saveField(input.dataset.status,'status',input.value); }
  catch(error) { errorMessage(error); render(); }
});
el('tasks').addEventListener('input', event => {
  const input=event.target;
  if(!input.matches('[data-note]') || !CLOUD.canEdit()) return;
  const id=input.dataset.note;
  drafts.set(id,input.value);
  clearTimeout(noteTimers.get(id));
  noteTimers.set(id,setTimeout(()=>{void saveNote(id);},850));
});
el('tasks').addEventListener('click', event => {
  const summary = event.target.closest('summary');
  if (!summary) return;
  setTimeout(() => {
    summary.textContent = summary.parentElement.open
      ? 'ย่อรายละเอียด'
      : 'อ่านรายละเอียดทั้งหมด';
  }, 0);
});

for (const id of ['search', 'statusFilter', 'roleFilter']) {
  el(id).addEventListener(id === 'search' ? 'input' : 'change', render);
}

el('expand').addEventListener('click', () => {
  expanded = !expanded;
  el('expand').textContent = expanded ? 'ย่อรายละเอียดทั้งหมด' : 'ขยายรายละเอียดทั้งหมด';
  render();
});
el('reset').addEventListener('click', () => {void resetAll();});
el('export').addEventListener('click', () => {
  if(!CLOUD.isReady()) return window.alert('ยังโหลดข้อมูลกลางไม่สำเร็จ');
  const output = {
    format: 'coopconnect-project-progress-v3',
    date: new Date().toISOString(),
    items: state
  };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'coopconnect-project-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el('import').addEventListener('click', () => el('importFile').click());
el('importFile').addEventListener('change', async event => {
  if(!CLOUD.canEdit()) return;
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (imported.format !== 'coopconnect-project-progress-v3'
      || !imported.items || typeof imported.items !== 'object' || Array.isArray(imported.items)) {
      throw new Error('รูปแบบไฟล์ไม่รองรับ');
    }
    const validItems = Object.fromEntries(Object.entries(imported.items)
      .filter(([id, value]) => TASKS.some(task => task.id === id)
        && value && Object.values(STATUS).includes(value.status))
      .map(([id, value]) => [id, {
        status: value.status,
        note: String(value.note || '').slice(0, 10000),
        updatedAt: value.updatedAt || null
      }]));
    await CLOUD.saveMany(normalizeState(validItems));
    drafts.clear();
    render();
    window.alert('นำเข้าข้อมูลลง Supabase สำเร็จ');
  } catch (error) {
    window.alert(`นำเข้าไม่สำเร็จ: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

const roles = [...new Set(TASKS.map(task => task.role))].sort();
el('roleFilter').insertAdjacentHTML('beforeend', roles.map(role => `<option value="${safe(role)}">${safe(role)}</option>`).join(''));
CLOUD.start({
  onSnapshot: snapshot => {
    state = normalizeState(snapshot);
    if(document.activeElement?.matches('[data-note]')) {
      updateDashboard();
      renderWeeks();
    } else render();
  },
  onAccess: () => render()
});
render();
