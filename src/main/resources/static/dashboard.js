'use strict';

/* Dashboard interactions — Bootstrap 5 + vanilla JS only */

// ===================== GLOBAL STATE =====================
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user  = JSON.parse(localStorage.getItem('user')  || 'null');

/**
 * ✅ IMPORTANT:
 * Keep in-memory auth in sync with localStorage.
 * Without this, UI can think you are logged-in while API calls use a stale/empty token → 403.
 */
function syncAuthFromStorage() {
  token = localStorage.getItem('token') || '';
  roles = JSON.parse(localStorage.getItem('roles') || '[]');
  user  = JSON.parse(localStorage.getItem('user')  || 'null');
}

const isAdmin  = () => (syncAuthFromStorage(), roles.includes('ADMIN'));
const isLogged = () => (syncAuthFromStorage(), !!token);

/**
 * ✅ CRITICAL GLOBAL CACHE
 * Must exist BEFORE analytics code touches it.
 */
let derivedTasksCache = [];

/**
 * ✅ CRITICAL GLOBAL SAFE RUNNER
 * Prevents one JS error from breaking the entire dashboard.
 */
function safeRun(label, fn) {
  try {
    return typeof fn === 'function' ? fn() : undefined;
  } catch (err) {
    console.error(`[safeRun] ${label}`, err);
    toast(err?.message || `${label} failed`, 'error');
    return undefined;
  }
}

/**
 * Safe async runner:
 * - catches promise rejections so buttons never "silently fail"
 * - prevents one failing endpoint from breaking interactivity
 */
async function safeRunAsync(label, fn) {
  try {
    return typeof fn === 'function' ? await fn() : undefined;
  } catch (err) {
    console.error(`[safeRunAsync] ${label}`, err);
    toast(err?.message || `${label} failed`, 'error');
    return undefined;
  }
}

/** Prevent double-binding (common when dashboard.js gets merged/duplicated) */
function bindOnce(key, binder) {
  const k = `__bound_${key}`;
  if (window[k]) return;
  window[k] = true;
  binder();
}

/** Logout should always work even if other UI code changes */
function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('roles');
  localStorage.removeItem('user');
  location.href = '/';
}

/**
 * Ensure modal opens even if the bootstrap instance variable differs.
 * Uses global `taskModal` if present; else creates a one-off modal instance.
 */
function openTaskModal() {
  const el = document.getElementById('taskModal');
  if (!el) return;

  const form = el.querySelector('form');
  if (form) form.reset();

  // Prefer existing instance if your code already created it
  if (typeof taskModal !== 'undefined' && taskModal) {
    taskModal.show();
    return;
  }

  // Fallback instance (does not change backend)
  try { new bootstrap.Modal(el).show(); } catch {}
}

function openCalendarModal() {
  const el = document.getElementById('calendarModal');
  if (!el) return;

  if (typeof calendarModal !== 'undefined' && calendarModal) {
    calendarModal.show();
    return;
  }
  try { new bootstrap.Modal(el).show(); } catch {}
}

// ===================== BOOTSTRAP MODALS =====================
const taskModal     = document.getElementById('taskModal')     ? new bootstrap.Modal(document.getElementById('taskModal'))     : null;
const loginModal    = document.getElementById('loginModal')    ? new bootstrap.Modal(document.getElementById('loginModal'))    : null;
const signupModal   = document.getElementById('signupModal')   ? new bootstrap.Modal(document.getElementById('signupModal'))   : null;
const calendarModal = document.getElementById('calendarModal') ? new bootstrap.Modal(document.getElementById('calendarModal')) : null;

// ===================== CHART REGISTRY =====================
let statusChart, priorityChart, weeklyChart;
window.__charts = [];

// ===================== UI BUSY STATE =====================
let __busy = false;
let __pendingRequests = 0;

/**
 * IMPORTANT:
 * Do NOT disable primary navigation actions globally.
 * Only disable "refresh" while loading. Otherwise the app feels dead.
 */
function setUiBusy(on) {
  __busy = !!on;
  document.documentElement.setAttribute('aria-busy', __busy ? 'true' : 'false');

  // Only disable refresh (and optionally other "data fetch" triggers)
  const refresh = document.getElementById('refreshNowBtn');
  if (refresh) refresh.disabled = __busy;
}

