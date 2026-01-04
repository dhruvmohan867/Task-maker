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

// Theme helpers
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Sync Bootstrap navbar classes (dark ↔ light)
  document.querySelectorAll('.navbar').forEach(n => {
    n.classList.remove('navbar-dark','bg-dark','navbar-light','bg-light');
    if (theme === 'dark') n.classList.add('navbar-dark','bg-dark');
    else n.classList.add('navbar-light','bg-light');
  });
}

(function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  setTheme(saved);
  const toggle = document.getElementById('darkToggle');
  if (toggle) toggle.checked = saved === 'dark';
})();

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('darkToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      setTheme(theme);
      localStorage.setItem('theme', theme);
    });
  }
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
    document.body.classList.add('is-loading');

    // Admin: fetch tasks for org-level analytics + keep existing stats endpoint for compatibility.
    const [allTasks, s] = await Promise.all([
      api('/api/tasks'),
      api('/api/stats/admin')
    ]);

    tasks = allTasks || [];               // keep global tasks list for table (if any admin table exists)
    derivedTasksCache = deriveTasks(tasks);

    // Keep existing IDs updated (compat)
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (s) {
      set('adminTotal', s.total);
      set('adminAssigned', s.assigned);
      set('adminDone', s.done);
      set('adminRunning', s.total - s.done);
    }

    // Enterprise charts computed from tasks
    updateEnterpriseDash();
  } catch (e) {
    toast(e.message || 'Failed to load admin data', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
}

async function loadEmployee() {
  try {
    document.body.classList.add('is-loading');

    tasks = await api('/api/tasks');
    derivedTasksCache = deriveTasks(tasks);

    // Existing table render remains intact
    render();

    // Keep existing stats endpoint (employee)
    await api('/api/stats/me'); // we keep call to ensure backend contract remains used
    updateEnterpriseDash();
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
}

async function load() {
  applyRoleUI();
  if (!isLogged()) return;
  if (isAdmin()) await loadAdmin();
  else await loadEmployee();
  setLastUpdated();
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

// -------------------------------
// Enterprise dashboard layer
// - Client-side analytics derived from tasks
// - Chart.js only (no external libs)
// - Reuses canvases, debounced updates
// -------------------------------

/** Performance: debounce UI-driven recomputes */
function debounce(fn, ms = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Parse MongoDB ObjectId timestamp (if `id` is 24 hex chars). */
function createdAtFromObjectId(id) {
  if (!id || typeof id !== 'string' || id.length < 8) return null;
  const hex = id.slice(0, 8);
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) return null;
  const seconds = parseInt(hex, 16);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/** Priority mapping used for scatter/bubble y-axis. */
function priorityToNum(p) {
  switch (p) {
    case 'LOW': return 1;
    case 'MEDIUM': return 2;
    case 'HIGH': return 3;
    default: return 2;
  }
}
function numToPriorityLabel(n) {
  if (n <= 1) return 'LOW';
  if (n === 2) return 'MEDIUM';
  return 'HIGH';
}

/** Derived task fields for analytics only (no backend changes). */
function deriveTasks(items) {
  const now = new Date();
  return (items || []).map(t => {
    const createdAt = t.createdAt ? new Date(t.createdAt) : createdAtFromObjectId(t.id);
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const isDone = t.status === 'DONE';
    const overdue = !!due && !isDone && due < now;
    const titleLen = (t.title || '').trim().length;
    const descLen  = (t.description || '').trim().length;

    // Complexity: approximate from text size (0..100). Explainer: no "complexity" field exists.
    const complexity = Math.min(100, Math.round((titleLen * 0.8 + descLen * 0.25)));

    // Effort: approximate lead-time in days (created → due). If missing, 0.
    const effortDays = (createdAt && due) ? Math.max(0, Math.round((due - createdAt) / 86400000)) : 0;

    return { ...t, __createdAt: createdAt, __due: due, __overdue: overdue, __complexity: complexity, __effortDays: effortDays };
  });
}

/** Shared analytics filters (client-side only). */
const analyticsFilters = {
  rangeDays: 30,        // default
  status: '',
  priority: '',
  assignee: ''
};

function applyAnalyticsFilters(items) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (analyticsFilters.rangeDays || 30));
  return (items || []).filter(t => {
    const due = t.__due;
    // Date-range filter uses dueDate (since backend does not provide completion date).
    if (due && due < from) return false;
    if (analyticsFilters.status && t.status !== analyticsFilters.status) return false;
    if (analyticsFilters.priority && t.priority !== analyticsFilters.priority) return false;
    if (analyticsFilters.assignee && (t.assignee || '') !== analyticsFilters.assignee) return false;
    return true;
  });
}

/** KPI count-up animation (respects reduced motion). */
function animateNumber(el, to) {
  if (!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = String(to); return; }

  const from = Number(el.textContent || 0) || 0;
  const start = performance.now();
  const dur = 700;
  const step = (ts) => {
    const p = Math.min(1, (ts - start) / dur);
    // easeOutCubic
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    el.textContent = String(v);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* -------------------------------
   Chart registry (reuse canvases)
   ------------------------------- */
const charts = new Map(); // canvasId -> Chart

function getCanvas(id) {
  const c = document.getElementById(id);
  return c ? c.getContext('2d') : null;
}

function upsertChart(canvasId, config) {
  const ctx = getCanvas(canvasId);
  if (!ctx) return null;

  const existing = charts.get(canvasId);
  if (!existing) {
    const ch = new Chart(ctx, config);
    charts.set(canvasId, ch);
    return ch;
  }

  // Update in place when possible (performance)
  existing.config.type = config.type;
  existing.options = config.options || existing.options;
  existing.data.labels = config.data.labels;
  existing.data.datasets = config.data.datasets;
  existing.update();
  return existing;
}

/** Chart styling defaults (premium) */
Chart.defaults.font.family = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#64748b';
Chart.defaults.animation.duration = 650;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

/** Helper: theme-aware colors */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function colorForStatus(st) {
  if (st === 'OPEN') return '#0d6efd';
  if (st === 'IN_PROGRESS') return '#f59e0b';
  return '#16a34a';
}
function alpha(hex, a) {
  // hex like #rrggbb
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------------------------------
   Analytics builders (Employee + Admin)
   --------------------------------------- */

function buildDistribution(items) {
  const dist = { OPEN:0, IN_PROGRESS:0, DONE:0 };
  (items || []).forEach(t => { if (dist[t.status] != null) dist[t.status]++; });
  return dist;
}
function buildPriorities(items) {
  const pr = { LOW:0, MEDIUM:0, HIGH:0 };
  (items || []).forEach(t => { if (pr[t.priority] != null) pr[t.priority]++; });
  return pr;
}
function buildStatusPriorityMatrix(items) {
  const statuses = ['OPEN','IN_PROGRESS','DONE'];
  const prios = ['LOW','MEDIUM','HIGH'];
  const m = {};
  statuses.forEach(s => { m[s] = { LOW:0, MEDIUM:0, HIGH:0 }; });
  (items || []).forEach(t => {
    if (!m[t.status]) return;
    if (!m[t.status][t.priority]) return;
    m[t.status][t.priority]++;
  });
  return { statuses, prios, m };
}

/** Bucketing by week start (Mon) for trend charts. */
function weekKey(d) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // Monday=0
  dt.setDate(dt.getDate() - day);
  dt.setHours(0,0,0,0);
  return dt.toISOString().slice(0,10);
}

/**
 * Completion series:
 * We do NOT have a true "completedAt" field. Workaround:
 * - count DONE tasks bucketed by their dueDate week (or createdAt if due missing).
 * This keeps charts meaningful without backend changes.
 */
function buildCompletionSeries(items, weeks = 12) {
  const now = new Date();
  const labels = [];
  const counts = [];

  // Build label keys oldest -> newest
  const cursor = new Date(now);
  cursor.setHours(0,0,0,0);
  // align to Monday
  const day = (cursor.getDay() + 6) % 7;
  cursor.setDate(cursor.getDate() - day);

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i * 7);
    labels.push(d.toISOString().slice(0,10));
  }

  const map = new Map(labels.map(l => [l, 0]));
  (items || []).forEach(t => {
    if (t.status !== 'DONE') return;
    const base = t.__due || t.__createdAt;
    if (!base) return;
    const k = weekKey(base);
    if (map.has(k)) map.set(k, map.get(k) + 1);
  });

  labels.forEach(l => counts.push(map.get(l) || 0));
  return { labels, counts };
}

/** Tasks per assignee (admin horizontal bar). */
function buildAssigneeCounts(items) {
  const map = new Map();
  (items || []).forEach(t => {
    const a = (t.assignee || '').trim() || 'Unassigned';
    map.set(a, (map.get(a) || 0) + 1);
  });
  const pairs = [...map.entries()].sort((a,b) => b[1] - a[1]).slice(0, 12); // cap for readability
  return { labels: pairs.map(p => p[0]), counts: pairs.map(p => p[1]) };
}

/** Radar metrics (team/user performance). */
function buildRadar(items, assignee) {
  const scoped = (assignee && assignee !== '__ALL__')
    ? (items || []).filter(t => (t.assignee || '') === assignee)
    : (items || []);

  const total = scoped.length || 1;
  const done = scoped.filter(t => t.status === 'DONE').length;
  const overdue = scoped.filter(t => t.__overdue).length;
  const assigned = scoped.filter(t => (t.assignee || '').trim()).length;

  // Normalized metrics 0..100
  const completion = Math.round((done / total) * 100);
  const overdueRate = Math.round((overdue / total) * 100);
  const assignmentRate = Math.round((assigned / total) * 100);

  // Effort/complexity averages (clamped)
  const avgComplex = Math.min(100, Math.round(scoped.reduce((s,t) => s + (t.__complexity || 0), 0) / total));
  const avgEffort = Math.min(100, Math.round(scoped.reduce((s,t) => s + Math.min(100, (t.__effortDays || 0)), 0) / total));

  return {
    labels: ['Completion', 'Low Overdue', 'Assigned', 'Complexity', 'Effort'],
    // "Low Overdue" = 100 - overdueRate for a "good" direction
    values: [completion, 100 - overdueRate, assignmentRate, avgComplex, avgEffort]
  };
}

/** Scatter: due date vs priority (x=days until due, y=priority number). */
function buildScatterDuePriority(items) {
  const now = new Date();
  const points = [];
  (items || []).forEach(t => {
    if (!t.__due) return;
    const x = Math.round((t.__due - now) / 86400000);
    const y = priorityToNum(t.priority);
    points.push({ x, y });
  });
  return points;
}

/** Bubble: complexity vs effort; bubble radius=priority. */
function buildBubbleComplexityEffort(items) {
  const pts = [];
  (items || []).forEach(t => {
    const x = Math.min(100, t.__complexity || 0);
    const y = Math.min(100, t.__effortDays || 0);
    const r = 4 + priorityToNum(t.priority) * 2;
    pts.push({ x, y, r });
  });
  return pts.slice(0, 180); // cap for performance in the browser
}

/** Mixed: created vs completed per week (createdAt from ObjectId). */
function buildMixedCreatedCompleted(items, weeks = 12) {
  const now = new Date();
  const labels = [];
  const cursor = new Date(now);
  cursor.setHours(0,0,0,0);
  const day = (cursor.getDay() + 6) % 7;
  cursor.setDate(cursor.getDate() - day);

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i * 7);
    labels.push(d.toISOString().slice(0,10));
  }

  const createdMap = new Map(labels.map(l => [l, 0]));
  const doneMap = new Map(labels.map(l => [l, 0]));

  (items || []).forEach(t => {
    if (t.__createdAt) {
      const k = weekKey(t.__createdAt);
      if (createdMap.has(k)) createdMap.set(k, createdMap.get(k) + 1);
    }
    if (t.status === 'DONE') {
      const base = t.__due || t.__createdAt;
      if (!base) return;
      const k = weekKey(base);
      if (doneMap.has(k)) doneMap.set(k, doneMap.get(k) + 1);
    }
  });

  return {
    labels,
    created: labels.map(l => createdMap.get(l) || 0),
    completed: labels.map(l => doneMap.get(l) || 0)
  };
}

