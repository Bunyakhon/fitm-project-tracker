/* CoopConnect cloud adapter: publishable key only; RLS secures writes. */
(function () {
'use strict';
const PROJECT_URL = 'https://epqbivhfjdnnmcwivogah.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_zoBBu3ha4ICyFIK6znarhA_xQpuxmeU';
const allowed = new Set(DATA.tasks.map(task => task.id));
const client = window.supabase?.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const get = id => document.getElementById(id);
const redirectTo = window.location.origin + window.location.pathname;
let signedInUser = null, editor = false, ready = false;
let onSnapshot = () => {}, onAccess = () => {}, channel = null, refreshTimer = null;
let passwordSetup = /(?:[?&#])type=(invite|recovery)(?:&|$)/.test(window.location.search + window.location.hash);
let requestedRefresh = 0;
function message(value, failure = false) {
  get('authMessage').textContent = value;
  get('authMessage').dataset.error = String(failure);
}
function syncMessage(value, failure = false) {
  get('cloudStatus').textContent = value;
  get('cloudStatus').dataset.error = String(failure);
}
const canEdit = () => Boolean(ready && signedInUser && editor);
const isReady = () => ready;
function accessUI() {
  get('authSignedOut').hidden = Boolean(signedInUser);
  get('authSignedIn').hidden = !signedInUser;
  get('authPasswordForm').hidden = !(signedInUser && passwordSetup);
  get('authUserLabel').textContent = signedInUser?.email || '';
  get('authRoleLabel').textContent = signedInUser
    ? (editor ? 'แก้ไขงานได้' : 'ยังไม่มีสิทธิ์แก้ไข โปรดให้ผู้ดูแลเพิ่ม UID ลง tracker_editors')
    : 'ผู้ชม · อ่านได้อย่างเดียว';
  get('import').disabled = !canEdit();
  get('reset').disabled = !canEdit();
  onAccess({ ready, editor, user: signedInUser });
}
async function checkAccount() {
  if (!client) return;
  const result = await client.auth.getUser();
  signedInUser = result.error ? null : result.data.user;
  editor = false;
  if (signedInUser) {
    const membership = await client.from('tracker_editors')
      .select('user_id').eq('user_id', signedInUser.id).maybeSingle();
    editor = !membership.error && Boolean(membership.data);
    if (membership.error) message('ตรวจสิทธิ์ผู้แก้ไขไม่สำเร็จ กรุณารีเฟรชหน้า', true);
  }
  accessUI();
}
async function refresh() {
  const ticket = ++requestedRefresh;
  if (!client) {
    ready = false;
    syncMessage('โหลด Supabase SDK ไม่สำเร็จ · แก้ไขข้อมูลไม่ได้', true);
    accessUI();
    return false;
  }
  const { data, error } = await client.from('tracker_progress')
    .select('task_id,status,note,updated_at').limit(200);
  if (ticket !== requestedRefresh) return false;
  if (error) {
    ready = false;
    syncMessage('อ่านข้อมูลกลางไม่สำเร็จ: ' + error.message, true);
    accessUI();
    return false;
  }
  const snapshot = {};
  for (const row of data || []) {
    if (!allowed.has(row.task_id)) continue;
    if (!['not_started','in_progress','completed'].includes(row.status)) continue;
    snapshot[row.task_id] = {
      status: row.status, note: String(row.note || ''), updatedAt: row.updated_at || null
    };
  }
  ready = true;
  syncMessage('เชื่อมต่อ Supabase แล้ว · สถานะและโน้ตเป็นข้อมูลส่วนกลาง');
  onSnapshot(snapshot);
  accessUI();
  return true;
}
function validate(id, field, value) {
  if (!canEdit()) throw Error('บัญชีนี้ไม่มีสิทธิ์แก้ไขหรือยังเชื่อมต่อข้อมูลไม่สำเร็จ');
  if (!allowed.has(id)) throw Error('ไม่พบรหัสงาน');
  if (field === 'status' && !['not_started','in_progress','completed'].includes(value)) {
    throw Error('สถานะไม่ถูกต้อง');
  }
  if (field === 'note' && (typeof value !== 'string' || value.length > 10000)) {
    throw Error('โน้ตต้องเป็นข้อความไม่เกิน 10,000 ตัวอักษร');
  }
  if (!['status','note'].includes(field)) throw Error('ไม่อนุญาตให้แก้ฟิลด์นี้');
}
async function saveField(id, field, value) {
  validate(id, field, value);
  const patch = { [field]: value, updated_at: new Date().toISOString() };
  // Field-only update prevents status changes from overwriting others' notes.
  const result = await client.from('tracker_progress')
    .update(patch).eq('task_id', id).select('task_id');
  if (result.error) throw Error(result.error.message);
  if (!result.data?.length) {
    const first = await client.from('tracker_progress')
      .insert({ task_id: id, [field]: value, updated_at: patch.updated_at });
    if (first.error) {
      if (first.error.code !== '23505') throw Error(first.error.message);
      const retry = await client.from('tracker_progress')
        .update(patch).eq('task_id', id).select('task_id');
      if (retry.error || !retry.data?.length) throw Error(retry.error?.message || 'บันทึกไม่สำเร็จ');
    }
  }
  const loaded = await refresh();
  if (!loaded && isReady()) return;
  if (!loaded) throw Error('บันทึกแล้ว แต่ยังโหลดข้อมูลกลับไม่ได้ กรุณารีเฟรชหน้า');
}
async function saveMany(items) {
  if (!canEdit()) throw Error('ไม่มีสิทธิ์แก้ไข');
  if (!items || Object.keys(items).length !== allowed.size) throw Error('จำนวนข้อไม่ครบ 68');
  const rows = [];
  for (const id of allowed) {
    const item = items[id];
    if (!item) throw Error('ข้อมูลไม่ครบสำหรับ ' + id);
    validate(id,'status',item.status);
    validate(id,'note',item.note || '');
    rows.push({
      task_id:id, status:item.status, note:item.note || '', updated_at:new Date().toISOString()
    });
  }
  const result = await client.from('tracker_progress').upsert(rows, {onConflict:'task_id'});
  if (result.error) throw Error(result.error.message);
  if (!await refresh() && !isReady()) throw Error('บันทึกแล้วแต่โหลดข้อมูลกลับไม่ได้ กรุณารีเฟรช');
}
async function bindAuth() {
  get('authSignInForm').addEventListener('submit', async e => {
    e.preventDefault();
    const button = get('authSignInButton');
    button.disabled = true;
    try {
      if (!client) throw Error('ไลบรารี Supabase โหลดไม่สำเร็จ');
      const result = await client.auth.signInWithPassword({
        email:get('authEmail').value.trim(),password:get('authPasswordInput').value
      });
      if (result.error) throw Error(result.error.message);
      get('authPasswordInput').value = '';
      await checkAccount();
      message('เข้าสู่ระบบสำเร็จ');
    } catch(err) { message(err.message, true); }
    finally { button.disabled = false; }
  });
  get('authResetLink').addEventListener('click', async () => {
    const email = get('authEmail').value.trim();
    if (!email) return message('กรุณากรอกอีเมลก่อน', true);
    try {
      const result = await client.auth.resetPasswordForEmail(email, {redirectTo});
      if (result.error) throw Error(result.error.message);
      message('ส่งคำขอแล้ว หากอีเมลอยู่ในระบบให้เปิดลิงก์ตั้งรหัสผ่านใหม่');
    } catch(err) { message(err.message, true); }
  });
  get('authShowPassword').addEventListener('click', () => {
    passwordSetup = !passwordSetup; accessUI();
  });
  get('authSavePasswordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const password = get('authNewPassword').value;
    if (password.length < 8 || password !== get('authConfirmPassword').value) {
      return message('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษรและตรงกันทั้งสองช่อง', true);
    }
    try {
      const result = await client.auth.updateUser({password});
      if (result.error) throw Error(result.error.message);
      get('authNewPassword').value = '';
      get('authConfirmPassword').value = '';
      passwordSetup = false;
      accessUI();
      message('ตั้งรหัสผ่านสำเร็จ');
    } catch(err) { message(err.message,true); }
  });
  get('authSignOut').addEventListener('click', async () => {
    try {
      const result = await client.auth.signOut();
      if (result.error) throw Error(result.error.message);
      signedInUser = null; editor = false; accessUI();
      message('ออกจากระบบแล้ว');
    } catch(err) { message(err.message, true); }
  });
}
async function start(callbacks) {
  onSnapshot = callbacks.onSnapshot;
  onAccess = callbacks.onAccess;
  await bindAuth();
  accessUI();
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search.replace(/^\?/, ''));
  if (hash.has('error_code') || search.has('error_code')) {
    message('ลิงก์คำเชิญหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ตั้งรหัสผ่านใหม่',true);
  }
  if (!client) {
    syncMessage('โหลด Supabase SDK ไม่สำเร็จ โปรดตรวจอินเทอร์เน็ต',true);
    return;
  }
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') passwordSetup = true;
    if (event === 'SIGNED_OUT') { signedInUser = null; editor = false; }
    // Avoid awaiting Supabase API from inside the synchronous auth callback.
    setTimeout(() => { void checkAccount(); }, 0);
  });
  await refresh();
  await checkAccount();
  channel = client.channel('coopconnect-progress')
    .on('postgres_changes', {event:'*', schema:'public', table:'tracker_progress'}, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void refresh(); }, 200);
    }).subscribe(value => {
      if (['CHANNEL_ERROR','TIMED_OUT'].includes(value)) {
        syncMessage('Realtime ขัดข้อง · รีเฟรชหน้าเพื่อดูข้อมูลใหม่',true);
      }
    });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
}
window.TrackerCloud = {start,refresh,canEdit,isReady,saveField,saveMany};
})();