function showLoader(on = true) {
  const el = document.getElementById('loadingOverlay');

  if (on) __pendingRequests++;
  else __pendingRequests = Math.max(0, __pendingRequests - 1);

  const busy = __pendingRequests > 0;

  if (el) {
    el.style.display = busy ? 'grid' : 'none';
    el.style.pointerEvents = busy ? 'auto' : 'none';
  }
  setUiBusy(busy);
}

// ===================== TOAST =====================
function toast(msg, type = 'error') {
  const cont = document.getElementById('toastContainer');
  if (!cont) return;

  const t = document.createElement('div');
  t.className = `toast align-items-center text-bg-danger border-0`;
  t.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  cont.appendChild(t);
  new bootstrap.Toast(t, { delay: 2500 }).show();
  t.addEventListener('hidden.bs.toast', () => t.remove());
}

// ===================== API =====================
async function api(path, opt = {}) {
  syncAuthFromStorage();

  opt.headers = Object.assign({}, opt.headers || {});
  opt.method  = opt.method || 'GET';
  opt.headers.Accept = 'application/json';

  if (token) opt.headers.Authorization = 'Bearer ' + token;

  // ✅ Prevent hung requests from leaving UI "busy"
  // Does not change backend, only client behavior.
  const timeoutMs = 15000;
  let timeoutId = null;

  if (!opt.signal) {
    const ctrl = new AbortController();
    opt.signal = ctrl.signal;
    timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
  }

  try {
    showLoader(true);

    const res = await fetch(path, opt);
    const txt = await res.text();

    // ✅ Auth failures: handle explicitly so the app doesn’t get stuck half-logged-in
    if (res.status === 401 || res.status === 403) {
      // Clear bad/stale auth and return to login
      localStorage.removeItem('token');
      localStorage.removeItem('roles');
      localStorage.removeItem('user');
      syncAuthFromStorage();
      safeRun('setAuthUI(auth-failed)', setAuthUI);

      throw new Error('Session expired or unauthorized. Please login again.');
    }

    if (!res.ok) throw new Error(txt || 'Request failed');
    return txt ? JSON.parse(txt) : null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    showLoader(false);
  }
}

// ===================== UTIL =====================
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString();
}

function getInitials(name = '') {
  const p = name.trim().split(/\s+/);
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function isoToDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // yyyy-mm-dd in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value) {
  if (!value) return null;
  // Interpret as local date at start of day
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ===================== AUTH / PROFILE =====================
function setAuthUI() {
  const showAuth = !isLogged();

  document.getElementById('loginBtn')?.classList.toggle('d-none', !showAuth);
  document.getElementById('signupBtn')?.classList.toggle('d-none', !showAuth);
  document.getElementById('logoutBtn')?.classList.toggle('d-none', showAuth);
  document.getElementById('newBtn')?.classList.toggle('d-none', showAuth);

  document.getElementById('p_name')?.replaceChildren(document.createTextNode(user?.name || '—'));
  document.getElementById('p_email')?.replaceChildren(document.createTextNode(user?.email || '—'));
  document.getElementById('p_user')?.replaceChildren(document.createTextNode(user?.username || '—'));
  document.getElementById('p_role')?.replaceChildren(document.createTextNode(isAdmin() ? 'Admin' : 'User'));

  const avatar = document.getElementById('p_avatar');
  if (avatar) avatar.textContent = getInitials(user?.name || user?.username);
}

// ===================== THEME =====================
function unregisterChart(ch) {
  if (!ch || !Array.isArray(window.__charts)) return;
  window.__charts = window.__charts.filter(x => x && x !== ch);
}

function destroyChart(ch) {
  if (!ch) return null;
  unregisterChart(ch);
  try { ch.destroy(); } catch {}
  return null;
}

// In setTheme(), make update defensive
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);

  requestAnimationFrame(() => {
    Chart.defaults.color =
      getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#64748b';

    if (Array.isArray(window.__charts)) {
      window.__charts = window.__charts.filter(Boolean);
      window.__charts.forEach(ch => {
        try { ch.update(); } catch {}
      });
    }
  });
}

// ===================== FILTERS =====================
function currentFilters() {
  return {
    q: (document.getElementById('q')?.value || '').toLowerCase(),
    status: document.getElementById('status')?.value || '',
    priority: document.getElementById('priority')?.value || ''
  };
}

