'use strict';

/* Dashboard interactions — Bootstrap 5 + vanilla JS only */

// Globals
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user = JSON.parse(localStorage.getItem('user') || 'null');
const isAdmin = () => roles.includes('ADMIN');
const isLogged = () => !!token;

// Bootstrap modals (guard existence)
const taskModalEl = document.getElementById('taskModal');
const taskModal = taskModalEl ? new bootstrap.Modal(taskModalEl) : null;
const loginModalEl = document.getElementById('loginModal');
const loginModal = loginModalEl ? new bootstrap.Modal(loginModalEl) : null;
const signupModalEl = document.getElementById('signupModal');
const signupModal = signupModalEl ? new bootstrap.Modal(signupModalEl) : null;
const calendarModalEl = document.getElementById('calendarModal');
const calendarModal = calendarModalEl ? new bootstrap.Modal(calendarModalEl) : null;

// Charts
let statusChart, priorityChart, weeklyChart, meStatusChart, mePriorityChart;

/* ------------- utilities ------------- */
function showLoader(on = true) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = on ? 'grid' : 'none';
}
function toast(msg, type = 'success') {
  const cont = document.getElementById('toastContainer'); if (!cont) return;
  // Show only error toasts; suppress success/info to match requirements
  if (type !== 'error') return;
  const t = document.createElement('div');
  t.className = `toast align-items-center text-white border-0 ${type}`;
  t.setAttribute('role', 'alert'); t.setAttribute('aria-live', 'assertive'); t.setAttribute('aria-atomic', 'true');
  t.innerHTML = `<div class="d-flex">
    <div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
  </div>`;
  cont.appendChild(t);
  new bootstrap.Toast(t, { delay: 2400 }).show();
  t.addEventListener('hidden.bs.toast', () => t.remove());
}

async function api(path, opt = {}) {
  opt.headers = Object.assign({}, opt.headers || {});
  if (!opt.method) opt.method = 'GET';
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  try {
    showLoader(true);
    const res = await fetch(path, opt);
    const txt = await res.text();
    if (!res.ok) throw new Error(txt || 'Request failed');
    return txt ? JSON.parse(txt) : null;
  } finally {
    showLoader(false);
  }
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString();
}
function toLocalDateString(val) {
  if (!val) return '';
  const d = new Date(val); d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

/* ------------- auth + theme ------------- */
function setAuthUI() {
  const showAuth = !isLogged();
  const L = id => document.getElementById(id);
  if (L('loginBtn')) L('loginBtn').style.display = showAuth ? '' : 'none';
  if (L('signupBtn')) L('signupBtn').style.display = showAuth ? '' : 'none';
  if (L('logoutBtn')) L('logoutBtn').style.display = showAuth ? 'none' : '';
  if (L('newBtn')) L('newBtn').style.display = showAuth ? 'none' : '';
  if (L('menuAdmin')) L('menuAdmin').style.display = isAdmin() ? '' : 'none';

  // Profile fill
  if (user) {
    document.getElementById('p_name')?.replaceChildren(document.createTextNode(user.name || '—'));
    document.getElementById('p_email')?.replaceChildren(document.createTextNode(user.email || '—'));
    document.getElementById('p_user')?.replaceChildren(document.createTextNode(user.username || '—'));
  }
}
function applyRoleUI() {
  setAuthUI();
  const pub = document.getElementById('publicPanel');
  const adm = document.getElementById('adminPanel');
  const emp = document.getElementById('employeePanel');
  if (!pub || !adm || !emp) return;

  if (!isLogged()) {
    pub.style.display = '';
    adm.style.display = 'none';
    emp.style.display = 'none';
    return;
  }
  pub.style.display = 'none';
  adm.style.display = isAdmin() ? '' : 'none';
  emp.style.display = isAdmin() ? 'none' : '';
}

// Dark mode
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const toggle = document.getElementById('darkToggle');
  if (toggle) toggle.checked = saved === 'dark';
})();
document.getElementById('darkToggle')?.addEventListener('change', (e) => {
  const theme = e.target.checked ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  // removed success toast on theme toggle
});

/* ------------- filters ------------- */
function currentFilters() {
  const q = (document.getElementById('q')?.value || '').toLowerCase();
  const st = document.getElementById('status')?.value || '';
  const pr = document.getElementById('priority')?.value || '';
  const from = document.getElementById('fromDate')?.value || '';
  const to   = document.getElementById('toDate')?.value || '';
  const sort = document.getElementById('sortBy')?.value || '';
  return { q, st, pr, from, to, sort };
}

