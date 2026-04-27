// common.js - Shared utilities
const TOKEN_KEY = 'tulip_token';
const USER_KEY = 'tulip_user';

const Auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = '/';
  },
  requireAuth: (allowedTypes) => {
    const u = Auth.getUser();
    if (!u || !Auth.getToken()) { location.href = '/'; return null; }
    if (allowedTypes && !allowedTypes.includes(u.user_type)) {
      // redirect to correct dashboard
      if (u.user_type === 'Admin') location.href = '/admin';
      else if (u.user_type === 'Staff') location.href = '/staff';
      else location.href = '/resident';
      return null;
    }
    return u;
  }
};

async function api(path, opts = {}) {
  const headers = { 'Authorization': 'Bearer ' + Auth.getToken() };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...opts, headers: { ...headers, ...opts.headers } });
  if (res.status === 401) { Auth.logout(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function fmt(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('th-TH');
}
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Modal helpers
function showModal(html, large = false) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal ${large ? 'modal-large' : ''}">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return overlay;
}
function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
}

function confirmDialog(msg) {
  return new Promise(resolve => {
    const m = showModal(`
      <h3 style="margin-bottom:14px">ยืนยันการดำเนินการ</h3>
      <p style="margin-bottom:20px;color:#6b7280">${msg}</p>
      <div class="modal-actions">
        <button class="btn" onclick="this.closest('.modal-overlay').dataset.r='no';this.closest('.modal-overlay').remove()">ยกเลิก</button>
        <button class="btn btn-danger" onclick="this.closest('.modal-overlay').dataset.r='yes';this.closest('.modal-overlay').remove()">ยืนยัน</button>
      </div>
    `);
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m)) {
        obs.disconnect();
        resolve(m.dataset.r === 'yes');
      }
    });
    obs.observe(document.body, { childList: true });
  });
}