// ===================== RENDER =====================
function render() {
  const { q, status, priority } = currentFilters();
  const tbody = document.querySelector('#tasksTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  tasks
    .filter(t =>
      (!q || (t.title || '').toLowerCase().includes(q)) &&
      (!status || t.status === status) &&
      (!priority || t.priority === priority)
    )
    .forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.title || ''}</td>
        <td>${t.status || ''}</td>
        <td>${t.priority || ''}</td>
        <td>${fmtDate(t.dueDate)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-id="${t.id}">Edit</button>
        </td>`;
      tbody.appendChild(tr);
    });
}

// ===================== LOADERS =====================
async function loadEmployee() {
  // ✅ Catch here so load() can finish gracefully and UI can re-enable
  try {
    tasks = await api('/api/tasks') || [];
    derivedTasksCache = safeRun('deriveTasks(employee)', () => deriveTasks(tasks)) || [];
    applyRolePanels();
    safeRun('renderEmployeeAnalytics', () => renderEmployeeAnalytics(derivedTasksCache));
    safeRun('render', render);
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  }
}

async function loadAdmin() {
  try {
    tasks = await api('/api/tasks') || [];
    derivedTasksCache = safeRun('deriveTasks(admin)', () => deriveTasks(tasks)) || [];
    applyRolePanels();
    safeRun('renderAdminAnalytics', () => renderAdminAnalytics(derivedTasksCache));
    safeRun('render', render);
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  }
}

async function load() {
  syncAuthFromStorage();
  setAuthUI();

  if (!isLogged()) return;

  if (isAdmin()) await loadAdmin();
  else await loadEmployee();
}

/**
 * Fix #1: deriveTasks was referenced by loaders but not implemented.
 * Keep it defensive so analytics never breaks navigation.
 */
function createdAtFromObjectId(id) {
  if (!id || typeof id !== 'string' || id.length < 8) return null;
  const hex = id.slice(0, 8);
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) return null;
  const seconds = parseInt(hex, 16);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

function deriveTasks(items) {
  const now = new Date();
  return (items || []).map(t => {
    const createdAt = t?.createdAt ? new Date(t.createdAt) : createdAtFromObjectId(t?.id);
    const due = t?.dueDate ? new Date(t.dueDate) : null;
    const isDone = t?.status === 'DONE';
    const overdue = !!due && !isDone && due < now;

    // These are optional “derived” fields used only by charts/analytics
    const titleLen = (t?.title || '').trim().length;
    const descLen = (t?.description || '').trim().length;
    const complexity = Math.min(100, Math.round(titleLen * 0.8 + descLen * 0.25));
    const effortDays = (createdAt && due) ? Math.max(0, Math.round((due - createdAt) / 86400000)) : 0;

    return { ...t, __createdAt: createdAt, __due: due, __overdue: overdue, __complexity: complexity, __effortDays: effortDays };
  });
}

/**
 * Fix #2: openNew was referenced by buttons but not implemented.
 * This opens the existing Bootstrap modal if present and resets its form safely.
 */
function openNew() {
  const modalEl = document.getElementById('taskModal');
  if (!modalEl) {
    toast('Task modal (#taskModal) is missing in dashboard.html', 'error');
    return;
  }

  document.getElementById('taskModalTitle')?.replaceChildren(document.createTextNode('New Task'));
  document.getElementById('tm_err') && (document.getElementById('tm_err').style.display = 'none');

  document.getElementById('tm_id').value = '';
  document.getElementById('tm_title').value = '';
  document.getElementById('tm_desc').value = '';
  document.getElementById('tm_status').value = 'OPEN';
  document.getElementById('tm_priority').value = 'MEDIUM';
  document.getElementById('tm_due').value = '';
  document.getElementById('tm_assignee').value = '';

  if (taskModal) taskModal.show();
}

function buildCalendarGrid(items) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) {
    toast('Calendar grid (#calendarGrid) is missing in dashboard.html', 'error');
    return;
  }

  // Simple month view (current month)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map(); // yyyy-mm-dd -> tasks[]
  (items || []).forEach(t => {
    if (!t?.dueDate) return;
    const d = new Date(t.dueDate);
    if (Number.isNaN(d.getTime())) return;
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const key = isoToDateInputValue(t.dueDate);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(t);
  });

  grid.innerHTML = '';
  // pad before month start
  for (let i = 0; i < startDow; i++) {
    const pad = document.createElement('div');
    pad.className = 'day';
    pad.style.opacity = '0.35';
    grid.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'day';

    const d = new Date(year, month, day);
    const key = isoToDateInputValue(d.toISOString());

    const label = document.createElement('div');
    label.className = 'date';
    label.textContent = String(day);
    cell.appendChild(label);

    const list = byDay.get(key) || [];
    list.slice(0, 4).forEach(t => {
      const pill = document.createElement('span');
      const p = (t.priority || 'MEDIUM').toUpperCase();
      pill.className = `pill ${p === 'HIGH' ? 'pill-high' : p === 'LOW' ? 'pill-low' : 'pill-med'}`;
      pill.textContent = t.title || '(untitled)';
      cell.appendChild(pill);
    });

    grid.appendChild(cell);
  }
}

// Hook up Edit + Save (Update/Create) using existing endpoints (NO backend changes)
function initTaskCrud() {
  // Table Edit click (event delegation)
  document.getElementById('tasksTable')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-id]');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const t = (tasks || []).find(x => String(x.id) === String(id));
    if (!t) return;

    const modalEl = document.getElementById('taskModal');
    if (!modalEl) {
      toast('Task modal (#taskModal) is missing in dashboard.html', 'error');
      return;
    }

    document.getElementById('taskModalTitle')?.replaceChildren(document.createTextNode('Update Task'));
    document.getElementById('tm_err') && (document.getElementById('tm_err').style.display = 'none');

    document.getElementById('tm_id').value = t.id || '';
    document.getElementById('tm_title').value = t.title || '';
    document.getElementById('tm_desc').value = t.description || '';
    document.getElementById('tm_status').value = t.status || 'OPEN';
    document.getElementById('tm_priority').value = t.priority || 'MEDIUM';
    document.getElementById('tm_due').value = isoToDateInputValue(t.dueDate);
    document.getElementById('tm_assignee').value = t.assignee || '';

    taskModal?.show();
  });

  // Form submit: create/update
  document.getElementById('taskForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    safeRunAsync('taskForm.submit', async () => {
      if (!isLogged()) { location.href = '/login'; return; }

      const err = document.getElementById('tm_err');
      if (err) { err.style.display = 'none'; err.textContent = ''; }

      const id = document.getElementById('tm_id')?.value?.trim();
      const title = document.getElementById('tm_title')?.value?.trim();
      const description = document.getElementById('tm_desc')?.value?.trim() || '';
      const status = document.getElementById('tm_status')?.value || 'OPEN';
      const priority = document.getElementById('tm_priority')?.value || 'MEDIUM';
      const dueDate = dateInputToIso(document.getElementById('tm_due')?.value || '');
      const assignee = document.getElementById('tm_assignee')?.value?.trim() || '';

      if (!title) {
        if (err) { err.textContent = 'Title is required'; err.style.display = 'block'; }
        return;
      }

      const body = { title, description, status, priority, dueDate, assignee };

      if (id) {
        await api(`/api/tasks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        await api('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }

      taskModal?.hide();
      await load();
    });
  });
}