/* ------------- rendering ------------- */
function render() {
  const totalEl = document.getElementById('total');
  const doneEl = document.getElementById('done');
  const openEl = document.getElementById('open');
  if (totalEl) totalEl.textContent = tasks.length;
  if (doneEl) doneEl.textContent = tasks.filter(t => t.status === 'DONE').length;
  if (openEl) openEl.textContent = tasks.filter(t => t.status !== 'DONE').length;

  const { q, st, pr, from, to, sort } = currentFilters();

  // Filter pipeline
  let filtered = tasks.filter(t =>
    (!q || (t.title ?? '').toLowerCase().includes(q) || (t.assignee ?? '').toLowerCase().includes(q)) &&
    (!st || t.status === st) &&
    (!pr || t.priority === pr)
  );
  // Date range
  if (from || to) {
    const fromD = from ? new Date(from) : null;
    const toD   = to ? new Date(to) : null;
    filtered = filtered.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      if (fromD && d < new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate())) return false;
      if (toD && d > new Date(toD.getFullYear(), toD.getMonth(), toD.getDate(), 23,59,59)) return false;
      return true;
    });
  }
  // Sorting
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const statusOrder = { OPEN: 0, IN_PROGRESS: 1, DONE: 2 };
  filtered.sort((a,b) => {
    switch (sort) {
      case 'dueAsc':  return new Date(a.dueDate||0) - new Date(b.dueDate||0);
      case 'dueDesc': return new Date(b.dueDate||0) - new Date(a.dueDate||0);
      case 'priority': return (priorityOrder[a.priority||'MEDIUM'] ?? 9) - (priorityOrder[b.priority||'MEDIUM'] ?? 9);
      case 'status': return (statusOrder[a.status||'OPEN'] ?? 9) - (statusOrder[b.status||'OPEN'] ?? 9);
      case 'title': return (a.title||'').localeCompare(b.title||'');
      default: return 0;
    }
  });

  const tbody = document.querySelector('#tasksTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  filtered.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="fw-semibold">${t.title ?? ''}</div><div class="text-muted small">${t.description ?? ''}</div></td>
      <td><span class="badge badge-status ${t.status}">${t.status ?? ''}</span></td>
      <td><span class="badge text-bg-secondary">${t.priority ?? ''}</span></td>
      <td>${fmtDate(t.dueDate)}</td>
      <td>${t.assignee ?? ''}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-success me-1" data-action="done" data-id="${t.id}" title="Mark done"><i class="bi bi-check2"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${t.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-action="del" data-id="${t.id}" title="Delete"><i class="bi bi-trash"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Empty state toggle
  const empty = tasks.length === 0;
  const emptyState = document.getElementById('emptyState');
  const tableWrap = document.getElementById('tasksTable')?.closest('.table-responsive');
  if (emptyState) emptyState.style.display = empty ? '' : 'none';
  if (tableWrap) tableWrap.style.display = empty ? 'none' : '';
}

/* ------------- loaders ------------- */
async function loadAdmin() {
  try {
    const s = await api('/api/stats/admin');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('adminTotal', s.total);
    set('adminAssigned', s.assigned);
    set('adminDone', s.done);
    set('adminRunning', s.total - s.done);
    renderAdminCharts(s);
  } catch (e) {
    toast(e.message || 'Failed to load admin stats', 'error');
  }
}

async function loadEmployee() {
  try {
    tasks = await api('/api/tasks');
    render();
    const s = await api('/api/stats/me');
    renderEmployeeCharts(s);
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  }
}

async function load() {
  applyRoleUI();
  if (!isLogged()) return;
  if (isAdmin()) await loadAdmin(); else await loadEmployee();
}

