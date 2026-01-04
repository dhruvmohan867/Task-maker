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
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);

  requestAnimationFrame(() => {
    Chart.defaults.color =
      getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#64748b';
    window.__charts.forEach(ch => safeRun('chart.update', () => ch.update()));
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
    safeRun('render', render);
  } catch (e) {
    toast(e.message || 'Failed to load tasks', 'error');
  }
}

async function loadAdmin() {
  try {
    tasks = await api('/api/tasks') || [];
    derivedTasksCache = safeRun('deriveTasks(admin)', () => deriveTasks(tasks)) || [];
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
  if (!modalEl) return;

  // Reset any form inside the task modal (safe even if IDs differ)
  const form = modalEl.querySelector('form');
  if (form) form.reset();

  // Clear any hidden id fields if they exist (optional)
  modalEl.querySelectorAll('input[type="hidden"]').forEach(i => {
    if ((i.name || '').toLowerCase().includes('id')) i.value = '';
  });

  // Show modal (your file already creates `taskModal` bootstrap instance)
  if (typeof taskModal !== 'undefined' && taskModal) taskModal.show();
}

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