// Ensure these init hooks run once
document.addEventListener('DOMContentLoaded', () => {
  bindOnce('taskCrud', () => safeRun('initTaskCrud', initTaskCrud));
});

// ===================== EVENTS =====================
function initCoreEvents() {
  bindOnce('coreEvents_internal', () => {
    // Navbar auth buttons are <button> (not <a>) => must have JS handlers
    document.getElementById('loginBtn')?.addEventListener('click', () => (location.href = '/login'));
    document.getElementById('signupBtn')?.addEventListener('click', () => (location.href = '/signup'));

    // Sidebar toggle (mobile)
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.getElementById('appSidebar')?.classList.toggle('is-open');
    });

    // Sidebar: Dashboard
    document.getElementById('navHome')?.addEventListener('click', (e) => {
      e.preventDefault();
      // visual feedback
      document.querySelectorAll('.app-navitem').forEach(x => x.classList.remove('active'));
      document.getElementById('navHome')?.classList.add('active');

      // show the right panel
      if (!isLogged()) {
        document.getElementById('publicPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      (isAdmin() ? document.getElementById('adminPanel') : document.getElementById('employeePanel'))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Sidebar: Admin Analytics
    document.getElementById('navAdminAnalytics')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      document.querySelectorAll('.app-navitem').forEach(x => x.classList.remove('active'));
      document.getElementById('navAdminAnalytics')?.classList.add('active');
      document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // New Task (navbar + sidebar)
    const openNewHandler = (e) => {
      e?.preventDefault?.();
      if (!isLogged()) { location.href = '/login'; return; }
      safeRun('openNew', () => openNew());
    };
    document.getElementById('newBtn')?.addEventListener('click', openNewHandler);
    document.getElementById('menuCreate')?.addEventListener('click', openNewHandler);

    // Refresh
    document.getElementById('refreshNowBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      safeRunAsync('refresh/load', async () => { await load(); });
    });

    // Logout (navbar + profile card)
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      safeRun('logout', doLogout);
    });
    document.getElementById('profileLogoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      safeRun('logout(profile)', doLogout);
    });

    // Search: navbar search should drive table search input (#q) then render
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
      const q = document.getElementById('q');
      if (q) q.value = e.target.value || '';
      safeRun('render(globalSearch)', render);
    });

    // Calendar
    document.getElementById('calendarBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      safeRunAsync('calendar', async () => {
        if (!isLogged()) { location.href = '/login'; return; }

        if (!Array.isArray(tasks) || tasks.length === 0) {
          if (isAdmin()) await loadAdmin();
          else await loadEmployee();
        }

        if (typeof buildCalendarGrid === 'function') {
          safeRun('buildCalendarGrid', () => buildCalendarGrid(tasks));
        }
        openCalendarModal();
      });
    });

    // Auto refresh (only if you have setAutoRefresh elsewhere; keep safe)
    document.getElementById('autoRefreshToggle')?.addEventListener('change', (e) => {
      if (typeof window.setAutoRefresh === 'function') window.setAutoRefresh(!!e.target.checked);
    });

    // Theme
    document.getElementById('darkToggle')?.addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      safeRun('setTheme', () => setTheme(theme));
    });

    // Public panel buttons
    document.getElementById('publicLogin')?.addEventListener('click', () => (location.href = '/login'));
    document.getElementById('publicSignup')?.addEventListener('click', () => (location.href = '/signup'));
  });
}

