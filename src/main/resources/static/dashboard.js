'use strict';

/* Dashboard interactions — Bootstrap 5 + vanilla JS only */

// ===================== GLOBAL STATE =====================
let tasks = [];
let token = localStorage.getItem('token') || '';
let roles = JSON.parse(localStorage.getItem('roles') || '[]');
let user = JSON.parse(localStorage.getItem('user') || 'null');

// ===================== PAGINATION STATE =====================
let currentPage = 1;
let pageSize = 10;

/**
 * Keep in-memory auth in sync with localStorage.
 */
function syncAuthFromStorage() {
  token = localStorage.getItem('token') || '';
  roles = JSON.parse(localStorage.getItem('roles') || '[]');
  user = JSON.parse(localStorage.getItem('user') || 'null');
}

const isAdmin = () => (syncAuthFromStorage(), roles.includes('ADMIN'));
const isLogged = () => (syncAuthFromStorage(), !!token);

let derivedTasksCache = [];

/**
 * Safe runner - prevents one JS error from breaking the entire dashboard.
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
 * Safe async runner
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

/** Prevent double-binding */
function bindOnce(key, binder) {
  const k = `__bound_${key}`;
  if (window[k]) return;
  window[k] = true;
  binder();
}

/** Logout */
function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('roles');
  localStorage.removeItem('user');
  location.href = '/';
}

/**
 * Ensure modal opens safely
 */
function openTaskModal() {
  const el = document.getElementById('taskModal');
  if (!el) return;

  const form = el.querySelector('form');
  if (form) form.reset();

  if (typeof taskModal !== 'undefined' && taskModal) {
    taskModal.show();
    return;
  }

  try { new bootstrap.Modal(el).show(); } catch (e) { console.error(e); }
}

function openCalendarModal() {
  const el = document.getElementById('calendarModal');
  if (!el) return;

  if (typeof calendarModal !== 'undefined' && calendarModal) {
    calendarModal.show();
    return;
  }
  try { new bootstrap.Modal(el).show(); } catch (e) { console.error(e); }
}

// ===================== BOOTSTRAP MODALS =====================
const taskModal = document.getElementById('taskModal') ? new bootstrap.Modal(document.getElementById('taskModal')) : null;
const calendarModal = document.getElementById('calendarModal') ? new bootstrap.Modal(document.getElementById('calendarModal')) : null;

// ===================== CHART REGISTRY =====================
window.__charts = [];

// ===================== UI BUSY STATE =====================
let __busy = false;
let __pendingRequests = 0;

function setUiBusy(on) {
  __busy = !!on;
  document.documentElement.setAttribute('aria-busy', __busy ? 'true' : 'false');

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
// ===================== TOAST =====================
function toast(msg, type = 'error') {
  const cont = document.getElementById('toastContainer');
  if (!cont) return;

  const bgClass = type === 'success' ? 'text-bg-success' : 'text-bg-danger';
  const t = document.createElement('div');
  t.className = `toast align-items-center ${bgClass} border-0`;
  t.setAttribute('role', 'alert');
  t.setAttribute('aria-live', 'assertive');
  t.setAttribute('aria-atomic', 'true');

  // Fixed: Corrected variable name from 'tr' to 't' and replaced table HTML with valid Toast HTML
  t.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(msg)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;

  cont.appendChild(t);
  const bsToast = new bootstrap.Toast(t, { delay: 3000 });
  bsToast.show();
  t.addEventListener('hidden.bs.toast', () => t.remove());
}

// ===================== API =====================
async function api(path, opt = {}) {
  syncAuthFromStorage();

  opt.headers = Object.assign({}, opt.headers || {});
  opt.method = opt.method || 'GET';
  opt.headers.Accept = 'application/json';

  if (token) opt.headers.Authorization = 'Bearer ' + token;

  // Fix: Increased timeout to 60 seconds to allow for Render cold starts
  const timeoutMs = 60000;
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

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('roles');
      localStorage.removeItem('user');
      syncAuthFromStorage();
      safeRun('setAuthUI(auth-failed)', setAuthUI);
      throw new Error('Session expired or unauthorized. Please login again.');
    }

    if (!res.ok) {
        // Fix: Attempt to parse specific error JSON from backend (e.g., TaskController validation errors)
        let errorMsg = txt;
        try {
            const jsonErr = JSON.parse(txt);
            errorMsg = jsonErr.error || jsonErr.message || txt;
        } catch (e) {
            // Not JSON
        }
        throw new Error(errorMsg || 'Request failed');
    }
    
    return txt ? JSON.parse(txt) : null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    showLoader(false);
  }
}

