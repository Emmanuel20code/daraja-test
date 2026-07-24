/* EMMATECH Admin Dashboard - JavaScript */
let token = localStorage.getItem('adminToken');
let adminData = null;
let editingRouter = null;
let editingPkg = null;
let currentPage = { customers: 1, payments: 1 };

// ====== AUTH ======
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  try {
    const r = await api('/api/auth/login', 'POST', { username, password }, false);
    token = r.token;
    adminData = r.admin;
    localStorage.setItem('adminToken', token);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('topAdmin').textContent = adminData.full_name || adminData.username;
    document.getElementById('adminInfo').textContent = adminData.role + ' · ' + adminData.username;
    loadDashboard();
    startAutoRefresh();
  } catch(e) {
    errEl.textContent = e.message || 'Login failed';
    errEl.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  location.reload();
}

// Auto-login if token exists
if (token) {
  fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      adminData = data.admin;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('topAdmin').textContent = adminData.full_name || adminData.username;
      document.getElementById('adminInfo').textContent = adminData.role + ' · ' + adminData.username;
      loadDashboard();
      startAutoRefresh();
    })
    .catch(() => { localStorage.removeItem('adminToken'); });
}

// ====== API ======
async function api(url, method = 'GET', body = null, auth = true) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (auth && token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ====== NAVIGATION ======
const pageTitles = { dashboard:'Dashboard', live:'Live Users', routers:'Routers', packages:'Packages',
  customers:'Customers', devices:'Devices', payments:'Payments', sessions:'Sessions',
  vouchers:'Vouchers', reports:'Reports', logs:'Logs', notifications:'Notifications', settings:'Settings' };

function nav(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => { if (n.textContent.trim().toLowerCase().startsWith(pageTitles[page]?.toLowerCase())) n.classList.add('active'); });
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  document.getElementById('sidebar').classList.remove('open');
  const loaders = { dashboard: loadDashboard, live: loadLive, routers: loadRouters,
    packages: loadPackages, customers: loadCustomers, devices: loadDevices, payments: loadPayments,
    sessions: loadSessions, vouchers: loadVouchers, reports: loadReports, logs: loadLogs,
    notifications: loadNotifications, settings: loadSettings };
  if (loaders[page]) loaders[page]();
}

// ====== AUTO REFRESH ======
function startAutoRefresh() {
  setInterval(checkNotifications, 30000);
  checkNotifications();
}

async function checkNotifications() {
  try {
    const data = await api('/api/notifications?limit=1');
    const count = data.unread || 0;
    const badge = document.getElementById('notifCount');
    badge.style.display = count > 0 ? 'inline' : 'none';
    badge.textContent = count;
    const btn = document.getElementById('notifBtn');
    if (count > 0) btn.style.color = '#e74c3c'; else btn.style.color = '';
  } catch(e) {}
}

// ====== TOAST ======
function toast(msg, type = '') {
  const el = document.getElementById('adminToast');
  const bg = { success: '#27ae60', error: '#c0392b', '': '#1a6b94' };
  el.textContent = msg;
  el.style.background = bg[type] || bg[''];
  el.style.display = 'block';
  document.getElementById('toast-modal').classList.add('show');
  setTimeout(() => {
    el.style.display = 'none';
    document.getElementById('toast-modal').classList.remove('show');
  }, 3000);
}

function closeModalB(id) { document.getElementById(id).classList.remove('show'); }

// ====== HELPERS ======
function fmtDate(d) { if (!d) return '-'; return new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'short', timeStyle: 'short' }); }
function fmtKES(n) { return 'KES ' + (parseInt(n) || 0).toLocaleString(); }
function badge(status) {
  const map = { active: 'green', paid: 'green', online: 'green', unused: 'blue',
    pending: 'yellow', offline: 'red', failed: 'red', used: 'gray', expired: 'gray',
    disconnected: 'gray', inactive: 'gray' };
  return `<span class="badge badge-${map[status]||'gray'}">${status}</span>`;
}

