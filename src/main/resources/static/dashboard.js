/* dashboard.js – Plain JavaScript (NO JSX, NO TS) */
'use strict';

let tasks = [];
const modal = new bootstrap.Modal(document.getElementById('taskModal'));

let token = localStorage.getItem('token') || '';

async function api(path, opt = {}) {
  opt.headers = Object.assign({}, opt.headers || {});
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, opt);
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString();
}

function render() {
  // stats
  document.getElementById('total').textContent = tasks.length;
  document.getElementById('done').textContent = tasks.filter(t => t.status === 'DONE').length;
  document.getElementById('open').textContent = tasks.filter(t => t.status !== 'DONE').length;

  // filters
  const q = document.getElementById('q').value.toLowerCase();
  const st = document.getElementById('status').value;
  const pr = document.getElementById('priority').value;

  const filtered = tasks.filter(t =>
    (!q || (t.title ?? '').toLowerCase().includes(q) || (t.assignee ?? '').toLowerCase().includes(q)) &&
    (!st || t.status === st) &&
    (!pr || t.priority === pr)
  );

  const tbody = document.querySelector('#tasksTable tbody');
  tbody.innerHTML = '';
  filtered.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="fw-semibold">${t.title ?? ''}</div>
        <div class="text-muted small">${t.description ?? ''}</div>
      </td>
      <td><span class="badge badge-status ${t.status}">${t.status ?? ''}</span></td>
      <td><span class="badge text-bg-secondary">${t.priority ?? ''}</span></td>
      <td>${fmtDate(t.dueDate)}</td>
      <td>${t.assignee ?? ''}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-success me-1" onclick="markDone('${t.id}')"><i class="bi bi-check2"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editTask('${t.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="delTask('${t.id}')"><i class="bi bi-trash"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });
}

async function load() {
  tasks = await api('/api/tasks');
  render();
}

function openNew() {
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskId').value = '';
  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('statusInput').value = 'OPEN';
  document.getElementById('priorityInput').value = 'MEDIUM';
  document.getElementById('dueDate').value = '';
  document.getElementById('assignee').value = '';
  modal.show();
}

function editTask(id) {
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
  modal.show();
}

async function markDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  await api(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...t, status: 'DONE' })
  });
  await load();
}

async function delTask(id) {
  if (!confirm('Delete this task?')) return;
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  await load();
}

document.getElementById('toggleLoginPw').addEventListener('click', () => {
  const i = document.getElementById('lp'); i.type = i.type === 'password' ? 'text' : 'password';
});
document.getElementById('toggleSignupPw').addEventListener('click', () => {
  const i = document.getElementById('sp'); i.type = i.type === 'password' ? 'text' : 'password';
});

let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user = JSON.parse(localStorage.getItem('user') || 'null');
const isAdmin = () => roles.includes('ADMIN');
const isLogged = () => !!token;

function setAuthUI() {
  const showAuth = !isLogged();
  document.getElementById('loginBtn').style.display = showAuth ? '' : 'none';
  document.getElementById('signupBtn').style.display = showAuth ? '' : 'none';
  document.getElementById('logoutBtn').style.display = showAuth ? 'none' : '';
  // New Task should be available only when logged
  document.getElementById('newBtn').style.display = showAuth ? 'none' : '';
}

function applyRoleUI() {
  setAuthUI();
  // Public vs personal
  const publicPanel = document.getElementById('publicPanel');
  const adminPanel = document.getElementById('adminPanel');
  const employeePanel = document.getElementById('employeePanel');

  if (!isLogged()) {
    publicPanel.style.display = '';
    adminPanel.style.display = 'none';
    employeePanel.style.display = 'none';
    return;
  }
  publicPanel.style.display = 'none';
  adminPanel.style.display = isAdmin() ? '' : 'none';
  employeePanel.style.display = isAdmin() ? 'none' : '';
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  // clear auth and UI
  token = ''; roles = []; user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('roles');
  localStorage.removeItem('user');
  // destroy charts if present
  [statusChart, priorityChart, weeklyChart, meStatusChart, mePriorityChart].forEach(c => { try { c?.destroy(); } catch {} });
  // reset table
  tasks = []; render();
  applyRoleUI();
});

async function load() {
  applyRoleUI();
  if (!isLogged()) return;
  if (isAdmin()) { await loadAdmin(); } else { await loadEmployee(); }
}

// store roles and user at auth
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { username: document.getElementById('lu').value.trim(), password: document.getElementById('lp').value };
  const err = document.getElementById('loginError'); err.style.display = 'none';
  const r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { err.textContent = 'Invalid credentials'; err.style.display = 'block'; return; }
  const data = await r.json();
  token = data.token; roles = data.roles || []; user = data.user || null;
  localStorage.setItem('token', token);
  localStorage.setItem('roles', JSON.stringify(roles));
  localStorage.setItem('user', JSON.stringify(user));
  loginModal.hide(); await load();
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('sn').value.trim();
  const email = document.getElementById('se').value.trim();
  const u = document.getElementById('su').value.trim();
  const p = document.getElementById('sp').value;
  const err = document.getElementById('signupError'); err.style.display = 'none';
  if (p.length < 8) { err.textContent = 'Password must be at least 8 characters'; err.style.display = 'block'; return; }
  const r = await fetch('/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, username: u, password: p })
  });
  if (!r.ok) { err.textContent = await r.text(); err.style.display = 'block'; return; }
  const data = await r.json();
  token = data.token; roles = data.roles || []; user = data.user || null;
  localStorage.setItem('token', token);
  localStorage.setItem('roles', JSON.stringify(roles));
  localStorage.setItem('user', JSON.stringify(user));
  signupModal.hide(); await load();
});

// Business rules (UI guards)
function validateDueDate(dateStr) {
  if (!dateStr) return true;
  const sel = new Date(dateStr); sel.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return sel >= today;
}
const FLOW = { OPEN: ['OPEN', 'IN_PROGRESS'], IN_PROGRESS: ['IN_PROGRESS', 'DONE'], DONE: ['DONE'] };

document.getElementById('taskForm').addEventListener('submit', async (e) => {
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
  modal.hide(); await load();
});

document.getElementById('newBtn').addEventListener('click', openNew);
document.getElementById('q').addEventListener('input', render);
document.getElementById('status').addEventListener('change', render);
document.getElementById('priority').addEventListener('change', render);
document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('q').value = '';
  document.getElementById('status').value = '';
  document.getElementById('priority').value = '';
  render();
});

/* Auth UI */
const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
const signupModal = new bootstrap.Modal(document.getElementById('signupModal'));

document.getElementById('loginBtn').addEventListener('click', () => loginModal.show());
document.getElementById('signupBtn').addEventListener('click', () => signupModal.show());

applyRoleUI();
load();
