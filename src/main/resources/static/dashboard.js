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

// ===================== EVENTS =====================
function initCoreEvents() {
  document.getElementById('newBtn')?.addEventListener('click', () =>
    safeRun('openNew(newBtn)', openNew)
  );

  document.getElementById('menuCreate')?.addEventListener('click', () =>
    safeRun('openNew(menuCreate)', openNew)
  );

  document.getElementById('calendarBtn')?.addEventListener('click', () =>
    safeRun('calendar', () => calendarModal?.show())
  );

  document.getElementById('refreshNowBtn')?.addEventListener('click', () =>
    safeRun('refresh', load)
  );

  document.getElementById('profileLogoutBtn')?.addEventListener('click', () =>
    document.getElementById('logoutBtn')?.click()
  );

  ['q','status','priority'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () =>
      safeRun('render(filter)', render)
    );
  });

  document.getElementById('darkToggle')?.addEventListener('change', e =>
    setTheme(e.target.checked ? 'dark' : 'light')
  );
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);

  safeRun('initCoreEvents', initCoreEvents);
  safeRun('load', load);
});