// ====== DASHBOARD ======
async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    const { stats, recentPayments, monthlyRevenue } = data;
    document.getElementById('statsGrid').innerHTML = [
      ['&#128101; Customers', stats.totalCustomers, 'Total registered', ''],
      ['&#128100; Active Sessions', stats.activeSessions, 'Connected now', 'green'],
      ['&#128176; Today Revenue', fmtKES(stats.todayRevenue), 'Payments today', 'primary'],
      ['&#128179; Total Revenue', fmtKES(stats.totalRevenue), 'All time', ''],
      ['&#128225; Online Routers', stats.onlineRouters, 'Connected routers', 'green']
    ].map(([label, val, sub, color]) =>
      `<div class="stat-card"><div class="stat-label">${label}</div>
       <div class="stat-value" style="color:${color==='green'?'var(--green)':color==='primary'?'var(--primary)':'var(--text)'}">${val}</div>
       <div class="stat-sub">${sub}</div></div>`
    ).join('');

    // Revenue chart
    if (monthlyRevenue.length) {
      const max = Math.max(...monthlyRevenue.map(d => +d.revenue), 1);
      document.getElementById('revenueChart').innerHTML = monthlyRevenue.map(d =>
        `<div class="chart-bar" title="KES ${parseInt(d.revenue).toLocaleString()}\n${fmtDate(d.day)}" style="height:${Math.max(4, (+d.revenue/max)*100)}%"></div>`
      ).join('');
      document.getElementById('chartX').innerHTML = monthlyRevenue
        .filter((_, i) => i % Math.ceil(monthlyRevenue.length / 6) === 0)
        .map(d => `<span>${new Date(d.day).toLocaleDateString('en-KE', { month:'short', day:'numeric' })}</span>`).join('');
    }

    // Recent payments table
    document.getElementById('recentPayTbl').innerHTML = recentPayments.map(p =>
      `<tr><td>${p.phone}</td><td>${p.package_name||'-'}</td><td>${fmtKES(p.amount)}</td><td>${badge(p.status)}</td><td>${fmtDate(p.paid_at||p.created_at)}</td></tr>`
    ).join('') || '<tr><td colspan="5" class="empty-state">No payments yet</td></tr>';

    // Package sales
    document.getElementById('pkgSales').innerHTML = data.packages
      .map(p => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span>${p.name}</span><span style="color:var(--text2)">${fmtKES(p.price)}</span><span>${badge(p.active?'active':'inactive')}</span></div>`
      ).join('');
  } catch(e) { toast('Failed to load dashboard', 'error'); }
}

// ====== LIVE USERS ======
async function loadLive() {
  try {
    const data = await api('/api/dashboard/live-users');
    document.getElementById('liveTbl').innerHTML = data.users.map(u =>
      `<tr><td>${u.phone||'-'}</td><td>${u.package_name||'-'}</td><td>${u.router_name||'-'}</td>
       <td style="font-family:monospace;font-size:12px">${u.mac_address||'-'}</td>
       <td>${fmtDate(u.start_time)}</td><td>${fmtDate(u.expiry_time)}</td>
       <td><button class="btn-sm btn-danger" onclick="disconnectSession(${u.id})">Disconnect</button></td></tr>`
    ).join('') || '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#128100;</div>No active users</div></td></tr>';
  } catch(e) { toast('Failed to load live users', 'error'); }
}

async function disconnectSession(id) {
  if (!confirm('Disconnect this session?')) return;
  try { await api(`/api/sessions/${id}/disconnect`, 'POST'); toast('Session disconnected', 'success'); loadLive(); }
  catch(e) { toast(e.message, 'error'); }
}

// ====== ROUTERS ======
async function loadRouters() {
  try {
    const data = await api('/api/routers');
    const list = document.getElementById('routerList');
    if (!data.routers.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128225;</div>No routers added yet. Use the onboarding token to connect a router.</div>'; return; }
    list.innerHTML = data.routers.map(r =>
      `<div class="router-card">
        <div class="router-icon">&#128225;</div>
        <div class="router-info">
          <div class="router-name">${r.name} ${badge(r.status)}</div>
          <div class="router-meta">${r.ip_address||'No IP'} &bull; ${r.location||'No location'} &bull; ${r.routeros_version||'Unknown version'} &bull; CPU: ${r.cpu_load||0}%</div>
          <div class="router-meta">Last seen: ${fmtDate(r.last_heartbeat)} &bull; Active users: ${r.active_users||0} &bull; Token: <code style="font-size:10px">${r.token||'-'}</code></div>
        </div>
        <div class="router-actions">
          <button class="btn-sm btn-blue" onclick="testRouter(${r.id})">Test</button>
          <button class="btn-sm" style="background:var(--border);color:var(--text)" onclick="editRouter(${JSON.stringify(r).replace(/"/g,'&quot;')})">Edit</button>
        </div>
      </div>`
    ).join('');
  } catch(e) { toast('Failed to load routers', 'error'); }
}

function showRouterModal(r = null) {
  editingRouter = r;
  document.getElementById('r_name').value = r?.name||'';
  document.getElementById('r_loc').value = r?.location||'';
  document.getElementById('r_ip').value = r?.ip_address||'';
  document.getElementById('r_port').value = r?.api_port||8728;
  document.getElementById('r_user').value = r?.api_username||'';
  document.getElementById('r_pass').value = '';
  document.getElementById('routerModal').classList.add('show');
}
function editRouter(r) { showRouterModal(r); }

async function saveRouter() {
  const body = { name: document.getElementById('r_name').value, location: document.getElementById('r_loc').value,
    ip_address: document.getElementById('r_ip').value, api_port: document.getElementById('r_port').value,
    api_username: document.getElementById('r_user').value, api_password: document.getElementById('r_pass').value };
  try {
    if (editingRouter) { await api(`/api/routers/${editingRouter.id}`, 'PUT', body); toast('Router updated', 'success'); }
    else { await api('/api/routers', 'POST', body); toast('Router added', 'success'); }
    closeModalB('routerModal'); loadRouters();
  } catch(e) { toast(e.message, 'error'); }
}

async function testRouter(id) {
  try { toast('Testing connection...'); const d = await api(`/api/routers/${id}/test`, 'POST'); toast('Connected! ' + (d.info?.version||''), 'success'); loadRouters(); }
  catch(e) { toast('Connection failed: ' + e.message, 'error'); }
}

async function genOnboardToken() {
  try {
    const d = await api('/api/routers/generate-token', 'POST');
    const appUrl = window.location.origin;
    document.getElementById('tokenScript').innerHTML =
      `<div style="margin-bottom:8px;color:#ff9800">Run in MikroTik Terminal:</div>` +
      `/tool fetch url="${appUrl}/connect?token=${d.token}" dst-path=connect.rsc\n/import file-name=connect.rsc`;
    document.getElementById('tokenModal').classList.add('show');
  } catch(e) { toast(e.message, 'error'); }
}

// ====== PACKAGES ======
async function loadPackages() {
  try {
    const data = await api('/api/packages');
    document.getElementById('pkgTbl').innerHTML = data.packages.map(p =>
      `<tr><td>${p.name}</td><td>${fmtKES(p.price)}</td><td>${p.duration}</td><td>${p.download_speed}Mbps</td><td>${p.upload_speed}Mbps</td><td>${p.device_limit}</td><td>${badge(p.active?'active':'inactive')}</td>
       <td><button class="btn-sm btn-blue" onclick="editPkg(${JSON.stringify(p).replace(/"/g,'&quot;')})">Edit</button> <button class="btn-sm btn-danger" onclick="togglePkg(${p.id},${!p.active})">${p.active?'Disable':'Enable'}</button></td></tr>`
    ).join('') || '<tr><td colspan="8" class="empty-state">No packages</td></tr>';
  } catch(e) { toast('Failed to load packages', 'error'); }
}

