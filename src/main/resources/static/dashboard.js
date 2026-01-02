/* dashboard.js – robust (guards all selectors) */
'use strict';

// Globals
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user = JSON.parse(localStorage.getItem('user') || 'null');
const isAdmin = () => roles.includes('ADMIN');
const isLogged = () => !!token;

// Bootstrap modals (guard if element exists)
const taskModalEl = document.getElementById('taskModal');
const taskModal = taskModalEl ? new bootstrap.Modal(taskModalEl) : null;
const loginModal = document.getElementById('loginModal') ? new bootstrap.Modal(document.getElementById('loginModal')) : null;
const signupModal = document.getElementById('signupModal') ? new bootstrap.Modal(document.getElementById('signupModal')) : null;

// Charts
let statusChart, priorityChart, weeklyChart, meStatusChart, mePriorityChart;

// API helper
async function api(path, opt = {}) {
  opt.headers = Object.assign({}, opt.headers || {});
  if (!opt.method) opt.method = 'GET';
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, opt);
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

// Utilities
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString();
}

// Auth UI
function setAuthUI() {
  const showAuth = !isLogged();
  const L = id => document.getElementById(id);
  if (L('loginBtn')) L('loginBtn').style.display = showAuth ? '' : 'none';
  if (L('signupBtn')) L('signupBtn').style.display = showAuth ? '' : 'none';
  if (L('logoutBtn')) L('logoutBtn').style.display = showAuth ? 'none' : '';
  if (L('newBtn')) L('newBtn').style.display = showAuth ? 'none' : '';
  if (L('menuAdmin')) L('menuAdmin').style.display = isAdmin() ? '' : 'none';
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

// Rendering
function render() {
  const totalEl = document.getElementById('total');
  const doneEl = document.getElementById('done');
  const openEl = document.getElementById('open');
  if (totalEl) totalEl.textContent = tasks.length;
  if (doneEl) doneEl.textContent = tasks.filter(t => t.status === 'DONE').length;
  if (openEl) openEl.textContent = tasks.filter(t => t.status !== 'DONE').length;

  const q = (document.getElementById('q')?.value || '').toLowerCase();
  const st = document.getElementById('status')?.value || '';
  const pr = document.getElementById('priority')?.value || '';

  const filtered = tasks.filter(t =>
    (!q || (t.title ?? '').toLowerCase().includes(q) || (t.assignee ?? '').toLowerCase().includes(q)) &&
    (!st || t.status === st) &&
    (!pr || t.priority === pr)
  );

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
        <button class="btn btn-sm btn-outline-success me-1" data-action="done" data-id="${t.id}"><i class="bi bi-check2"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${t.id}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-action="del" data-id="${t.id}"><i class="bi bi-trash"></i></button>
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

// Loaders
async function loadAdmin() {
  const s = await api('/api/stats/admin');
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('adminTotal', s.total);
  set('adminAssigned', s.assigned);
  set('adminDone', s.done);
  set('adminRunning', s.total - s.done);
  renderAdminCharts(s);
}

async function loadEmployee() {
  tasks = await api('/api/tasks');
  render();
  const s = await api('/api/stats/me');
  renderEmployeeCharts(s);
}

async function load() {
  applyRoleUI();
  if (!isLogged()) return;
  if (isAdmin()) await loadAdmin(); else await loadEmployee();
}

// Charts
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

// Task CRUD helpers
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
  document.getElementById('dueDate').value = t.dueDate ? new Date(t.dueDate).toISOString().slice(0,10) : '';
  document.getElementById('assignee').value = t.assignee ?? '';
  taskModal.show();
}

async function markDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  await api(`/api/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, status: 'DONE' }) });
  await loadEmployee();
}

async function delTask(id) {
  if (!confirm('Delete this task?')) return;
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  await loadEmployee();
}

// Business rules
function validateDueDate(dateStr) {
  if (!dateStr) return true;
  const sel = new Date(dateStr); sel.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return sel >= today;
}
const FLOW = { OPEN: ['OPEN', 'IN_PROGRESS'], IN_PROGRESS: ['IN_PROGRESS', 'DONE'], DONE: ['DONE'] };

// Events (guarded)
document.getElementById('newBtn')?.addEventListener('click', openNew);
document.getElementById('emptyCreateBtn')?.addEventListener('click', openNew);
document.getElementById('q')?.addEventListener('input', render);
document.getElementById('status')?.addEventListener('change', render);
document.getElementById('priority')?.addEventListener('change', render);
document.getElementById('clearFilters')?.addEventListener('click', () => {
  const q = document.getElementById('q'); const st = document.getElementById('status'); const pr = document.getElementById('priority');
  if (q) q.value = ''; if (st) st.value = ''; if (pr) pr.value = ''; render();
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

// Auth modals openers (fallback to page links if modals absent)
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
});

// Login (modal)
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { username: document.getElementById('lu').value.trim(), password: document.getElementById('lp').value };
  const err = document.getElementById('loginError'); if (err) err.style.display = 'none';
  const r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { if (err) { err.textContent = 'Invalid credentials'; err.style.display = 'block'; } return; }
  const data = await r.json();
  token = data.token; roles = data.roles || []; user = data.user || null;
  localStorage.setItem('token', token); localStorage.setItem('roles', JSON.stringify(roles)); localStorage.setItem('user', JSON.stringify(user));
  loginModal?.hide(); await load();
});

// Signup (modal)
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('sn').value.trim();
  const email = document.getElementById('se').value.trim();
  const u = document.getElementById('su').value.trim();
  const p = document.getElementById('sp').value;
  const err = document.getElementById('signupError'); if (err) err.style.display = 'none';
  if (p.length < 8) { if (err) { err.textContent = 'Password must be at least 8 characters'; err.style.display = 'block'; } return; }
  const r = await fetch('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, username: u, password: p }) });
  if (!r.ok) { if (err) { err.textContent = await r.text(); err.style.display = 'block'; } return; }
  const data = await r.json();
  token = data.token; roles = data.roles || []; user = data.user || null;
  localStorage.setItem('token', token); localStorage.setItem('roles', JSON.stringify(roles)); localStorage.setItem('user', JSON.stringify(user));
  signupModal?.hide(); await load();
});

// Task form submit
document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('taskId').value;
  const payload = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value,
    status: document.getElementById('statusInput').value,
    priority: document.getElementById('priorityInput').value,
    dueDate: document.getElementById('dueDate').value ? new Date(document.getElementById('dueDate').value).toISOString() : null,
    assignee: document.getElementById('assignee').value
  };
  if (!validateDueDate(document.getElementById('dueDate').value)) { alert('Due date cannot be in the past'); return; }
  if (id) {
    const prev = tasks.find(t => t.id === id)?.status ?? 'OPEN';
    if (!FLOW[prev].includes(payload.status)) { alert(`Invalid status transition ${prev} → ${payload.status}`); return; }
    await api(`/api/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id }) });
  } else {
    await api('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
  taskModal?.hide(); await load();
});

// Initial
applyRoleUI();
load();