/* -------------------------------
   Render: Employee dashboard
   ------------------------------- */
let employeeStatusType = 'pie';

function renderEmployeeEnterprise(derivedAllTasks) {
  const scoped = applyAnalyticsFilters(derivedAllTasks);

  // KPIs
  const total = scoped.length;
  const done = scoped.filter(t => t.status === 'DONE').length;
  const pending = total - done;
  const overdue = scoped.filter(t => t.__overdue).length;

  animateNumber(document.getElementById('total'), total);
  animateNumber(document.getElementById('done'), done);
  animateNumber(document.getElementById('pending'), pending);
  animateNumber(document.getElementById('overdue'), overdue);

  // Status chart (pie/doughnut toggle)
  const dist = buildDistribution(scoped);
  const statusCfg = {
    type: employeeStatusType,
    data: {
      labels: ['OPEN','IN_PROGRESS','DONE'],
      datasets: [{
        data: [dist.OPEN, dist.IN_PROGRESS, dist.DONE],
        backgroundColor: [alpha(colorForStatus('OPEN'), .25), alpha(colorForStatus('IN_PROGRESS'), .25), alpha(colorForStatus('DONE'), .25)],
        borderColor: [colorForStatus('OPEN'), colorForStatus('IN_PROGRESS'), colorForStatus('DONE')],
        borderWidth: 1.5
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      cutout: employeeStatusType === 'doughnut' ? '64%' : undefined
    }
  };
  upsertChart('meStatusChart', statusCfg);

  // Priority chart
  const pr = buildPriorities(scoped);
  upsertChart('mePriorityChart', {
    type: 'doughnut',
    data: {
      labels: ['LOW','MEDIUM','HIGH'],
      datasets: [{
        data: [pr.LOW, pr.MEDIUM, pr.HIGH],
        backgroundColor: [alpha('#64748b', .25), alpha('#06b6d4', .25), alpha('#dc2626', .25)],
        borderColor: ['#64748b','#06b6d4','#dc2626'],
        borderWidth: 1.5
      }]
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
  });

  // Productivity gauge (done rate, penalize overdue)
  const doneRate = total ? (done / total) : 0;
  const overduePenalty = total ? (overdue / total) : 0;
  const score = Math.max(0, Math.min(1, doneRate - 0.6 * overduePenalty));
  const scorePct = Math.round(score * 100);
  const label = document.getElementById('productivityLabel');
  if (label) label.textContent = `${scorePct}% (done rate minus overdue penalty)`;

  upsertChart('empGaugeChart', {
    type: 'doughnut',
    data: {
      labels: ['Score','Remaining'],
      datasets: [{
        data: [scorePct, 100 - scorePct],
        backgroundColor: [alpha(cssVar('--accent', '#2563eb'), .35), alpha('#94a3b8', .18)],
        borderColor: [cssVar('--accent', '#2563eb'), alpha('#94a3b8', .10)],
        borderWidth: 1
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      cutout: '78%',
      circumference: 180,
      rotation: 270
    }
  });

  // Completion area (weekly)
  const comp = buildCompletionSeries(scoped, 12);
  upsertChart('empCompletionArea', {
    type: 'line',
    data: {
      labels: comp.labels,
      datasets: [{
        label: 'Completed (by due-week)',
        data: comp.counts,
        borderColor: cssVar('--success', '#16a34a'),
        backgroundColor: alpha(cssVar('--success', '#16a34a'), .18),
        tension: .35,
        fill: true,
        pointRadius: 2
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // Stacked bar: status × priority
  const sp = buildStatusPriorityMatrix(scoped);
  upsertChart('empStatusPriorityStacked', {
    type: 'bar',
    data: {
      labels: sp.prios,
      datasets: sp.statuses.map(st => ({
        label: st,
        data: sp.prios.map(p => sp.m[st][p]),
        backgroundColor: alpha(colorForStatus(st), .25),
        borderColor: colorForStatus(st),
        borderWidth: 1
      }))
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      responsive: true,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });

  // Scatter due vs priority
  const pts = buildScatterDuePriority(scoped);
  upsertChart('empScatterDuePriority', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Tasks',
        data: pts,
        backgroundColor: alpha(cssVar('--accent', '#2563eb'), .35),
        borderColor: alpha(cssVar('--accent', '#2563eb'), .65),
        pointRadius: 4
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const x = ctx.raw.x;
              const y = ctx.raw.y;
              return `Due in ${x} days · Priority ${numToPriorityLabel(y)}`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Days until due' } },
        y: { title: { display: true, text: 'Priority' }, min: 0, max: 4, ticks: { stepSize: 1, callback: v => numToPriorityLabel(v) } }
      }
    }
  });

  // Timeline: next 14 days
  renderDeadlinesTimeline(scoped);
}

/* Timeline renderer */
function renderDeadlinesTimeline(items) {
  const host = document.getElementById('deadlinesTimeline');
  if (!host) return;

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 14);
  end.setHours(23,59,59,999);

  const dueSoon = (items || [])
    .filter(t => t.__due && t.__due <= end && t.status !== 'DONE')
    .sort((a,b) => a.__due - b.__due)
    .slice(0, 10);

  host.innerHTML = '';
  if (!dueSoon.length) {
    host.innerHTML = `<div class="text-muted small">No upcoming deadlines in the next 14 days.</div>`;
    return;
  }

  dueSoon.forEach(t => {
    const days = Math.round((t.__due - now) / 86400000);
    const pill = days < 0 ? 'Overdue' : (days === 0 ? 'Due today' : `Due in ${days}d`);
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.innerHTML = `
      <div class="timeline-left">
        <div class="timeline-title">${(t.title || 'Untitled').replace(/</g,'&lt;')}</div>
        <div class="timeline-meta">${(t.assignee || 'Unassigned')} · ${t.priority || '—'}</div>
        <span class="timeline-badge mt-2">${pill}</span>
      </div>
      <div class="timeline-date">${t.__due.toLocaleDateString()}</div>
    `;
    host.appendChild(el);
  });
}

/* -------------------------------
   Render: Admin enterprise charts
   ------------------------------- */
function renderAdminEnterprise(derivedAllTasks) {
  const scoped = applyAnalyticsFilters(derivedAllTasks);

  // Keep existing admin KPI IDs but animate (premium)
  const total = scoped.length;
  const done = scoped.filter(t => t.status === 'DONE').length;
  const assigned = scoped.filter(t => (t.assignee || '').trim()).length;
  const running = total - done;

  animateNumber(document.getElementById('adminTotal'), total);
  animateNumber(document.getElementById('adminAssigned'), assigned);
  animateNumber(document.getElementById('adminDone'), done);
  animateNumber(document.getElementById('adminRunning'), running);

  // Existing charts: statusChart, priorityChart, weeklyChart (enhanced)
  const dist = buildDistribution(scoped);
  upsertChart('statusChart', {
    type: 'pie',
    data: {
      labels: ['OPEN','IN_PROGRESS','DONE'],
      datasets: [{
        data: [dist.OPEN, dist.IN_PROGRESS, dist.DONE],
        backgroundColor: [alpha(colorForStatus('OPEN'), .22), alpha(colorForStatus('IN_PROGRESS'), .22), alpha(colorForStatus('DONE'), .22)],
        borderColor: [colorForStatus('OPEN'), colorForStatus('IN_PROGRESS'), colorForStatus('DONE')],
        borderWidth: 1.5
      }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  const pr = buildPriorities(scoped);
  upsertChart('priorityChart', {
    type: 'bar',
    data: {
      labels: ['LOW','MEDIUM','HIGH'],
      datasets: [{
        label: 'Tasks',
        data: [pr.LOW, pr.MEDIUM, pr.HIGH],
        backgroundColor: [alpha('#64748b', .30), alpha('#06b6d4', .30), alpha('#dc2626', .30)],
        borderColor: ['#64748b','#06b6d4','#dc2626'],
        borderWidth: 1.5,
        borderRadius: 10
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // Weekly trend: show OPEN/IN_PROGRESS/DONE counts by due-week
  const w = buildWeeklyStatusSeries(scoped, 12);
  upsertChart('weeklyChart', {
    type: 'line',
    data: {
      labels: w.labels,
      datasets: [
        { label: 'Open', data: w.OPEN, borderColor: colorForStatus('OPEN'), backgroundColor: alpha(colorForStatus('OPEN'), .14), tension: .35, fill: true, pointRadius: 2 },
        { label: 'In progress', data: w.IN_PROGRESS, borderColor: colorForStatus('IN_PROGRESS'), backgroundColor: alpha(colorForStatus('IN_PROGRESS'), .14), tension: .35, fill: true, pointRadius: 2 },
        { label: 'Done', data: w.DONE, borderColor: colorForStatus('DONE'), backgroundColor: alpha(colorForStatus('DONE'), .14), tension: .35, fill: true, pointRadius: 2 }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // New: Status × Priority stacked
  const sp = buildStatusPriorityMatrix(scoped);
  upsertChart('adminStatusPriorityStacked', {
    type: 'bar',
    data: {
      labels: sp.prios,
      datasets: sp.statuses.map(st => ({
        label: st,
        data: sp.prios.map(p => sp.m[st][p]),
        backgroundColor: alpha(colorForStatus(st), .25),
        borderColor: colorForStatus(st),
        borderWidth: 1
      }))
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // New: Tasks per assignee (horizontal)
  const ac = buildAssigneeCounts(scoped);
  upsertChart('adminAssigneeBar', {
    type: 'bar',
    data: {
      labels: ac.labels,
      datasets: [{
        label: 'Tasks',
        data: ac.counts,
        backgroundColor: alpha(cssVar('--accent', '#2563eb'), .28),
        borderColor: cssVar('--accent', '#2563eb'),
        borderWidth: 1.2,
        borderRadius: 10
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // New: Radar (team/user performance)
  const sel = document.getElementById('adminRadarAssignee');
  const who = sel ? sel.value : '__ALL__';
  const radar = buildRadar(scoped, who);
  upsertChart('adminRadar', {
    type: 'radar',
    data: {
      labels: radar.labels,
      datasets: [{
        label: who === '__ALL__' ? 'Org' : who,
        data: radar.values,
        borderColor: cssVar('--accent', '#2563eb'),
        backgroundColor: alpha(cssVar('--accent', '#2563eb'), .18),
        pointBackgroundColor: cssVar('--accent', '#2563eb')
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { r: { suggestedMin: 0, suggestedMax: 100, ticks: { stepSize: 20 } } }
    }
  });

  // New: Mixed created vs completed
  const mixed = buildMixedCreatedCompleted(scoped, 12);
  upsertChart('adminMixed', {
    type: 'bar',
    data: {
      labels: mixed.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Created',
          data: mixed.created,
          backgroundColor: alpha(cssVar('--accent', '#2563eb'), .22),
          borderColor: cssVar('--accent', '#2563eb'),
          borderWidth: 1.2,
          borderRadius: 10
        },
        {
          type: 'line',
          label: 'Completed (by due-week)',
          data: mixed.completed,
          borderColor: cssVar('--success', '#16a34a'),
          backgroundColor: alpha(cssVar('--success', '#16a34a'), .12),
          tension: .35,
          fill: true,
          pointRadius: 2
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  // New: Bubble complexity vs effort
  const bubbles = buildBubbleComplexityEffort(scoped);
  upsertChart('adminBubble', {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Tasks',
        data: bubbles,
        backgroundColor: alpha(cssVar('--accent', '#2563eb'), .22),
        borderColor: alpha(cssVar('--accent', '#2563eb'), .55),
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (ctx) => `Complexity ${ctx.raw.x} · Effort ${ctx.raw.y}d` } }
      },
      scales: {
        x: { title: { display: true, text: 'Complexity (derived from text length)' }, min: 0, max: 100 },
        y: { title: { display: true, text: 'Effort (lead-time days)' }, min: 0, max: 100 }
      }
    }
  });

  // New: Matrix visual
  renderMatrix(sp);

  // Populate radar dropdown from assignees (once per refresh)
  populateRadarAssignees(scoped);

  setLastUpdated();
}

function buildWeeklyStatusSeries(items, weeks = 12) {
  const now = new Date();
  const labels = [];
  const cursor = new Date(now);
  cursor.setHours(0,0,0,0);
  const day = (cursor.getDay() + 6) % 7;
  cursor.setDate(cursor.getDate() - day);

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i * 7);
    labels.push(d.toISOString().slice(0,10));
  }

  const init = () => new Map(labels.map(l => [l, 0]));
  const OPEN = init(), INP = init(), DONE = init();

  (items || []).forEach(t => {
    const base = t.__due || t.__createdAt;
    if (!base) return;
    const k = weekKey(base);
    if (!OPEN.has(k)) return;
    if (t.status === 'OPEN') OPEN.set(k, OPEN.get(k) + 1);
    if (t.status === 'IN_PROGRESS') INP.set(k, INP.get(k) + 1);
    if (t.status === 'DONE') DONE.set(k, DONE.get(k) + 1);
  });

  return {
    labels,
    OPEN: labels.map(l => OPEN.get(l) || 0),
    IN_PROGRESS: labels.map(l => INP.get(l) || 0),
    DONE: labels.map(l => DONE.get(l) || 0)
  };
}

/* Admin matrix renderer (custom visual workaround; Chart.js heatmap not native) */
function renderMatrix(sp) {
  const host = document.getElementById('adminMatrix');
  if (!host) return;

  const statuses = ['OPEN','IN_PROGRESS','DONE'];
  const prios = ['LOW','MEDIUM','HIGH'];

  host.innerHTML = '';
  host.appendChild(Object.assign(document.createElement('div'), { className: 'matrix-label', textContent: ' ' }));
  statuses.forEach(st => host.appendChild(Object.assign(document.createElement('div'), { className: 'matrix-label', textContent: st.replace('_',' ') })));

  prios.forEach(p => {
    host.appendChild(Object.assign(document.createElement('div'), { className: 'matrix-label', textContent: p }));
    statuses.forEach(st => {
      const v = sp.m[st][p];
      const cell = document.createElement('div');
      cell.className = 'matrix-cell';
      cell.innerHTML = `
        <div class="matrix-head"><span>${st}</span><span class="text-muted">${p}</span></div>
        <div class="matrix-val">${v}</div>
      `;
      host.appendChild(cell);
    });
  });
}

function populateRadarAssignees(items) {
  const sel = document.getElementById('adminRadarAssignee');
  if (!sel) return;

  const current = sel.value || '__ALL__';
  const set = new Set(['__ALL__']);
  (items || []).forEach(t => {
    const a = (t.assignee || '').trim();
    if (a) set.add(a);
  });

  const vals = [...set];
  sel.innerHTML = '';
  vals.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === '__ALL__' ? 'All' : v;
    sel.appendChild(opt);
  });
  sel.value = vals.includes(current) ? current : '__ALL__';
}

/* -------------------------------
   Export charts as PNG
   ------------------------------- */
function exportChartPng(canvasId) {
  const ch = charts.get(canvasId);
  if (!ch) return;
  const a = document.createElement('a');
  a.href = ch.toBase64Image('image/png', 1);
  a.download = `${canvasId}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* -------------------------------
   Sidebar toggle + tooltips
   ------------------------------- */
function initUiEnterprise() {
  // Sidebar (mobile)
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('appSidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('is-open'));
  }

  // Bootstrap tooltips
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    try { new bootstrap.Tooltip(el); } catch {}
  });

  // Status chart type toggle
  document.getElementById('empStatusPieBtn')?.addEventListener('click', () => {
    employeeStatusType = 'pie';
    document.getElementById('empStatusPieBtn')?.classList.add('active');
    document.getElementById('empStatusDoughnutBtn')?.classList.remove('active');
    updateEnterpriseDash();
  });
  document.getElementById('empStatusDoughnutBtn')?.addEventListener('click', () => {
    employeeStatusType = 'doughnut';
    document.getElementById('empStatusDoughnutBtn')?.classList.add('active');
    document.getElementById('empStatusPieBtn')?.classList.remove('active');
    updateEnterpriseDash();
  });

  // Export buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-export]');
    if (!btn) return;
    exportChartPng(btn.getAttribute('data-export'));
  });

  // Range buttons (apply to analytics only; safe)
  document.querySelectorAll('[data-range]').forEach(b => {
    b.addEventListener('click', () => {
      analyticsFilters.rangeDays = Number(b.getAttribute('data-range') || '30') || 30;
      updateEnterpriseDash();
    });
  });

  // Assignee filter (employee)
  document.getElementById('assigneeFilter')?.addEventListener('change', (e) => {
    analyticsFilters.assignee = e.target.value || '';
    updateEnterpriseDash();
  });

  // Radar dropdown (admin)
  document.getElementById('adminRadarAssignee')?.addEventListener('change', () => updateEnterpriseDash());

  // Refresh now / auto refresh
  document.getElementById('refreshNowBtn')?.addEventListener('click', () => load());
  document.getElementById('autoRefreshToggle')?.addEventListener('change', (e) => {
    const on = !!e.target.checked;
    setAutoRefresh(on);
  });
}

let autoRefreshTimer = null;
function setAutoRefresh(on) {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
  if (!on) return;
  autoRefreshTimer = setInterval(() => {
    if (!isLogged()) return;
    load();
  }, 30000); // 30s polling (client-side only)
}

/* -------------------------------
   Enterprise dashboard update hook
   - Called after data loads and when filters change
   ------------------------------- */
let derivedTasksCache = []; // derived copy of `tasks`

const updateEnterpriseDash = debounce(() => {
  const derived = derivedTasksCache || [];

  // Keep assignee dropdown populated from current tasks
  const assSel = document.getElementById('assigneeFilter');
  if (assSel) {
    const current = assSel.value || '';
    const set = new Set(['']);
    derived.forEach(t => set.add((t.assignee || '').trim()));
    const vals = [...set].filter(Boolean).sort((a,b) => a.localeCompare(b));
    assSel.innerHTML = `<option value="">Assignee: All</option>` + vals.map(v => `<option value="${v}">${v}</option>`).join('');
    assSel.value = vals.includes(current) ? current : '';
  }

  if (!isLogged()) return;
  if (isAdmin()) renderAdminEnterprise(derived);
  else renderEmployeeEnterprise(derived);
}, 160);

/* ---------------------------------------
   Patch existing loaders to include tasks
   --------------------------------------- */

/** Replace ONLY these two functions with task-driven analytics (frontend only). */
async function loadAdmin() {
  try {
    document.body.classList.add('is-loading');

    // Admin: fetch tasks for org-level analytics + keep existing stats endpoint for compatibility.
    const [allTasks, s] = await Promise.all([
      api('/api/tasks'),
      api('/api/stats/admin')
    ]);

    tasks = allTasks || [];               // keep global tasks list for table (if any admin table exists)
    derivedTasksCache = deriveTasks(tasks);

    // Keep existing IDs updated (compat)
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (s) {
      set('adminTotal', s.total);
      set('adminAssigned', s.assigned);
      set('adminDone', s.done);
      set('adminRunning', s.total - s.done);
    }

    // Enterprise charts computed from tasks
    updateEnterpriseDash();
  } catch (e) {
    toast(e.message || 'Failed to load admin data', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
}

async function loadEmployee() {
  try {
    document.body.classList.add('is-loading');

    tasks = await api('/api/tasks');
    derivedTasksCache = deriveTasks(tasks);

    // Existing table render remains intact
    render();

    // Keep existing stats endpoint (employee)
    await api('/api/stats/me'); // we keep call to ensure backend contract remains used
    updateEnterpriseDash();
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  } finally {
    document.body.classList.remove('is-loading');
  }
}

/* Keep existing load() but ensure lastUpdated updates */
async function load() {
  applyRoleUI();
  if (!isLogged()) return;
  if (isAdmin()) await loadAdmin();
  else await loadEmployee();
  setLastUpdated();
}

/* Init UI enhancements once */
document.addEventListener('DOMContentLoaded', () => {
  initUiEnterprise();
  setLastUpdated();
});