function showPkgModal(p = null) {
  editingPkg = p;
  document.getElementById('p_name').value = p?.name||'';
  document.getElementById('p_desc').value = p?.description||'';
  document.getElementById('p_price').value = p?.price||'';
  document.getElementById('p_duration').value = p?.duration||'';
  document.getElementById('p_dl').value = p?.download_speed||5;
  document.getElementById('p_ul').value = p?.upload_speed||3;
  document.getElementById('p_dev').value = p?.device_limit||1;
  document.getElementById('p_order').value = p?.display_order||0;
  document.getElementById('pkgModal').classList.add('show');
}
function editPkg(p) { showPkgModal(p); }

async function savePkg() {
  const body = { name:document.getElementById('p_name').value, description:document.getElementById('p_desc').value,
    price:document.getElementById('p_price').value, duration:document.getElementById('p_duration').value,
    download_speed:document.getElementById('p_dl').value, upload_speed:document.getElementById('p_ul').value,
    device_limit:document.getElementById('p_dev').value, display_order:document.getElementById('p_order').value, active:true };
  try {
    if (editingPkg) { await api(`/api/packages/${editingPkg.id}`, 'PUT', body); toast('Package updated', 'success'); }
    else { await api('/api/packages', 'POST', body); toast('Package created', 'success'); }
    closeModalB('pkgModal'); loadPackages();
  } catch(e) { toast(e.message, 'error'); }
}

