'use strict';

/* Dashboard interactions — Bootstrap 5 + vanilla JS only */

// ===================== GLOBAL STATE =====================
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user  = JSON.parse(localStorage.getItem('user')  || 'null');

const isAdmin  = () => roles.includes('ADMIN');
const isLogged = () => !!token;

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

function setUiBusy(on) {
  __busy = !!on;
  document.documentElement.setAttribute('aria-busy', __busy ? 'true' : 'false');

  ['refreshNowBtn', 'newBtn', 'calendarBtn', 'menuCreate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = __busy;
  });
}

function showLoader(on = true) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = on ? 'grid' : 'none';
  setUiBusy(on);
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
  opt.headers = Object.assign({}, opt.headers || {});
  opt.method  = opt.method || 'GET';
  if (token) opt.headers.Authorization = 'Bearer ' + token;

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
  tasks = await api('/api/tasks') || [];
  derivedTasksCache = safeRun('deriveTasks(employee)', () => deriveTasks(tasks)) || [];
  safeRun('render', render);
}

async function loadAdmin() {
  tasks = await api('/api/tasks') || [];
  derivedTasksCache = safeRun('deriveTasks(admin)', () => deriveTasks(tasks)) || [];
  safeRun('render', render);
}

async function load() {
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
  // ---- New Task (top button + sidebar button) ----
  document.getElementById('newBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    safeRun('openNew(newBtn)', () => (typeof openNew === 'function' ? openNew() : openTaskModal()));
  });

  document.getElementById('menuCreate')?.addEventListener('click', (e) => {
    e.preventDefault();
    safeRun('openNew(menuCreate)', () => (typeof openNew === 'function' ? openNew() : openTaskModal()));
  });

  // ---- Refresh (async safe) ----
  document.getElementById('refreshNowBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    safeRunAsync('refresh/load', async () => {
      // load() is async in your file; ensure we await it
      await load();
    });
  });

  // ---- Logout (top + profile button) ----
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    safeRun('logout', doLogout);
  });

  document.getElementById('profileLogoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    safeRun('logout(profile)', doLogout);
  });

  // ---- Calendar (ensure tasks loaded; then open) ----
  document.getElementById('calendarBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    safeRunAsync('calendar', async () => {
      if (!isLogged()) return;

      // Ensure tasks exist (calendar depends on tasks)
      if (!Array.isArray(tasks) || tasks.length === 0) {
        if (isAdmin()) await loadAdmin();
        else await loadEmployee();
      }

      // Build calendar grid only if function exists in your file
      if (typeof buildCalendarGrid === 'function') {
        safeRun('buildCalendarGrid', () => buildCalendarGrid(tasks));
      }

      openCalendarModal();
    });
  });

  // ---- Theme toggle (persist + checkbox sync) ----
  document.getElementById('darkToggle')?.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    safeRun('setTheme', () => setTheme(theme));
  });

  // ---- Public panel buttons (if present) ----
  document.getElementById('publicLogin')?.addEventListener('click', () => (location.href = '/login'));
  document.getElementById('publicSignup')?.addEventListener('click', () => (location.href = '/signup'));
}

// Bind events exactly once after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  bindOnce('coreEvents', () => safeRun('initCoreEvents', initCoreEvents));

  // Ensure theme checkbox reflects saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  safeRun('setTheme(saved)', () => setTheme(savedTheme));
  const t = document.getElementById('darkToggle');
  if (t) t.checked = savedTheme === 'dark';
});

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);

  safeRun('initCoreEvents', initCoreEvents);
  safeRun('load', load);
});