// Init (keep single)
document.addEventListener('DOMContentLoaded', () => {
  bindOnce('coreEvents', () => safeRun('initCoreEvents', initCoreEvents));

  const savedTheme = localStorage.getItem('theme') || 'light';
  safeRun('setTheme(saved)', () => setTheme(savedTheme));
  const t = document.getElementById('darkToggle');
  if (t) t.checked = savedTheme === 'dark';

  safeRunAsync('load(initial)', async () => { await load(); });
});

/*
  ✅ DELETE/REMOVE the SECOND duplicated DOMContentLoaded block below in your file:

  // ===================== INIT =====================
  document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);

    safeRun('initCoreEvents', initCoreEvents);
    safeRun('load', load);
  });

*/

function destroyChart(ch) {
  if (!ch) return null;
  try { ch.destroy(); } catch {}
  return null;
}

function chartColors() {
  const css = getComputedStyle(document.documentElement);
  const text = (css.getPropertyValue('--text') || '#0b1220').trim();
  const muted = (css.getPropertyValue('--muted') || '#64748b').trim();
  return { text, muted };
}

function weekStartIso(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function lastNWeekLabels(n = 8) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (7 * (n - 1)));
  const labels = [];
  let cur = new Date(start);
  for (let i = 0; i < n; i++) {
    labels.push(weekStartIso(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return labels;
}

function computeBasics(items) {
  const now = new Date();
  const status = { OPEN: 0, IN_PROGRESS: 0, DONE: 0 };
  const priority = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  let overdue = 0;

  (items || []).forEach(t => {
    const s = (t.status || 'OPEN').toUpperCase();
    const p = (t.priority || 'MEDIUM').toUpperCase();
    if (status[s] != null) status[s]++;
    if (priority[p] != null) priority[p]++;

    const due = t.dueDate ? new Date(t.dueDate) : null;
    if (due && !Number.isNaN(due.getTime()) && s !== 'DONE' && due < now) overdue++;
  });

  return { status, priority, overdue };
}

function computeWeeklyDone(items, labels) {
  const m = new Map(labels.map(l => [l, 0]));
  (items || []).forEach(t => {
    if ((t.status || '').toUpperCase() !== 'DONE') return;
    const d = t.dueDate ? new Date(t.dueDate) : (t.__createdAt || null);
    const key = d ? weekStartIso(d) : null;
    if (!key || !m.has(key)) return;
    m.set(key, m.get(key) + 1);
  });
  return labels.map(l => m.get(l) || 0);
}

function computePriorityByStatus(items) {
  const pri = ['LOW', 'MEDIUM', 'HIGH'];
  const st = ['OPEN', 'IN_PROGRESS', 'DONE'];
  const grid = {};
  st.forEach(s => (grid[s] = pri.map(() => 0)));

  (items || []).forEach(t => {
    const p = (t.priority || 'MEDIUM').toUpperCase();
    const s = (t.status || 'OPEN').toUpperCase();
    const pi = pri.indexOf(p);
    if (pi < 0 || !grid[s]) return;
    grid[s][pi]++;
  });

  return { pri, grid };
}

function computeTasksPerAssignee(items) {
  const counts = new Map();
  (items || []).forEach(t => {
    const a = (t.assignee || '').trim() || 'Unassigned';
    counts.set(a, (counts.get(a) || 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return { labels: entries.map(x => x[0]), data: entries.map(x => x[1]) };
}

function computeTeamRadar(items) {
  // Radar uses rates (0..100) so axes are comparable
  const total = (items || []).length || 1;
  const now = new Date();

  let done = 0, inProg = 0, open = 0, assigned = 0, overdue = 0;
  (items || []).forEach(t => {
    const s = (t.status || 'OPEN').toUpperCase();
    if (s === 'DONE') done++;
    else if (s === 'IN_PROGRESS') inProg++;
    else open++;

    if ((t.assignee || '').trim()) assigned++;

    const due = t.dueDate ? new Date(t.dueDate) : null;
    if (due && !Number.isNaN(due.getTime()) && s !== 'DONE' && due < now) overdue++;
  });

  const pct = (x) => Math.round((x / total) * 100);
  return {
    labels: ['Done %', 'Assigned %', 'Overdue %', 'In Progress %', 'Open %'],
    data: [pct(done), pct(assigned), pct(overdue), pct(inProg), pct(open)]
  };
}

// Chart instances (keep stable, destroy/recreate on rerender)
let meStatusChart = null;
let mePriorityChart = null;
let empCompletionArea = null;
let empStatusPriorityStacked = null;

let adminAssigneeBar = null;
let adminRadar = null;
let adminCompletionLine = null;

function renderEmployeeAnalytics(items) {
  const { muted } = chartColors();
  Chart.defaults.color = muted;

  const basics = computeBasics(items);
  const total = (items || []).length;
  const done = basics.status.DONE;
  const pending = total - done;

  document.getElementById('total') && (document.getElementById('total').textContent = String(total));
  document.getElementById('done') && (document.getElementById('done').textContent = String(done));
  document.getElementById('pending') && (document.getElementById('pending').textContent = String(pending));
  document.getElementById('overdue') && (document.getElementById('overdue').textContent = String(basics.overdue));

  // Status pie
  const stEl = document.getElementById('meStatusChart');
  if (stEl) {
    meStatusChart = destroyChart(meStatusChart);
    meStatusChart = new Chart(stEl, {
      type: 'pie',
      data: {
        labels: ['OPEN', 'IN_PROGRESS', 'DONE'],
        datasets: [{
          data: [basics.status.OPEN, basics.status.IN_PROGRESS, basics.status.DONE],
          backgroundColor: ['#0d6efd', '#f59e0b', '#198754']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
    window.__charts.push(meStatusChart);
  }

  // Priority doughnut
  const prEl = document.getElementById('mePriorityChart');
  if (prEl) {
    mePriorityChart = destroyChart(mePriorityChart);
    mePriorityChart = new Chart(prEl, {
      type: 'doughnut',
      data: {
        labels: ['LOW', 'MEDIUM', 'HIGH'],
        datasets: [{
          data: [basics.priority.LOW, basics.priority.MEDIUM, basics.priority.HIGH],
          backgroundColor: ['#6c757d', '#0ca9c9', '#dc3545']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '62%' }
    });
    window.__charts.push(mePriorityChart);
  }

  // Completion trend (area)
  const labels = lastNWeekLabels(8);
  const doneSeries = computeWeeklyDone(items, labels);
  const areaEl = document.getElementById('empCompletionArea');
  if (areaEl) {
    empCompletionArea = destroyChart(empCompletionArea);
    empCompletionArea = new Chart(areaEl, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Done',
          data: doneSeries,
          borderColor: '#198754',
          backgroundColor: 'rgba(25,135,84,.18)',
          fill: true,
          tension: 0.35,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
    window.__charts.push(empCompletionArea);
  }

  // Priority × Status (stacked bar)
  const psEl = document.getElementById('empStatusPriorityStacked');
  if (psEl) {
    const { pri, grid } = computePriorityByStatus(items);
    empStatusPriorityStacked = destroyChart(empStatusPriorityStacked);
    empStatusPriorityStacked = new Chart(psEl, {
      type: 'bar',
      data: {
        labels: pri,
        datasets: [
          { label: 'OPEN', data: grid.OPEN, backgroundColor: 'rgba(13,110,253,.65)' },
          { label: 'IN_PROGRESS', data: grid.IN_PROGRESS, backgroundColor: 'rgba(245,158,11,.65)' },
          { label: 'DONE', data: grid.DONE, backgroundColor: 'rgba(25,135,84,.65)' }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
    window.__charts.push(empStatusPriorityStacked);
  }
}

function renderAdminAnalytics(items) {
  const { muted } = chartColors();
  Chart.defaults.color = muted;

  // Tasks per assignee (horizontal bar)
  const barEl = document.getElementById('adminAssigneeBar');
  if (barEl) {
    const tp = computeTasksPerAssignee(items);
    adminAssigneeBar = destroyChart(adminAssigneeBar);
    adminAssigneeBar = new Chart(barEl, {
      type: 'bar',
      data: { labels: tp.labels, datasets: [{ label: 'Tasks', data: tp.data, backgroundColor: 'rgba(37,99,235,.65)' }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { grid: { display: false } }
        }
      }
    });
    window.__charts.push(adminAssigneeBar);
  }

  // Team performance radar
  const radEl = document.getElementById('adminRadar');
  if (radEl) {
    const r = computeTeamRadar(items);
    adminRadar = destroyChart(adminRadar);
    adminRadar = new Chart(radEl, {
      type: 'radar',
      data: {
        labels: r.labels,
        datasets: [{
          label: 'Team',
          data: r.data,
          borderColor: 'rgba(96,165,250,.95)',
          backgroundColor: 'rgba(96,165,250,.20)',
          pointBackgroundColor: 'rgba(96,165,250,.95)'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { r: { suggestedMin: 0, suggestedMax: 100 } }
      }
    });
    window.__charts.push(adminRadar);
  }

  // Completion over time (line)
  const lineEl = document.getElementById('adminCompletionLine');
  if (lineEl) {
    const labels = lastNWeekLabels(8);
    const doneSeries = computeWeeklyDone(items, labels);
    adminCompletionLine = destroyChart(adminCompletionLine);
    adminCompletionLine = new Chart(lineEl, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Done',
          data: doneSeries,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,.18)',
          fill: true,
          tension: 0.35,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
    window.__charts.push(adminCompletionLine);
  }
}

function applyRolePanels() {
  const admin = isAdmin();
  const adminPanel = document.getElementById('adminPanel');
  const empPanel = document.getElementById('employeePanel');

  // Hide cleanly to remove spacing gaps
  if (adminPanel) adminPanel.style.display = admin ? '' : 'none';
  if (empPanel) empPanel.style.display = admin ? 'none' : '';
}

// Call after data load
async function loadEmployee() {
  try {
    tasks = await api('/api/tasks') || [];
    derivedTasksCache = safeRun('deriveTasks(employee)', () => deriveTasks(tasks)) || [];
    applyRolePanels();
    safeRun('renderEmployeeAnalytics', () => renderEmployeeAnalytics(derivedTasksCache));
    safeRun('render', render);
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  }
}

async function loadAdmin() {
  try {
    tasks = await api('/api/tasks') || [];
    derivedTasksCache = safeRun('deriveTasks(admin)', () => deriveTasks(tasks)) || [];
    applyRolePanels();
    safeRun('renderAdminAnalytics', () => renderAdminAnalytics(derivedTasksCache));
    safeRun('render', render);
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  }
}