async function togglePkg(id, active) {
  try { await api(`/api/packages/${id}`, 'PUT', { active }); toast(active ? 'Package enabled' : 'Package disabled', 'success'); loadPackages(); }
  catch(e) { toast(e.message, 'error'); }
}

// ====== CUSTOMERS ======
async function loadCustomers() {
  try {
    const search = document.getElementById('custSearch')?.value || '';
    const p = currentPage.customers;
    const data = await api(`/api/customers?search=${encodeURIComponent(search)}&page=${p}&limit=20`);
    document.getElementById('custTbl').innerHTML = data.customers.map(c =>
      `<tr><td>${c.phone}</td><td>${c.full_name||'-'}</td><td>${c.email||'-'}</td>
       <td>${badge(c.status)}</td><td>${c.active_sessions}</td><td>${c.total_payments}</td>
       <td>${fmtDate(c.created_at)}</td></tr>`
    ).join('') || '<tr><td colspan="7" class="empty-state">No customers</td></tr>';
    renderPagination('custPag', data.total, 20, p, (np) => { currentPage.customers = np; loadCustomers(); });
  } catch(e) { toast('Failed to load customers', 'error'); }
}

function showCustModal() { document.getElementById('c_phone').value=''; document.getElementById('c_name').value=''; document.getElementById('c_email').value=''; document.getElementById('custModal').classList.add('show'); }

async function saveCust() {
  try {
    await api('/api/customers', 'POST', { phone: document.getElementById('c_phone').value, full_name: document.getElementById('c_name').value, email: document.getElementById('c_email').value });
    toast('Customer added', 'success'); closeModalB('custModal'); loadCustomers();
  } catch(e) { toast(e.message, 'error'); }
}

// ====== DEVICES ======
async function loadDevices() {
  try {
    const search = document.getElementById('devSearch')?.value || '';
    const data = await api(`/api/devices?search=${encodeURIComponent(search)}&limit=50`);
    document.getElementById('devTbl').innerHTML = data.devices.map(d =>
      `<tr><td style="font-family:monospace;font-size:12px">${d.mac_address}</td><td>${d.device_name||'-'}</td>
       <td>${d.full_name||d.phone||'-'}</td><td>${d.router_name||'-'}</td><td>${badge(d.blocked?'blocked':d.status)}</td>
       <td>${fmtDate(d.last_seen)}</td>
       <td><button class="btn-sm ${d.blocked?'btn-success':'btn-danger'}" onclick="toggleBlock(${d.id},${!d.blocked})">${d.blocked?'Unblock':'Block'}</button></td></tr>`
    ).join('') || '<tr><td colspan="7" class="empty-state">No devices</td></tr>';
  } catch(e) { toast('Failed to load devices', 'error'); }
}

async function toggleBlock(id, block) {
  try { await api(`/api/devices/${id}/block`, 'PATCH', { blocked: block, reason: block ? 'Blocked by admin' : null }); toast(block ? 'Device blocked' : 'Device unblocked', 'success'); loadDevices(); }
  catch(e) { toast(e.message, 'error'); }
}