// ===================== UTIL =====================
function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateInputToIso(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================== AUTH / PROFILE =====================
function setAuthUI() {
  const showAuth = !isLogged();

  document.getElementById('loginBtn')?.classList.toggle('d-none', !showAuth);
  document.getElementById('signupBtn')?.classList.toggle('d-none', !showAuth);
  document.getElementById('logoutBtn')?.classList.toggle('d-none', showAuth);
  document.getElementById('newBtn')?.classList.toggle('d-none', showAuth);

  // Show/hide admin menu
  const menuAdmin = document.getElementById('menuAdmin');
  if (menuAdmin) menuAdmin.style.display = isAdmin() ? '' : 'none';

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
  try { ch.destroy(); } catch (e) { }
  return null;
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);

  requestAnimationFrame(() => {
    if (typeof Chart !== 'undefined') {
      Chart.defaults.color =
        getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#64748b';

      if (Array.isArray(window.__charts)) {
        window.__charts = window.__charts.filter(Boolean);
        window.__charts.forEach(ch => {
          try { ch.update(); } catch (e) { }
        });
      }
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

function matchesQuery(t, q) {
  if (!q) return true;
  const hay = [
    t?.title,
    t?.description,
    t?.assignee,
    t?.status,
    t?.priority
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

// ===================== PAGINATION FUNCTIONS =====================
function getFilteredTasks() {
  const { q, status, priority } = currentFilters();
  return tasks.filter(t =>
    matchesQuery(t, q) &&
    (!status || t.status === status) &&
    (!priority || t.priority === priority)
  );
}

function getPaginatedTasks() {
  const filtered = getFilteredTasks();
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  // Ensure currentPage is within bounds
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: filtered.slice(start, end),
    total: filtered.length,
    totalPages
  };
}

function renderPagination() {
  const { total, totalPages } = getPaginatedTasks();
  const info = document.getElementById('paginationInfo');
  const controls = document.getElementById('paginationControls');

  if (info) {
    const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    info.textContent = `Showing ${start}–${end} of ${total} tasks`;
  }

  if (!controls) return;
  controls.innerHTML = '';

  if (totalPages <= 1) return;

  // Previous button
  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `<button class="page-link" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>
    <i class="bi bi-chevron-left"></i>
  </button>`;
  controls.appendChild(prevLi);

  // Page numbers (show max 5)
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);

  for (let i = startPage; i <= endPage; i++) {
    const li = document.createElement('li');
    li.className = `page-item ${i === currentPage ? 'active' : ''}`;
    li.innerHTML = `<button class="page-link" data-page="${i}">${i}</button>`;
    controls.appendChild(li);
  }

  // Next button
  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
  nextLi.innerHTML = `<button class="page-link" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>
    <i class="bi bi-chevron-right"></i>
  </button>`;
  controls.appendChild(nextLi);
}

function initPagination() {
  // Page size selector
  document.getElementById('pageSize')?.addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10) || 10;
    currentPage = 1;
    safeRun('render(pageSize)', render);
  });

  // Pagination controls (event delegation)
  document.getElementById('paginationControls')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;

    const page = parseInt(btn.getAttribute('data-page'), 10);
    const { totalPages } = getPaginatedTasks();
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      safeRun('render(pagination)', render);
      document.getElementById('tasksSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// ===================== RENDER =====================
function render() {
  const tbody = document.querySelector('#tasksTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const { items } = getPaginatedTasks();

  if (items.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="text-center text-muted py-5">
      <i class="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
      <div class="fw-semibold">No tasks found</div>
      <div class="small">Create your first task or adjust filters</div>
    </td>`;
    tbody.appendChild(tr);
  } else {
    items.forEach(t => {
      const s = (t.status || 'OPEN').toUpperCase();
      const p = (t.priority || 'MEDIUM').toUpperCase();
      const canAdvance = s === 'OPEN' || s === 'IN_PROGRESS';

      const statusBadgeClass = s === 'DONE' ? 'badge-DONE' : s === 'IN_PROGRESS' ? 'badge-IN_PROGRESS' : 'badge-OPEN';
      const priorityBadgeClass = `badge-${p}`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ps-3">
          <div class="fw-semibold">${escapeHtml(t.title || '')}</div>
          ${t.description ? `<div class="text-muted small text-truncate" style="max-width:250px">${escapeHtml(t.description)}</div>` : ''}
        </td>
        <td><span class="badge ${statusBadgeClass}">${s.replace('_', ' ')}</span></td>
        <td><span class="badge ${priorityBadgeClass}">${p}</span></td>
        <td class="text-muted small">${fmtDate(t.dueDate)}</td>
        <td class="text-muted small">${escapeHtml(t.assignee || '—')}</td>
        <td class="text-end pe-3">
          <div class="d-inline-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" data-id="${t.id}" data-action="edit" title="Edit task">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm ${canAdvance ? 'btn-outline-success' : 'btn-secondary'}"
                    data-action="nextStatus"
                    data-id="${t.id}"
                    ${canAdvance ? '' : 'disabled'}
                    title="${s === 'OPEN' ? 'Start task' : s === 'IN_PROGRESS' ? 'Mark done' : 'Completed'}">
              ${s === 'OPEN' ? '<i class="bi bi-play-fill"></i>' : s === 'IN_PROGRESS' ? '<i class="bi bi-check-lg"></i>' : '<i class="bi bi-check-all"></i>'}
            </button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  renderPagination();

  // Update last updated time
  const lastUpdated = document.getElementById('lastUpdated');
  if (lastUpdated) {
    lastUpdated.textContent = new Date().toLocaleTimeString();
  }
}

// ===================== GO TO TASKS =====================
function scrollToTasks() {
  const tasksSection = document.getElementById('tasksSection');
  if (tasksSection) {
    tasksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tasksSection.classList.add('highlight-section');
    setTimeout(() => tasksSection.classList.remove('highlight-section'), 1500);
  }
}

// ===================== LOADERS =====================
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

async function load() {
  syncAuthFromStorage();
  setAuthUI();

  if (!isLogged()) return;

  if (isAdmin()) await loadAdmin();
  else await loadEmployee();
}

// ===================== DERIVED TASKS =====================
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

    const titleLen = (t?.title || '').trim().length;
    const descLen = (t?.description || '').trim().length;
    const complexity = Math.min(100, Math.round(titleLen * 0.8 + descLen * 0.25));
    const effortDays = (createdAt && due) ? Math.max(0, Math.round((due - createdAt) / 86400000)) : 0;

    return { ...t, __createdAt: createdAt, __due: due, __overdue: overdue, __complexity: complexity, __effortDays: effortDays };
  });
}

// ===================== OPEN NEW TASK =====================
function openNew() {
  const modalEl = document.getElementById('taskModal');
  if (!modalEl) {
    toast('Task modal (#taskModal) is missing in dashboard.html', 'error');
    return;
  }

  document.getElementById('taskModalTitle')?.replaceChildren(document.createTextNode('New Task'));
  const errEl = document.getElementById('tm_err');
  if (errEl) errEl.style.display = 'none';

  document.getElementById('tm_id').value = '';
  document.getElementById('tm_title').value = '';
  document.getElementById('tm_desc').value = '';
  document.getElementById('tm_status').value = 'OPEN';
  document.getElementById('tm_priority').value = 'MEDIUM';
  document.getElementById('tm_due').value = '';
  document.getElementById('tm_assignee').value = '';

  if (taskModal) taskModal.show();
}

// ===================== CALENDAR =====================
function buildCalendarGrid(items) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) {
    toast('Calendar grid (#calendarGrid) is missing in dashboard.html', 'error');
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map();
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

  // Day labels
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  dayLabels.forEach(label => {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'day-label';
    labelDiv.textContent = label;
    grid.appendChild(labelDiv);
  });

  // Padding before month start
  for (let i = 0; i < startDow; i++) {
    const pad = document.createElement('div');
    pad.className = 'day empty';
    grid.appendChild(pad);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'day';

    const d = new Date(year, month, day);
    const key = isoToDateInputValue(d.toISOString());

    const isToday = d.toDateString() === now.toDateString();
    if (isToday) cell.classList.add('today');

    const label = document.createElement('div');
    label.className = 'date';
    label.textContent = String(day);
    cell.appendChild(label);

    const list = byDay.get(key) || [];
    list.slice(0, 3).forEach(t => {
      const pill = document.createElement('span');
      const p = (t.priority || 'MEDIUM').toUpperCase();
      pill.className = `pill ${p === 'HIGH' ? 'pill-high' : p === 'LOW' ? 'pill-low' : 'pill-med'}`;
      pill.textContent = t.title || '(untitled)';
      cell.appendChild(pill);
    });

    if (list.length > 3) {
      const more = document.createElement('span');
      more.className = 'pill pill-more';
      more.textContent = `+${list.length - 3} more`;
      cell.appendChild(more);
    }

    grid.appendChild(cell);
  }
}

// ===================== TASK CRUD =====================
function initTaskCrud() {
  // Table click (event delegation)
  document.getElementById('tasksTable')?.addEventListener('click', (e) => {
    const editBtn = e.target?.closest?.('button[data-action="edit"]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const t = (tasks || []).find(x => String(x.id) === String(id));
      if (!t) return;

      const modalEl = document.getElementById('taskModal');
      if (!modalEl) {
        toast('Task modal (#taskModal) is missing in dashboard.html', 'error');
        return;
      }

      document.getElementById('taskModalTitle')?.replaceChildren(document.createTextNode('Edit Task'));
      const errEl = document.getElementById('tm_err');
      if (errEl) errEl.style.display = 'none';

      document.getElementById('tm_id').value = t.id || '';
      document.getElementById('tm_title').value = t.title || '';
      document.getElementById('tm_desc').value = t.description || '';
      document.getElementById('tm_status').value = t.status || 'OPEN';
      document.getElementById('tm_priority').value = t.priority || 'MEDIUM';
      document.getElementById('tm_due').value = isoToDateInputValue(t.dueDate);
      document.getElementById('tm_assignee').value = t.assignee || '';

      taskModal?.show();
    }
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
        toast('Task updated successfully', 'success');
      } else {
        await api('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        toast('Task created successfully', 'success');
      }

      taskModal?.hide();
      await load();
    });
  });
}

// ===================== INLINE STATUS ACTIONS =====================
function nextStatus(current) {
  const s = (current || 'OPEN').toUpperCase();
  if (s === 'OPEN') return 'IN_PROGRESS';
  if (s === 'IN_PROGRESS') return 'DONE';
  return 'DONE';
}

function initInlineStatusActions() {
  const table = document.getElementById('tasksTable');
  if (!table) return;

  table.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-action="nextStatus"]');
    if (!btn) return;

    safeRunAsync('nextStatus', async () => {
      if (!isLogged()) { location.href = '/login'; return; }

      const id = btn.getAttribute('data-id');
      const t = (tasks || []).find(x => String(x.id) === String(id));
      if (!t) return;

      const newStatus = nextStatus(t.status);
      if (newStatus === (t.status || '').toUpperCase()) return;

      const body = {
        title: t.title || '',
        description: t.description || '',
        status: newStatus,
        priority: t.priority || 'MEDIUM',
        dueDate: t.dueDate || null,
        assignee: t.assignee || ''
      };

      await api(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      toast(`Task moved to ${newStatus.replace('_', ' ')}`, 'success');
      await load();
    });
  });
}

// ===================== CHARTS =====================
function chartColors() {
  const css = getComputedStyle(document.documentElement);
  const text = (css.getPropertyValue('--text') || '#0b1220').trim();
  const muted = (css.getPropertyValue('--muted') || '#64748b').trim();
  return { text, muted };
}

function weekStartIso(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const day = (x.getDay() + 6) % 7;
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

// Chart instances
let meStatusChart = null;
let mePriorityChart = null;
let empCompletionArea = null;
let empStatusPriorityStacked = null;
let adminAssigneeBar = null;
let adminRadar = null;
let adminCompletionLine = null;

function isCanvasVisible(canvas) {
  return !!(canvas && canvas.offsetParent !== null);
}

function renderEmployeeAnalytics(items) {
  if (typeof Chart === 'undefined') return;

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
  if (stEl && isCanvasVisible(stEl)) {
    meStatusChart = destroyChart(meStatusChart);
    meStatusChart = new Chart(stEl, {
      type: 'pie',
      data: {
        labels: ['OPEN', 'IN PROGRESS', 'DONE'],
        datasets: [{
          data: [basics.status.OPEN, basics.status.IN_PROGRESS, basics.status.DONE],
          backgroundColor: ['#3b82f6', '#f59e0b', '#22c55e']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    window.__charts.push(meStatusChart);
  }

  // Priority doughnut
  const prEl = document.getElementById('mePriorityChart');
  if (prEl && isCanvasVisible(prEl)) {
    mePriorityChart = destroyChart(mePriorityChart);
    mePriorityChart = new Chart(prEl, {
      type: 'doughnut',
      data: {
        labels: ['LOW', 'MEDIUM', 'HIGH'],
        datasets: [{
          data: [basics.priority.LOW, basics.priority.MEDIUM, basics.priority.HIGH],
          backgroundColor: ['#64748b', '#06b6d4', '#ef4444']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '60%' }
    });
    window.__charts.push(mePriorityChart);
  }

  // Completion trend (area)
  const labels = lastNWeekLabels(8);
  const doneSeries = computeWeeklyDone(items, labels);
  const areaEl = document.getElementById('empCompletionArea');
  if (areaEl && isCanvasVisible(areaEl)) {
    empCompletionArea = destroyChart(empCompletionArea);
    empCompletionArea = new Chart(areaEl, {
      type: 'line',
      data: {
        labels: labels.map(l => l.slice(5)),
        datasets: [{
          label: 'Completed',
          data: doneSeries,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
  if (psEl && isCanvasVisible(psEl)) {
    const { pri, grid } = computePriorityByStatus(items);
    empStatusPriorityStacked = destroyChart(empStatusPriorityStacked);
    empStatusPriorityStacked = new Chart(psEl, {
      type: 'bar',
      data: {
        labels: pri,
        datasets: [
          { label: 'OPEN', data: grid.OPEN, backgroundColor: 'rgba(59, 130, 246, 0.7)' },
          { label: 'IN PROGRESS', data: grid.IN_PROGRESS, backgroundColor: 'rgba(245, 158, 11, 0.7)' },
          { label: 'DONE', data: grid.DONE, backgroundColor: 'rgba(34, 197, 94, 0.7)' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
  if (typeof Chart === 'undefined') return;

  const { muted } = chartColors();
  Chart.defaults.color = muted;

  // Also update KPIs for admin
  const basics = computeBasics(items);
  const total = (items || []).length;
  const done = basics.status.DONE;
  const pending = total - done;

  document.getElementById('total') && (document.getElementById('total').textContent = String(total));
  document.getElementById('done') && (document.getElementById('done').textContent = String(done));
  document.getElementById('pending') && (document.getElementById('pending').textContent = String(pending));
  document.getElementById('overdue') && (document.getElementById('overdue').textContent = String(basics.overdue));

  // Tasks per assignee (horizontal bar)
  const barEl = document.getElementById('adminAssigneeBar');
  if (barEl) {
    const tp = computeTasksPerAssignee(items);
    adminAssigneeBar = destroyChart(adminAssigneeBar);
    adminAssigneeBar = new Chart(barEl, {
      type: 'bar',
      data: {
        labels: tp.labels,
        datasets: [{ label: 'Tasks', data: tp.data, backgroundColor: 'rgba(59, 130, 246, 0.7)' }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
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
          borderColor: 'rgba(59, 130, 246, 0.9)',
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          pointBackgroundColor: 'rgba(59, 130, 246, 0.9)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
        labels: labels.map(l => l.slice(5)),
        datasets: [{
          label: 'Completed',
          data: doneSeries,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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

  if (adminPanel) adminPanel.style.display = admin ? '' : 'none';
  if (empPanel) empPanel.style.display = admin ? 'none' : '';
}

// ===================== CHART SWITCHER =====================
function setActivePane(wrapId, paneKey) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  wrap.querySelectorAll('.chart-pane').forEach(p => {
    p.classList.toggle('is-active', p.getAttribute('data-pane') === paneKey);
  });

  const active = wrap.querySelector(`.chart-pane[data-pane="${paneKey}"]`);
  if (active) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function initChartSwitcher() {
  const sel = document.getElementById('empChartSelect');
  if (sel) {
    setActivePane('empChartsWrap', sel.value);

    sel.addEventListener('change', () => {
      setActivePane('empChartsWrap', sel.value);
      safeRun('renderEmployeeAnalytics(active)', () => renderEmployeeAnalytics(derivedTasksCache));
    });
  }
}

// ===================== EVENTS =====================
function initCoreEvents() {
  bindOnce('coreEvents_internal', () => {
    // Auth buttons
    document.getElementById('loginBtn')?.addEventListener('click', () => (location.href = '/login'));
    document.getElementById('signupBtn')?.addEventListener('click', () => (location.href = '/signup'));

    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.getElementById('appSidebar')?.classList.toggle('is-open');
    });

    // Dashboard navigation
    document.getElementById('navHome')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.app-navitem').forEach(x => x.classList.remove('active'));
      document.getElementById('navHome')?.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // GO TO TASKS BUTTONS
    document.getElementById('goToTasksBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.app-navitem').forEach(x => x.classList.remove('active'));
      document.getElementById('goToTasksBtn')?.classList.add('active');
      scrollToTasks();
    });

    document.getElementById('goToTasksBtnHeader')?.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToTasks();
    });

    // Admin Analytics
    document.getElementById('navAdminAnalytics')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      document.querySelectorAll('.app-navitem').forEach(x => x.classList.remove('active'));
      document.getElementById('navAdminAnalytics')?.classList.add('active');
      document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // New Task
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

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      safeRun('logout', doLogout);
    });
    document.getElementById('profileLogoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      safeRun('logout(profile)', doLogout);
    });

    // Search (navbar + tasks section)
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
      const val = e.target.value || '';
      const q = document.getElementById('q');
      if (q) q.value = val;
      currentPage = 1;
      safeRun('render(globalSearch)', render);
    });

    document.getElementById('q')?.addEventListener('input', () => {
      currentPage = 1;
      safeRun('render(q)', render);
    });

    document.getElementById('status')?.addEventListener('change', () => {
      currentPage = 1;
      safeRun('render(status)', render);
    });

    document.getElementById('priority')?.addEventListener('change', () => {
      currentPage = 1;
      safeRun('render(priority)', render);
    });

    document.getElementById('clearFilters')?.addEventListener('click', (e) => {
      e.preventDefault();
      const q = document.getElementById('q'); if (q) q.value = '';
      const s = document.getElementById('status'); if (s) s.value = '';
      const p = document.getElementById('priority'); if (p) p.value = '';
      const gs = document.getElementById('globalSearch'); if (gs) gs.value = '';
      currentPage = 1;
      safeRun('render(clearFilters)', render);
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

        safeRun('buildCalendarGrid', () => buildCalendarGrid(tasks));
        openCalendarModal();
      });
    });

    // Theme toggle
    document.getElementById('darkToggle')?.addEventListener('change', (e) => {
      const theme = e.target.checked ? 'dark' : 'light';
      safeRun('setTheme', () => setTheme(theme));
    });

    // Public panel buttons
    document.getElementById('publicLogin')?.addEventListener('click', () => (location.href = '/login'));
    document.getElementById('publicSignup')?.addEventListener('click', () => (location.href = '/signup'));
  });
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  bindOnce('coreEvents', () => safeRun('initCoreEvents', initCoreEvents));
  bindOnce('pagination', () => safeRun('initPagination', initPagination));
  bindOnce('taskCrud', () => safeRun('initTaskCrud', initTaskCrud));
  bindOnce('chartSwitcher', () => safeRun('initChartSwitcher', initChartSwitcher));
  bindOnce('inlineStatus', () => safeRun('initInlineStatusActions', initInlineStatusActions));

  const savedTheme = localStorage.getItem('theme') || 'light';
  safeRun('setTheme(saved)', () => setTheme(savedTheme));
  const t = document.getElementById('darkToggle');
  if (t) t.checked = savedTheme === 'dark';

  safeRunAsync('load(initial)', async () => { await load(); });
});