'use strict';

/* Dashboard interactions — Bootstrap 5 + vanilla JS only */

// Globals
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user = JSON.parse(localStorage.getItem('user') || 'null');
const isAdmin = () => roles.includes('ADMIN');
const isLogged = () => !!token;

/**
 * ✅ CRITICAL: must exist globally before any analytics code references it.
 * Some browsers will stop executing the whole file on ReferenceError,
 * which prevents ALL event listeners from attaching.
 */
let derivedTasksCache = [];

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
let __busy = false; // UI busy state to disable buttons reliably (client-side only)

function setUiBusy(on) {
  __busy = !!on;
  document.documentElement.setAttribute('aria-busy', __busy ? 'true' : 'false');

  // Disable/enable high-frequency buttons
  const ids = ['refreshNowBtn', 'newBtn', 'calendarBtn', 'menuCreate', 'sidebarToggle'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = __busy;
  });
}

function showLoader(on = true) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = on ? 'grid' : 'none';
  setUiBusy(on);
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
function getInitials(nameOrUser) {
  const s = (nameOrUser || '').trim();
  if (!s) return '—';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function setAuthUI() {
  const showAuth = !isLogged();
  const L = id => document.getElementById(id);

  if (L('loginBtn')) L('loginBtn').style.display = showAuth ? '' : 'none';
  if (L('signupBtn')) L('signupBtn').style.display = showAuth ? '' : 'none';
  if (L('logoutBtn')) L('logoutBtn').style.display = showAuth ? 'none' : '';
  if (L('newBtn')) L('newBtn').style.display = showAuth ? 'none' : '';
  if (L('menuAdmin')) L('menuAdmin').style.display = isAdmin() ? '' : 'none';

  // Profile fill (SaaS card)
  const name = user?.name || user?.username || '—';
  const email = user?.email || '—';
  const username = user?.username || '—';

  document.getElementById('p_name')?.replaceChildren(document.createTextNode(name));
  document.getElementById('p_email')?.replaceChildren(document.createTextNode(email));
  document.getElementById('p_user')?.replaceChildren(document.createTextNode(username));

  const avatar = document.getElementById('p_avatar');
  if (avatar) avatar.textContent = getInitials(user?.name || user?.username);

  const roleEl = document.getElementById('p_role');
  if (roleEl) roleEl.textContent = isAdmin() ? 'Admin' : 'User';

  // Sidebar profile logout button mirrors top logout
  const pLogout = document.getElementById('profileLogoutBtn');
  if (pLogout) pLogout.style.display = isLogged() ? '' : 'none';
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
  // Hint native controls
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';

  // Sync Bootstrap navbar classes (dark ↔ light)
  document.querySelectorAll('.navbar').forEach(n => {
    n.classList.remove('navbar-dark', 'bg-dark', 'navbar-light', 'bg-light');
    if (theme === 'dark') n.classList.add('navbar-dark', 'bg-dark');
    else n.classList.add('navbar-light', 'bg-light');
  });

  // Repaint charts with updated CSS variables (safe: window.__charts exists after chart registry init)
  requestAnimationFrame(() => {
    try {
      if (window.__charts) {
        Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#64748b';
        window.__charts.forEach(ch => { try { ch.update(); } catch {} });
      }
    } catch {}
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

    const [allTasks, s] = await Promise.all([
      api('/api/tasks'),
      api('/api/stats/admin')
    ]);

    tasks = allTasks || [];
    derivedTasksCache = safeRun('deriveTasks(admin)', () => deriveTasks(tasks)) || [];

    // Keep existing IDs updated (compat)
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    if (s) {
      set('adminTotal', s.total);
      set('adminAssigned', s.assigned);
      set('adminDone', s.done);
      set('adminRunning', s.total - s.done);
    }

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
    derivedTasksCache = safeRun('deriveTasks(employee)', () => deriveTasks(tasks)) || [];

    // Existing table render remains intact
    safeRun('render(table)', () => render());

    // Keep existing stats endpoint (employee) for compatibility
    await api('/api/stats/me');

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

/* ------------- events (ALL attached after DOM ready) ------------- */
function initCoreEvents() {
  // Sidebar: Dashboard
  document.getElementById('navHome')?.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveNav('navHome');
    applyRoleUI();
    (isAdmin() ? document.getElementById('adminPanel') : document.getElementById('employeePanel'))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Sidebar: Admin Analytics
  document.getElementById('navAdminAnalytics')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!isAdmin()) return;
    setActiveNav('navAdminAnalytics');
    document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Sidebar: New task
  document.getElementById('menuCreate')?.addEventListener('click', () => safeRun('openNew(menuCreate)', () => openNew()));
  document.getElementById('newBtn')?.addEventListener('click', () => safeRun('openNew(newBtn)', () => openNew()));
  document.getElementById('emptyCreateBtn')?.addEventListener('click', () => safeRun('openNew(emptyCreateBtn)', () => openNew()));

  // Calendar (works for Admin + Employee)
  document.getElementById('calendarBtn')?.addEventListener('click', async () => {
    if (!isLogged()) return;
    if (!tasks.length) {
      // Load tasks using the correct role loader (avoids missing data for admin)
      if (isAdmin()) await loadAdmin(); else await loadEmployee();
    }
    safeRun('buildCalendarGrid', () => buildCalendarGrid(tasks));
    calendarModal?.show();
  });

  // Filters (table)
  ['q','status','priority','fromDate','toDate','sortBy'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => safeRun(`render(${id}:input)`, () => render()));
    document.getElementById(id)?.addEventListener('change', () => safeRun(`render(${id}:change)`, () => render()));
  });

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    ['q','status','priority','fromDate','toDate','sortBy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    safeRun('render(clearFilters)', () => render());
  });

  document.getElementById('globalSearch')?.addEventListener('input', (e) => {
    const qEl = document.getElementById('q');
    if (qEl) { qEl.value = e.target.value; safeRun('render(globalSearch)', () => render()); }
  });

  // Refresh button
  document.getElementById('refreshNowBtn')?.addEventListener('click', () => {
    if (__busy) return;
    load().catch(err => toast(err?.message || 'Refresh failed', 'error'));
  });

  // Date-range buttons (analytics)
  document.querySelectorAll('button[data-range]').forEach(b => {
    b.addEventListener('click', () => {
      safeRun('rangeClick', () => {
        setActiveRangeButton(b);
        analyticsFilters.rangeDays = Number(b.getAttribute('data-range') || '30') || 30;
        updateEnterpriseDash();
      });
    });
  });

  // Assignee filter (analytics)
  document.getElementById('assigneeFilter')?.addEventListener('change', (e) => {
    analyticsFilters.assignee = e.target.value || '';
    updateEnterpriseDash();
  });

  // Auto refresh toggle
  document.getElementById('autoRefreshToggle')?.addEventListener('change', (e) => {
    setAutoRefresh(!!e.target.checked);
  });

  // Profile logout button delegates to existing logout logic
  document.getElementById('profileLogoutBtn')?.addEventListener('click', () => {
    document.getElementById('logoutBtn')?.click();
  });
}

/* ------------- init (single reliable entry point) ------------- */
document.addEventListener('DOMContentLoaded', () => {
  safeRun('initCoreEvents', () => initCoreEvents());
  safeRun('initUiEnterprise', () => initUiEnterprise());

  safeRun('applyRoleUI', () => applyRoleUI());
  load().catch(err => toast(err?.message || 'Load failed', 'error'));
});

/**
 * ✅ IMPORTANT:
 * Remove any later redeclaration like:
 *   let derivedTasksCache = [];
 * If it exists below, change it to:
 *   derivedTasksCache = derivedTasksCache || [];
 */