// ====== PAYMENTS ======
async function loadPayments() {
  try {
    const search = document.getElementById('pmtSearch')?.value || '';
    const status = document.getElementById('pmtStatus')?.value || '';
    const p = currentPage.payments;
    const data = await api(`/api/payments?search=${encodeURIComponent(search)}&status=${status}&page=${p}&limit=20`);
    document.getElementById('pmtTbl').innerHTML = data.payments.map(p =>
      `<tr><td>${p.phone}</td><td>${p.package_name||'-'}</td><td>${fmtKES(p.amount)}</td>
       <td style="font-size:11px">${p.mpesa_receipt||'-'}</td><td>${badge(p.status)}</td>
       <td>${fmtDate(p.paid_at||p.created_at)}</td>
       <td>${p.status==='paid'?'':p.status==='failed'?`<button class="btn-sm btn-blue" onclick="activatePayment(${p.id})">Activate</button>`:''}</td></tr>`
    ).join('') || '<tr><td colspan="7" class="empty-state">No payments</td></tr>';
    renderPagination('pmtPag', data.total, 20, currentPage.payments, (np) => { currentPage.payments = np; loadPayments(); });
  } catch(e) { toast('Failed to load payments', 'error'); }
}

async function activatePayment(id) {
  try { await api(`/api/payments/${id}/activate`, 'POST'); toast('Activation triggered', 'success'); loadPayments(); }
  catch(e) { toast(e.message, 'error'); }
}

// ====== SESSIONS ======
async function loadSessions() {
  try {
    const status = document.getElementById('sesStatus')?.value || '';
    const data = await api(`/api/sessions?status=${status}&limit=50`);
    document.getElementById('sesTbl').innerHTML = data.sessions.map(s =>
      `<tr><td>${s.phone||'-'}</td><td>${s.package_name||'-'}</td><td>${s.router_name||'-'}</td>
       <td style="font-family:monospace;font-size:11px">${s.mac_address||'-'}</td>
       <td>${fmtDate(s.start_time)}</td><td>${fmtDate(s.expiry_time)}</td><td>${badge(s.status)}</td>
       <td>${s.status==='active'?`<button class="btn-sm btn-danger" onclick="disconnectSession(${s.id})">Disconnect</button>`:'-'}</td></tr>`
    ).join('') || '<tr><td colspan="8" class="empty-state">No sessions</td></tr>';
  } catch(e) { toast('Failed to load sessions', 'error'); }
}

// ====== VOUCHERS ======
async function loadVouchers() {
  try {
    const status = document.getElementById('vouchStatus')?.value || '';
    const data = await api(`/api/vouchers?status=${status}&limit=100`);
    document.getElementById('vouchTbl').innerHTML = data.vouchers.map(v =>
      `<tr><td style="font-family:monospace;font-weight:700">${v.code}</td><td>${v.package_name||'-'}</td>
       <td>${badge(v.status)}</td><td>${v.phone||'-'}</td><td>${fmtDate(v.used_at)}</td><td>${fmtDate(v.expires_at)}</td></tr>`
    ).join('') || '<tr><td colspan="6" class="empty-state">No vouchers</td></tr>';
  } catch(e) { toast('Failed to load vouchers', 'error'); }
}

function showVoucherGenModal() {
  api('/api/packages?active=true').then(d => {
    document.getElementById('vg_pkg').innerHTML = d.packages.map(p => `<option value="${p.id}">${p.name} - KES ${p.price}</option>`).join('');
    document.getElementById('voucherGenModal').classList.add('show');
  }).catch(() => {});
}

async function genVouchers() {
  try {
    const d = await api('/api/vouchers/generate', 'POST', { package_id: document.getElementById('vg_pkg').value, quantity: parseInt(document.getElementById('vg_qty').value) });
    toast(`${d.codes?.length} vouchers generated!`, 'success'); closeModalB('voucherGenModal'); loadVouchers();
  } catch(e) { toast(e.message, 'error'); }
}