/* ------------- charts ------------- */
function renderAdminCharts(s) {
  const ctxPie = document.getElementById('statusChart');
  const ctxBar = document.getElementById('priorityChart');
  const ctxLine = document.getElementById('weeklyChart');
  if (!ctxPie || !ctxBar || !ctxLine) return;

  const dist = s.distribution, pr = s.priorities, w = s.weekly;

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(ctxPie, {
    type: 'pie',
    data: { labels: ['OPEN','IN_PROGRESS','DONE'],
      datasets: [{ data: [dist.OPEN, dist.IN_PROGRESS, dist.DONE],
        backgroundColor: ['#0d6efd77','#ffc10777','#19875477'],
        borderColor: ['#0d6efd','#ffc107','#198754'] }]},
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  if (priorityChart) priorityChart.destroy();
  priorityChart = new Chart(ctxBar, {
    type: 'bar',
    data: { labels: ['LOW','MEDIUM','HIGH'],
      datasets: [{ label: 'Tasks', data: [pr.LOW, pr.MEDIUM, pr.HIGH],
        backgroundColor: ['#6c757d','#0dcaf0','#dc3545'] }]},
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctxLine, {
    type: 'line',
    data: { labels: w.labels, datasets: [
      { label: 'Open', data: w.OPEN, borderColor: '#0d6efd', backgroundColor: '#0d6efd33', tension: .3 },
      { label: 'In progress', data: w.IN_PROGRESS, borderColor: '#ffc107', backgroundColor: '#ffc10733', tension: .3 },
      { label: 'Done', data: w.DONE, borderColor: '#198754', backgroundColor: '#19875433', tension: .3 }
    ]},
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}
function renderEmployeeCharts(s) {
  const ctxMe1 = document.getElementById('meStatusChart');
  const ctxMe2 = document.getElementById('mePriorityChart');
  if (!ctxMe1 || !ctxMe2) return;
  const dist = s.distribution, pr = s.priorities;

  if (meStatusChart) meStatusChart.destroy();
  meStatusChart = new Chart(ctxMe1, {
    type: 'doughnut',
    data: { labels: ['OPEN','IN_PROGRESS','DONE'],
      datasets: [{ data: [dist.OPEN, dist.IN_PROGRESS, dist.DONE],
        backgroundColor: ['#0d6efd77','#ffc10777','#19875477'],
        borderColor: ['#0d6efd','#ffc107','#198754'] }]},
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  if (mePriorityChart) mePriorityChart.destroy();
  mePriorityChart = new Chart(ctxMe2, {
    type: 'bar',
    data: { labels: ['LOW','MEDIUM','HIGH'],
      datasets: [{ label: 'Tasks', data: [pr.LOW, pr.MEDIUM, pr.HIGH],
        backgroundColor: ['#6c757d','#0dcaf0','#dc3545'] }]},
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

/* ------------- task CRUD ------------- */
function openNew() {
  if (!taskModal) return;
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskId').value = '';
  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('statusInput').value = 'OPEN';
  document.getElementById('priorityInput').value = 'MEDIUM';
  document.getElementById('dueDate').value = '';
  document.getElementById('assignee').value = '';
  taskModal.show();
}
function editTask(id) {
  if (!taskModal) return;
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskId').value = t.id;
  document.getElementById('title').value = t.title ?? '';
  document.getElementById('description').value = t.description ?? '';
  document.getElementById('statusInput').value = t.status ?? 'OPEN';
  document.getElementById('priorityInput').value = t.priority ?? 'MEDIUM';
  document.getElementById('dueDate').value = toLocalDateString(t.dueDate);
  document.getElementById('assignee').value = t.assignee ?? '';
  taskModal.show();
}
async function markDone(id) {
  try {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    await api(`/api/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, status: 'DONE' }) });
    toast('Task marked as done');
    await loadEmployee();
  } catch (e) {
    toast(e.message || 'Failed to mark done', 'error');
  }
}
async function delTask(id) {
  try {
    if (!confirm('Delete this task?')) return;
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    toast('Task deleted', 'success');
    await loadEmployee();
  } catch (e) {
    toast(e.message || 'Delete failed', 'error');
  }
}

/* ------------- validations ------------- */
function validateDueDate(dateStr) {
  if (!dateStr) return true;
  const sel = new Date(dateStr); sel.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return sel >= today;
}
const FLOW = { OPEN: ['OPEN', 'IN_PROGRESS'], IN_PROGRESS: ['IN_PROGRESS', 'DONE'], DONE: ['DONE'] };

/* ------------- events ------------- */
document.getElementById('newBtn')?.addEventListener('click', openNew);
document.getElementById('menuCreate')?.addEventListener('click', openNew);
document.getElementById('emptyCreateBtn')?.addEventListener('click', openNew);

// Filters
['q','status','priority','fromDate','toDate','sortBy'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', render);
  document.getElementById(id)?.addEventListener('change', render);
});
document.getElementById('clearFilters')?.addEventListener('click', () => {
  ['q','status','priority','fromDate','toDate','sortBy'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  render();
});
document.getElementById('globalSearch')?.addEventListener('input', (e) => {
  const qEl = document.getElementById('q'); if (qEl) { qEl.value = e.target.value; render(); }
});

// Delegate actions on table buttons
document.querySelector('#tasksTable tbody')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const id = btn.getAttribute('data-id'); const act = btn.getAttribute('data-action');
  if (act === 'done') markDone(id);
  if (act === 'edit') editTask(id);
  if (act === 'del') delTask(id);
});

// Auth modal openers (fallback to pages)
document.getElementById('loginBtn')?.addEventListener('click', () => loginModal ? loginModal.show() : (location.href = '/login'));
document.getElementById('signupBtn')?.addEventListener('click', () => signupModal ? signupModal.show() : (location.href = '/signup'));
document.getElementById('publicLogin')?.addEventListener('click', () => loginModal ? loginModal.show() : (location.href = '/login'));
document.getElementById('publicSignup')?.addEventListener('click', () => signupModal ? signupModal.show() : (location.href = '/signup'));

// Password visibility
document.getElementById('toggleLoginPw')?.addEventListener('click', () => {
  const i = document.getElementById('lp'); if (i) i.type = i.type === 'password' ? 'text' : 'password';
});
document.getElementById('toggleSignupPw')?.addEventListener('click', () => {
  const i = document.getElementById('sp'); if (i) i.type = i.type === 'password' ? 'text' : 'password';
});

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  token = ''; roles = []; user = null;
  localStorage.removeItem('token'); localStorage.removeItem('roles'); localStorage.removeItem('user');
  [statusChart, priorityChart, weeklyChart, meStatusChart, mePriorityChart].forEach(c => { try { c?.destroy(); } catch {} });
  tasks = []; render(); applyRoleUI();
  // redirect to Landing page instead of staying on dashboard
  location.href = '/';
});

// Login (modal)
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('lu'); const p = document.getElementById('lp');
  if (!u.value) u.classList.add('is-invalid'); else u.classList.remove('is-invalid');
  if (!p.value) p.classList.add('is-invalid'); else p.classList.remove('is-invalid');
  if (!u.value || !p.value) return;

  const err = document.getElementById('loginError'); if (err) err.style.display = 'none';
  try {
    const r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u.value.trim(), password: p.value }) });
    if (!r.ok) throw new Error('Invalid credentials');
    const data = await r.json();
    token = data.token; roles = data.roles || []; user = data.user || null;
    localStorage.setItem('token', token); localStorage.setItem('roles', JSON.stringify(roles)); localStorage.setItem('user', JSON.stringify(user));
    loginModal?.hide();
    await load();
  } catch (ex) {
    if (err) { err.textContent = ex.message; err.style.display = 'block'; }
    toast('Login failed', 'error'); // keep error toast
  }
});

// Signup (modal)
document.getElementById('sp')?.addEventListener('input', (e) => {
  const v = e.target.value.length;
  document.getElementById('pwStrength').textContent = v < 8 ? 'Weak password' : (v < 12 ? 'Good password' : 'Strong password');
});
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('sn'); const email = document.getElementById('se');
  const u = document.getElementById('su'); const p = document.getElementById('sp');
  [name, email, u, p].forEach(el => { if (!el.value) el.classList.add('is-invalid'); else el.classList.remove('is-invalid'); });
  const err = document.getElementById('signupError'); if (err) err.style.display = 'none';
  if (p.value.length < 8) { if (err) { err.textContent = 'Password must be at least 8 characters'; err.style.display = 'block'; } return; }

  try {
    const r = await fetch('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value.trim(), email: email.value.trim(), username: u.value.trim(), password: p.value }) });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    token = data.token; roles = data.roles || []; user = data.user || null;
    localStorage.setItem('token', token); localStorage.setItem('roles', JSON.stringify(roles)); localStorage.setItem('user', JSON.stringify(user));
    signupModal?.hide();
    await load();
  } catch (ex) {
    if (err) { err.textContent = ex.message; err.style.display = 'block'; }
    toast('Signup failed', 'error'); // keep error toast
  }
});

/* ------------- calendar ------------- */
function buildCalendarGrid(items) {
  const grid = document.getElementById('calendarGrid'); if (!grid) return;
  grid.innerHTML = '';
  const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
  const first = new Date(year, month, 1); const startDay = (first.getDay()+6)%7; // Monday-first grid
  const daysInMonth = new Date(year, month+1, 0).getDate();

  for (let i=0;i<startDay;i++) grid.appendChild(document.createElement('div')); // leading blanks

  for (let d=1; d<=daysInMonth; d++) {
    const cell = document.createElement('div'); cell.className='day';
    const date = new Date(year, month, d);
    const iso = date.toISOString().slice(0,10);
    cell.innerHTML = `<span class="date">${d}</span>`;
    const dayTasks = items.filter(t => toLocalDateString(t.dueDate) === iso);
    dayTasks.slice(0,3).forEach(t => {
      const pill = document.createElement('span');
      pill.className = `pill ${t.priority==='HIGH'?'pill-high':t.priority==='MEDIUM'?'pill-med':'pill-low'}`;
      pill.textContent = t.title;
      cell.appendChild(pill);
    });
    if (dayTasks.length > 3) {
      const more = document.createElement('span'); more.className='pill pill-low'; more.textContent = `+${dayTasks.length-3} more`;
      cell.appendChild(more);
    }
    grid.appendChild(cell);
  }
}
document.getElementById('calendarBtn')?.addEventListener('click', async () => {
  if (!isLogged()) return;
  if (!tasks.length) await loadEmployee();
  buildCalendarGrid(tasks);
  calendarModal?.show();
});

/* ------------- init ------------- */
applyRoleUI();
load();
