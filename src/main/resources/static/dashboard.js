```javascript
let tasks = [];
const modal = new bootstrap.Modal(document.getElementById('taskModal'));

async function api(path, opt) {
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

document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('taskId').value;
  const payload = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value,
    status: document.getElementById('statusInput').value,
    priority: document.getElementById('priorityInput').value,
    dueDate: document.getElementById('dueDate').value ? new Date(document.getElementById('dueDate').value).toISOString() : null,
    assignee: document.getElementById('assignee').value
  };

  if (id) {
    await api(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, id })
    });
  } else {
    await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  modal.hide();
  await load();
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

load();
```