// ====== REPORTS ======
async function loadReports() {
  try {
    const period = document.getElementById('reportPeriod')?.value || '30d';
    const data = await api(`/api/reports/revenue?period=${period}`);
    document.getElementById('reportStats').innerHTML = [
      ['Total Revenue', fmtKES(data.summary?.total||0)],
      ['Total Sales', data.summary?.count||0]
    ].map(([l,v]) => `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('');
    document.getElementById('reportPkgTbl').innerHTML = data.byPackage.map(p =>
      `<tr><td>${p.name}</td><td>${p.sales}</td><td>${fmtKES(p.revenue)}</td></tr>`
    ).join('') || '<tr><td colspan="3" class="empty-state">No data</td></tr>';
  } catch(e) { toast('Failed to load reports', 'error'); }
}

// ====== LOGS ======
async function loadLogs() {
  try {
    const [logs, events] = await Promise.all([api('/api/logs?limit=50'), api('/api/logs/router-events?limit=30')]);
    document.getElementById('logTbl').innerHTML = logs.logs.map(l =>
      `<tr><td>${l.username||'-'}</td><td>${l.action}</td><td>${l.resource_type||'-'}</td>
       <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${l.description||'-'}</td><td>${l.ip_address||'-'}</td><td>${fmtDate(l.created_at)}</td></tr>`
    ).join('') || '<tr><td colspan="6" class="empty-state">No logs</td></tr>';
    document.getElementById('eventTbl').innerHTML = events.events.map(e =>
      `<tr><td>${e.router_name||'-'}</td><td>${e.event_type}</td><td>${e.message||'-'}</td><td>${fmtDate(e.created_at)}</td></tr>`
    ).join('') || '<tr><td colspan="4" class="empty-state">No events</td></tr>';
  } catch(e) { toast('Failed to load logs', 'error'); }
}

// ====== NOTIFICATIONS ======
async function loadNotifications() {
  try {
    const data = await api('/api/notifications?limit=50');
    document.getElementById('notifList').innerHTML = data.notifications.map(n =>
      `<div class="card" style="margin-bottom:10px;padding:14px;${n.read?'opacity:.7':'border-left:3px solid var(--primary)'}">
         <div style="display:flex;align-items:center;justify-content:space-between">
           <div><strong>${n.title}</strong> <span class="badge badge-${n.read?'gray':'yellow'}">${n.read?'read':'new'}</span></div>
           <div style="font-size:12px;color:var(--text2)">${fmtDate(n.created_at)}</div>
         </div>
         <div style="font-size:13px;color:var(--text2);margin-top:6px">${n.message||''}</div>
       </div>`
    ).join('') || '<div class="empty-state"><div class="empty-icon">&#128276;</div>No notifications</div>';
    checkNotifications();
  } catch(e) { toast('Failed to load notifications', 'error'); }
}

async function markAllRead() {
  await api('/api/notifications/read-all', 'POST');
  loadNotifications();
  toast('All notifications read', 'success');
}

// ====== SETTINGS ======
let currentSettings = {};
async function loadSettings() {
  try {
    const data = await api('/api/settings');
    currentSettings = data.settings;
    const keys = ['brand_name', 'support_phone', 'support_email', 'voucher_prefix', 'session_cleanup_interval'];
    const labels = { brand_name:'Brand Name', support_phone:'Support Phone', support_email:'Support Email', voucher_prefix:'Voucher Code Prefix', session_cleanup_interval:'Session Monitor Interval (seconds)' };
    document.getElementById('settingsForm').innerHTML = keys.map(k =>
      `<div class="form-group"><label>${labels[k]||k}</label><input id="setting_${k}" value="${currentSettings[k]||''}" style="max-width:320px"></div>`
    ).join('');
  } catch(e) { toast('Failed to load settings', 'error'); }
}

async function saveSettings() {
  const keys = ['brand_name', 'support_phone', 'support_email', 'voucher_prefix', 'session_cleanup_interval'];
  const settings = {};
  keys.forEach(k => { const el = document.getElementById('setting_' + k); if (el) settings[k] = el.value; });
  try { await api('/api/settings', 'PUT', { settings }); toast('Settings saved', 'success'); }
  catch(e) { toast(e.message, 'error'); }
}

async function changePass() {
  try {
    await api('/api/auth/password', 'PUT', { current_password: document.getElementById('curPass').value, new_password: document.getElementById('newPass').value });
    toast('Password updated', 'success');
    document.getElementById('curPass').value = '';
    document.getElementById('newPass').value = '';
  } catch(e) { toast(e.message, 'error'); }
}

// ====== PAGINATION ======
function renderPagination(containerId, total, limit, page, onPage) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }
  document.getElementById(containerId).innerHTML =
    `<button onclick="(${onPage.toString()})(${page-1})" ${page<=1?'disabled':''}>Prev</button>` +
    `<span>Page ${page} of ${pages} &bull; ${total} total</span>` +
    `<button onclick="(${onPage.toString()})(${page+1})" ${page>=pages?'disabled':''}>Next</button>`;
}
