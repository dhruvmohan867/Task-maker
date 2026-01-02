'use strict';

function setAuth(token, roles, user) {
  localStorage.setItem('token', token || '');
  localStorage.setItem('roles', JSON.stringify(roles || []));
  localStorage.setItem('user', JSON.stringify(user || null));
}

async function postJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Login page
const lf = document.getElementById('loginPageForm');
if (lf) {
  lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('lp_u').value.trim();
    const p = document.getElementById('lp_p').value;
    const err = document.getElementById('lp_err'); err.style.display = 'none';
    try {
      const data = await postJson('/auth/login', { username: u, password: p });
      setAuth(data.token, data.roles, data.user);
      location.href = '/dashboard';
    } catch (ex) { err.textContent = ex.message || 'Invalid credentials'; err.style.display = 'block'; }
  });
}

// Sign up page
const sf = document.getElementById('signupPageForm');
if (sf) {
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('sp_n').value.trim();
    const email = document.getElementById('sp_e').value.trim();
    const u = document.getElementById('sp_u').value.trim();
    const p = document.getElementById('sp_p').value;
    const c = document.getElementById('sp_c').value;
    const err = document.getElementById('sp_err'); err.style.display = 'none';
    if (p.length < 8) { err.textContent = 'Password must be at least 8 characters'; err.style.display = 'block'; return; }
    if (p !== c) { err.textContent = 'Passwords do not match'; err.style.display = 'block'; return; }
    try {
      const data = await postJson('/auth/signup', { name, email, username: u, password: p });
      setAuth(data.token, data.roles, data.user);
      location.href = '/dashboard';
    } catch (ex) { err.textContent = ex.message || 'Signup failed'; err.style.display = 'block'; }
  });
}