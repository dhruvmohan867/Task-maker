'use strict';

// ===================== GLOBAL STATE =====================
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user  = JSON.parse(localStorage.getItem('user')  || 'null');
let derivedTasksCache = [];

function syncAuthFromStorage() {
  token = localStorage.getItem('token') || '';
  roles = JSON.parse(localStorage.getItem('roles') || '[]');
  user  = JSON.parse(localStorage.getItem('user')  || 'null');
}

const isAdmin  = () => (syncAuthFromStorage(), roles.includes('ADMIN'));
const isLogged = () => (syncAuthFromStorage(), !!token);

// ===================== SAFE RUNNERS =====================
function safeRun(label, fn) {
  try { return typeof fn === 'function' ? fn() : undefined; } 
  catch (err) { console.error(`[safeRun] ${label}`, err); return undefined; }
}

async function safeRunAsync(label, fn) {
  try { return typeof fn === 'function' ? await fn() : undefined; } 
  catch (err) { 
    console.error(`[safeRunAsync] ${label}`, err); 
    toast(err?.message || `${label} failed`, 'error'); 
  }
}

function bindOnce(key, binder) {
  const k = `__bound_${key}`;
  if (window[k]) return;
  window[k] = true;
  binder();
}

// ===================== UI HELPERS =====================
function toast(msg, type = 'error') {
  const cont = document.getElementById('toastContainer');
  if (!cont) return;
  const t = document.createElement('div');
  t.className = `toast align-items-center text-bg-${type === 'error' ? 'danger' : 'success'} border-0`;
  t.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  cont.appendChild(t);
  new bootstrap.Toast(t, { delay: 2500 }).show();
}

function showLoader(on = true) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = on ? 'grid' : 'none';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function isoToDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

// ===================== API WRAPPER =====================
async function api(path, opt = {}) {
  syncAuthFromStorage();
  opt.headers = Object.assign({}, opt.headers || {}, { 'Accept': 'application/json' });
  if (token) opt.headers.Authorization = 'Bearer ' + token;
  
  try {
    showLoader(true);
    const res = await fetch(path, opt);
    if (res.status === 401 || res.status === 403) {
      localStorage.clear();
      location.href = '/';
      throw new Error('Session expired. Please login again.');
    }
    const txt = await res.text();
    if (!res.ok) throw new Error(txt || 'Request failed');
    return txt ? JSON.parse(txt) : null;
  } finally { showLoader(false); }
}

// ===================== RENDER LOGIC =====================
function matchesQuery(t, q) {
  if (!q) return true;
  const content = `${t.title} ${t.description} ${t.assignee} ${t.status}`.toLowerCase();
  return content.includes(q.toLowerCase());
}

function render() {
  const q = document.getElementById('q')?.value || '';
  const statusFilter = document.getElementById('status')?.value || '';
  const priorityFilter = document.getElementById('priority')?.value || '';
  const tbody = document.querySelector('#tasksTable tbody');
  
  if (!tbody) return;
  tbody.innerHTML = '';

  tasks
    .filter(t => matchesQuery(t, q) && (!statusFilter || t.status === statusFilter) && (!priorityFilter || t.priority === priorityFilter))
    .forEach(t => {
      const s = (t.status || 'OPEN').toUpperCase();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="fw-bold">${t.title || 'Untitled'}</div><div class="small text-muted">${t.description || ''}</div></td>
        <td><span class="badge badge-status ${s}">${s}</span></td>
        <td>${t.priority || 'MEDIUM'}</td>
        <td>${fmtDate(t.dueDate)}</td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-id="${t.id}" data-action="edit">Edit</button>
            <button class="btn btn-sm btn-success" data-id="${t.id}" data-action="nextStatus" ${s === 'DONE' ? 'disabled' : ''}>
              ${s === 'OPEN' ? 'Start' : 'Done'}
            </button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
}

// ===================== TASK CRUD & MODALS =====================
const taskModal = document.getElementById('taskModal') ? new bootstrap.Modal(document.getElementById('taskModal')) : null;

function openEditModal(t) {
  document.getElementById('taskModalTitle').textContent = 'Update Task';
  document.getElementById('tm_id').value = t.id || '';
  document.getElementById('tm_title').value = t.title || '';
  document.getElementById('tm_desc').value = t.description || '';
  document.getElementById('tm_status').value = t.status || 'OPEN';
  document.getElementById('tm_priority').value = t.priority || 'MEDIUM';
  document.getElementById('tm_due').value = isoToDateInputValue(t.dueDate);
  document.getElementById('tm_assignee').value = t.assignee || '';
  taskModal?.show();
}

function initTaskCrud() {
  // Save/Update Task
  document.getElementById('taskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('tm_id').value;
    const body = {
      title: document.getElementById('tm_title').value,
      description: document.getElementById('tm_desc').value,
      status: document.getElementById('tm_status').value,
      priority: document.getElementById('tm_priority').value,
      dueDate: document.getElementById('tm_due').value ? new Date(document.getElementById('tm_due').value).toISOString() : null,
      assignee: document.getElementById('tm_assignee').value
    };

    await safeRunAsync('saveTask', () => api(id ? `/api/tasks/${id}` : '/api/tasks', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }));
    
    taskModal?.hide();
    await load();
  });

  // Table Delegation (Edit & Quick Status)
  document.getElementById('tasksTable')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const t = tasks.find(x => x.id === id);

    if (action === 'edit' && t) openEditModal(t);
    if (action === 'nextStatus' && t) {
      const next = t.status === 'OPEN' ? 'IN_PROGRESS' : 'DONE';
      await safeRunAsync('updateStatus', () => api(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...t, status: next })
      }));
      await load();
    }
  });
}

// ===================== CORE EVENTS =====================
function initCoreEvents() {
  // Mirror Navbar Search to Table Search
  document.getElementById('globalSearch')?.addEventListener('input', (e) => {
    const q = document.getElementById('q');
    if (q) q.value = e.target.value;
    render();
  });

  // Table Filters
  ['q', 'status', 'priority'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', render);
  });

  // New Task button logic
  document.getElementById('newBtn')?.addEventListener('click', () => {
    document.getElementById('taskForm').reset();
    document.getElementById('tm_id').value = '';
    document.getElementById('taskModalTitle').textContent = 'New Task';
    taskModal?.show();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => { localStorage.clear(); location.href = '/'; });
  document.getElementById('refreshNowBtn')?.addEventListener('click', load);
}

// ===================== LOAD & INIT =====================
async function load() {
  syncAuthFromStorage();
  if (!isLogged()) return;
  try {
    tasks = await api('/api/tasks') || [];
    applyRolePanels();
    render();
    // Re-render charts if analytics functions are present
    if (typeof renderEmployeeAnalytics === 'function' && !isAdmin()) renderEmployeeAnalytics(tasks);
    if (typeof renderAdminAnalytics === 'function' && isAdmin()) renderAdminAnalytics(tasks);
  } catch (e) { toast(e.message); }
}

function applyRolePanels() {
  const admin = isAdmin();
  const aPanel = document.getElementById('adminPanel'), ePanel = document.getElementById('employeePanel');
  if (aPanel) aPanel.style.display = admin ? 'block' : 'none';
  if (ePanel) ePanel.style.display = admin ? 'none' : 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  initCoreEvents();
  initTaskCrud();
  load();
});