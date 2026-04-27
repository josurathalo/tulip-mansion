// staff.js - Main Staff Dashboard logic for all 7 modules
const user = Auth.requireAuth(['Staff', 'Admin']);
if (user) document.getElementById('welcomeMsg').textContent = `HELLO, ${user.name.toUpperCase()}`;

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// === Navigation ===
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('[id^=page-]').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + b.dataset.page).classList.remove('hidden');
  const loaders = { home: loadHome, rooms: loadRooms, lease: loadLeases, meter: loadMeters, maint: loadMaint, rates: loadRatesPage, bills: loadBillsPage, reports: loadReportsPage, settings: loadSettings };
  if (loaders[b.dataset.page]) loaders[b.dataset.page]();
}));

// =====================================================================
// 1. HOME DASHBOARD
// =====================================================================
async function loadHome() {
  try {
    const stats = await api('/api/rooms/stats');
    document.getElementById('statUnpaid').textContent = stats.unpaid;
    document.getElementById('statPaid').textContent = stats.paid;
    document.getElementById('statMaint').textContent = stats.pendingMaintenance;
    drawDonut(stats.available, stats.renovating, stats.occupied, stats.total);
    drawRevenueChart(stats.revenue || []);
  } catch (e) { toast(e.message, 'error'); }
}

function drawDonut(avail, reno, occ, total) {
  const svg = document.getElementById('donutChart');
  if (!svg || total === 0) {
    svg.innerHTML = '<text x="50" y="50" text-anchor="middle" font-size="6">ไม่มีข้อมูล</text>';
    return;
  }
  const r = 35, cx = 50, cy = 50;
  const colors = ['#10b981', '#f59e0b', '#ef4444'];
  const data = [
    { v: avail, label: 'ห้องว่าง' },
    { v: reno, label: 'อยู่ระหว่างการปรับปรุง' },
    { v: occ, label: 'มีผู้พักอาศัย' }
  ];
  let cum = 0;
  let paths = '';
  data.forEach((d, i) => {
    if (d.v === 0) return;
    const sa = (cum / total) * 2 * Math.PI - Math.PI / 2;
    cum += d.v;
    const ea = (cum / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    const large = (ea - sa) > Math.PI ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${colors[i]}" />`;
  });
  paths += `<circle cx="${cx}" cy="${cy}" r="22" fill="white" />`;
  svg.innerHTML = paths;

  document.getElementById('donutLegend').innerHTML = data.map((d, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px">
      <span style="width:12px;height:12px;border-radius:50%;background:${colors[i]}"></span>
      <span>${d.label}</span>
      <strong>${d.v}</strong>
    </div>
  `).join('') + `<div style="margin-top:8px;font-size:11px;color:#6b7280">ห้องพักทั้งหมด ${total} ห้อง</div>`;
}

function drawRevenueChart(rev) {
  const svg = document.getElementById('revenueChart');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const data = months.map((_, i) => {
    const m = rev.find(r => parseInt(r.month) === i + 1);
    return m ? m.total : 0;
  });
  const max = Math.max(10, ...data);
  const w = 600, h = 250, pad = 40;
  let pts = data.map((v, i) => `${pad + (i * (w - 2*pad)/11)},${h - pad - (v / max) * (h - 2*pad)}`).join(' ');
  let html = '';
  // Y axis lines
  for (let i = 0; i <= 4; i++) {
    const y = pad + i * (h - 2*pad) / 4;
    html += `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="#e5e7eb" />`;
    html += `<text x="${pad-5}" y="${y+4}" font-size="10" fill="#6b7280" text-anchor="end">${Math.round(max - max*i/4).toLocaleString()}</text>`;
  }
  // X axis
  months.forEach((m, i) => {
    const x = pad + i * (w - 2*pad) / 11;
    html += `<text x="${x}" y="${h-pad+15}" font-size="10" fill="#6b7280" text-anchor="middle">${m}</text>`;
  });
  // Polyline
  html += `<polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="2.5" />`;
  data.forEach((v, i) => {
    const x = pad + i * (w - 2*pad) / 11;
    const y = h - pad - (v / max) * (h - 2*pad);
    html += `<circle cx="${x}" cy="${y}" r="4" fill="#6366f1" />`;
  });
  svg.innerHTML = html;
}

// =====================================================================
// 2. ROOM MANAGEMENT
// =====================================================================
let allRooms = [];
async function loadRooms() {
  try {
    allRooms = await api('/api/rooms');
    const stats = await api('/api/rooms/stats');
    document.getElementById('rmTotal').textContent = stats.total;
    document.getElementById('rmAvail').textContent = stats.available;
    document.getElementById('rmUnpaid').textContent = stats.unpaid;
    const tbody = document.getElementById('roomsTable');
    tbody.innerHTML = allRooms.map(r => `
      <tr>
        <td>
          <strong>${r.room_no}</strong>
          <span class="badge badge-${r.status === 'ว่าง' ? 'available' : r.status === 'ปรับปรุง' ? 'renovating' : 'occupied'}">${r.status}</span>
        </td>
        <td>${r.resident_name ? escapeHtml(r.resident_name) : '-'}</td>
        <td>${fmt(r.price)}</td>
        <td>${r.lease_end ? fmtDate(r.lease_end) : '-'}</td>
        <td>${r.unpaid_count > 0 ? `<span style="color:#ef4444">⏰ ${r.unpaid_count} บิล</span>` : '-'}</td>
        <td>
          <button class="btn btn-sm" onclick="openLeaseRoom(${r.id})">📝 สัญญา</button>
          <button class="btn btn-sm" onclick="editRoom(${r.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteRoom(${r.id})">🗑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function openAddRoom() {
  showModal(`
    <div class="modal-header"><h2 class="modal-title">เพิ่มห้องพักใหม่</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <form id="addRoomForm">
      <div class="form-row">
        <div class="form-group"><label>เลขห้อง <span class="required">*</span></label><input type="text" id="rRoomNo" required></div>
        <div class="form-group"><label>ชั้น <span class="required">*</span></label><input type="number" id="rFloor" min="1" required></div>
      </div>
      <div class="form-group"><label>ประเภทห้อง <span class="required">*</span></label>
        <select id="rType"><option>Standard</option><option>Deluxe</option><option>Suite</option></select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>ราคา (บาท) <span class="required">*</span></label><input type="number" id="rPrice" min="1" step="0.01" required></div>
        <div class="form-group"><label>สถานะ</label>
          <select id="rStatus"><option>ว่าง</option><option>ไม่ว่าง</option><option>ปรับปรุง</option></select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
        <button type="submit" class="btn btn-success">💾 Save</button>
      </div>
    </form>
  `);
  document.getElementById('addRoomForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          room_no: document.getElementById('rRoomNo').value.trim(),
          floor: +document.getElementById('rFloor').value,
          room_type: document.getElementById('rType').value,
          price: +document.getElementById('rPrice').value,
          status: document.getElementById('rStatus').value
        })
      });
      toast('เพิ่มห้องสำเร็จ');
      closeModal(); loadRooms();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function editRoom(id) {
  try {
    const r = await api(`/api/rooms/${id}`);
    showModal(`
      <div class="modal-header"><h2 class="modal-title">แก้ไขห้องพัก</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <form id="editRoomForm">
        <div class="form-row">
          <div class="form-group"><label>เลขห้อง</label><input type="text" id="rRoomNo" value="${r.room_no}" required></div>
          <div class="form-group"><label>ชั้น</label><input type="number" id="rFloor" value="${r.floor}" required></div>
        </div>
        <div class="form-group"><label>ประเภทห้อง</label>
          <select id="rType">
            <option ${r.room_type === 'Standard' ? 'selected' : ''}>Standard</option>
            <option ${r.room_type === 'Deluxe' ? 'selected' : ''}>Deluxe</option>
            <option ${r.room_type === 'Suite' ? 'selected' : ''}>Suite</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group"><label>ราคา</label><input type="number" id="rPrice" value="${r.price}" min="1" step="0.01" required></div>
          <div class="form-group"><label>สถานะ</label>
            <select id="rStatus">
              <option ${r.status === 'ว่าง' ? 'selected' : ''}>ว่าง</option>
              <option ${r.status === 'ไม่ว่าง' ? 'selected' : ''}>ไม่ว่าง</option>
              <option ${r.status === 'ปรับปรุง' ? 'selected' : ''}>ปรับปรุง</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
          <button type="submit" class="btn btn-success">💾 Save</button>
        </div>
      </form>
    `);
    document.getElementById('editRoomForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api(`/api/rooms/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            room_no: document.getElementById('rRoomNo').value.trim(),
            floor: +document.getElementById('rFloor').value,
            room_type: document.getElementById('rType').value,
            price: +document.getElementById('rPrice').value,
            status: document.getElementById('rStatus').value
          })
        });
        toast('อัปเดตสำเร็จ');
        closeModal(); loadRooms();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteRoom(id) {
  if (!await confirmDialog('ลบห้องนี้?')) return;
  try { await api(`/api/rooms/${id}`, { method: 'DELETE' }); toast('ลบสำเร็จ'); loadRooms(); }
  catch (e) { toast(e.message, 'error'); }
}

// =====================================================================
// 3. LEASE & AGREEMENT
// =====================================================================
async function loadLeases() {
  try {
    const list = await api('/api/leases');
    const tbody = document.getElementById('leaseTable');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#9ca3af">ยังไม่มีสัญญา</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(l => {
      const expiring = (new Date(l.end_date) - new Date()) / (1000*60*60*24) < 30;
      return `
        <tr ${expiring ? 'style="background:#fef3c7"' : ''}>
          <td><strong>${l.room_no}</strong></td>
          <td>${escapeHtml(l.resident_name)}</td>
          <td>${fmtDate(l.start_date)}</td>
          <td>${fmtDate(l.end_date)} ${expiring ? '⚠️' : ''}</td>
          <td>${fmt(l.rent_price)}</td>
          <td>${fmt(l.deposit)}</td>
          <td><button class="btn btn-sm" onclick="openLeaseRoom(${l.room_id})">รายละเอียด</button></td>
        </tr>
      `;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function openLeaseRoom(roomId) {
  try {
    const room = await api(`/api/rooms/${roomId}`);
    const lease = await api(`/api/leases/by-room/${roomId}`);
    if (lease) showLeaseDetail(room, lease);
    else showLeaseForm(room, null);
  } catch (e) { toast(e.message, 'error'); }
}

function showLeaseDetail(room, lease) {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">ห้อง ${room.room_no} <span class="badge badge-occupied">${room.status}</span> รายละเอียดสัญญาการเช่า</h2>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="form-row">
      <div style="flex:1">
        <div class="form-group"><label>รายชื่อผู้พักอาศัย</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${escapeHtml(lease.resident_name)}</div></div>
        <div class="form-row">
          <div class="form-group"><label>วันที่จัดทำสัญญา</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${fmtDate(lease.start_date)}</div></div>
          <div class="form-group"><label>วันที่สิ้นสุดสัญญา</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${fmtDate(lease.end_date)}</div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>ค่าเช่า/เดือน</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${fmt(lease.rent_price)}</div></div>
          <div class="form-group"><label>ระยะเวลา (ปี)</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${lease.duration_years}</div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>เงินมัดจำ</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${fmt(lease.deposit)}</div></div>
          <div class="form-group"><label>ช่องทางชำระมัดจำ</label><div style="padding:9px 12px;background:#f9fafb;border-radius:8px">${lease.payment_method}</div></div>
        </div>
      </div>
      <div style="flex:1">
        ${lease.contract_image ? `<img src="${lease.contract_image}" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb">` : '<div style="padding:60px;text-align:center;background:#f9fafb;border-radius:8px;color:#9ca3af">ไม่มีรูป</div>'}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="showLeaseForm(${JSON.stringify(room).replace(/"/g,'&quot;')}, ${JSON.stringify(lease).replace(/"/g,'&quot;')})">📝 แก้ไข</button>
    </div>
  `, true);
}

function showLeaseForm(room, lease) {
  closeModal();
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">ห้อง ${room.room_no} - ${lease ? 'แก้ไข' : 'สร้าง'}สัญญาเช่า</h2>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <form id="leaseForm" enctype="multipart/form-data">
      <div class="form-row">
        <div style="flex:1">
          <div class="form-group">
            <label>รายชื่อผู้พักอาศัย <span class="required">*</span></label>
            <input type="text" id="lResName" value="${lease ? escapeHtml(lease.resident_name) : ''}" required>
          </div>
          <div class="form-row">
            <div class="form-group"><label>วันที่จัดทำสัญญา <span class="required">*</span></label>
              <input type="date" id="lStart" value="${lease ? lease.start_date : todayStr()}" max="${todayStr()}" required>
            </div>
            <div class="form-group"><label>วันที่สิ้นสุดสัญญา <span class="required">*</span></label>
              <input type="date" id="lEnd" value="${lease ? lease.end_date : ''}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>ค่าเช่า/เดือน <span class="required">*</span></label>
              <div class="input-group"><input type="number" id="lRent" value="${lease ? lease.rent_price : room.price}" min="1" step="0.01" required><span class="input-suffix">บาท</span></div>
            </div>
            <div class="form-group"><label>ระยะเวลา (ปี) <span class="required">*</span></label>
              <input type="number" id="lYears" value="${lease ? lease.duration_years : 1}" min="1" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>เงินมัดจำ <span class="required">*</span></label>
              <div class="input-group"><input type="number" id="lDeposit" value="${lease ? lease.deposit : room.price}" min="1" step="0.01" required><span class="input-suffix">บาท</span></div>
              <div class="help-text">ต้องเท่ากับ 1 เท่าของค่าเช่า</div>
            </div>
            <div class="form-group"><label>ช่องทางชำระมัดจำ <span class="required">*</span></label>
              <select id="lPayMethod" required>
                <option value="">-- เลือก --</option>
                <option ${lease && lease.payment_method === 'เงินสด' ? 'selected' : ''}>เงินสด</option>
                <option ${lease && lease.payment_method === 'Debit/Credit Card' ? 'selected' : ''}>Debit/Credit Card</option>
                <option ${lease && lease.payment_method === 'โอนผ่านบัญชี' ? 'selected' : ''}>โอนผ่านบัญชี</option>
              </select>
            </div>
          </div>
        </div>
        <div style="flex:1">
          <div class="form-group">
            <label>สัญญาเช่า (รูปภาพ) ${lease ? '' : '<span class="required">*</span>'}</label>
            <div class="file-upload" onclick="document.getElementById('lContract').click()">
              <input type="file" id="lContract" accept="image/*" ${lease ? '' : 'required'}>
              <div>📤 อัปโหลดสัญญา</div>
              ${lease && lease.contract_image ? `<img src="${lease.contract_image}" class="file-preview">` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
        <button type="submit" class="btn btn-success">💾 ${lease ? 'Save' : 'New Resident'}</button>
      </div>
    </form>
  `, true);

  // Auto-calc end date from years
  const yearsInput = document.getElementById('lYears');
  const startInput = document.getElementById('lStart');
  const endInput = document.getElementById('lEnd');
  function recalcEnd() {
    if (startInput.value && yearsInput.value) {
      const d = new Date(startInput.value);
      d.setFullYear(d.getFullYear() + +yearsInput.value);
      endInput.value = d.toISOString().slice(0,10);
    }
  }
  if (!lease) {
    startInput.addEventListener('change', recalcEnd);
    yearsInput.addEventListener('change', recalcEnd);
    recalcEnd();
  }

  document.getElementById('leaseForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('room_id', room.id);
    fd.append('resident_name', document.getElementById('lResName').value);
    fd.append('start_date', document.getElementById('lStart').value);
    fd.append('end_date', document.getElementById('lEnd').value);
    fd.append('rent_price', document.getElementById('lRent').value);
    fd.append('duration_years', document.getElementById('lYears').value);
    fd.append('deposit', document.getElementById('lDeposit').value);
    fd.append('payment_method', document.getElementById('lPayMethod').value);
    const f = document.getElementById('lContract').files[0];
    if (f) fd.append('contract_image', f);
    try {
      await api(lease ? `/api/leases/${lease.id}` : '/api/leases', { method: lease ? 'PUT' : 'POST', body: fd });
      toast('สำเร็จ'); closeModal(); loadLeases(); loadRooms();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// =====================================================================
// 4. METER RECORDING
// =====================================================================
async function loadMeters() {
  try {
    const list = await api('/api/meters');
    const grid = document.getElementById('meterGrid');
    if (list.length === 0) {
      grid.innerHTML = '<div style="padding:40px;color:#9ca3af;grid-column:1/-1;text-align:center">ยังไม่มีรายการจดมิเตอร์</div>';
      return;
    }
    grid.innerHTML = list.map(m => `
      <div class="meter-card">
        <button class="delete-btn" onclick="deleteMeter(${m.id}, event)">×</button>
        <div class="date">วันที่ลอด : ${fmtDate(m.record_date)}</div>
        <div class="icons">
          <div class="meter-icon ${m.meter_type === 'electric' ? 'electric' : ''}" onclick="viewMeter(${m.id})">
            ${m.meter_type === 'water' ? '💧' : '⚡'}
          </div>
          <div style="display:flex;align-items:center;font-weight:600">${m.meter_type === 'water' ? 'น้ำ' : 'ไฟฟ้า'}</div>
        </div>
        <div style="margin-top:10px;font-size:11px;color:#6b7280">${m.room_count} ห้อง / ${m.total_units || 0} หน่วย</div>
      </div>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function openCreateMeter() {
  showModal(`
    <div class="modal-header"><h2 class="modal-title">สร้างใบจดมิเตอร์</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <p>เลือกวันที่ทำการจดบันทึกมิเตอร์</p>
    <div class="form-group">
      <input type="date" id="meterDate" value="${todayStr()}" max="${todayStr()}" required>
    </div>
    <p>เลือกเพื่อทำการบันทึกข้อมูลมิเตอร์</p>
    <div style="display:flex;gap:12px;margin-top:12px">
      <button class="btn" style="flex:1;padding:24px;flex-direction:column" onclick="openMeterForm('water')">💧<br>มิเตอร์น้ำ</button>
      <button class="btn" style="flex:1;padding:24px;flex-direction:column" onclick="openMeterForm('electric')">⚡<br>มิเตอร์ไฟฟ้า</button>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
    </div>
  `);
}

async function openMeterForm(type) {
  const date = document.getElementById('meterDate').value;
  if (!date) return toast('กรุณาเลือกวันที่', 'error');
  try {
    const rooms = await api(`/api/meters/last-readings/${type}`);
    const rates = await api('/api/rates');
    const rateName = type === 'water' ? 'ค่าน้ำ' : 'ค่าไฟฟ้า';
    const rateRow = rates.find(r => r.service_name === rateName && r.is_metered);
    const ratePerUnit = rateRow ? +rateRow.rate : 0;

    closeModal();
    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">${type === 'water' ? '💧 มิเตอร์ค่าน้ำ' : '⚡ มิเตอร์ค่าไฟ'} <span style="font-size:13px;color:#6b7280;font-weight:400">(${ratePerUnit} บาท/หน่วย)</span></h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="meterForm">
        <table>
          <thead><tr><th>ห้อง</th><th>สถานะห้อง</th><th>จดครั้งล่าสุด</th><th>จดครั้งปัจจุบัน</th><th>หน่วย</th><th>ค่าใช้จ่าย (บาท)</th></tr></thead>
          <tbody>
            ${rooms.map((r, i) => `
              <tr>
                <td>${r.room_no}</td>
                <td><span class="badge badge-${r.status === 'ว่าง' ? 'available' : r.status === 'ปรับปรุง' ? 'renovating' : 'occupied'}">${r.status}</span></td>
                <td><input type="number" name="prev_${i}" value="${r.last_reading}" data-rid="${r.room_id}" min="0" step="0.01" style="width:120px"></td>
                <td><input type="number" name="curr_${i}" min="0" step="0.01" style="width:120px" oninput="calcUnit(${i})"></td>
                <td id="unit_${i}" style="font-weight:600">0</td>
                <td id="cost_${i}" style="font-weight:700;color:#059669">0.00</td>
              </tr>
            `).join('')}
            <tr style="background:#f9fafb;font-weight:700">
              <td colspan="4" style="text-align:right">รวมทั้งหมด</td>
              <td id="totalUnits">0</td>
              <td id="totalCost" style="color:#059669">0.00</td>
            </tr>
          </tbody>
        </table>
        <input type="hidden" id="meterCount" value="${rooms.length}">
        <input type="hidden" id="meterRate" value="${ratePerUnit}">
        <div class="modal-actions">
          <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
          <button type="submit" class="btn btn-success">💾 Save</button>
        </div>
      </form>
    `, true);

    window.calcUnit = (i) => {
      const rate = +document.getElementById('meterRate').value || 0;
      const prev = +document.querySelector(`input[name=prev_${i}]`).value || 0;
      const currInput = document.querySelector(`input[name=curr_${i}]`);
      const curr = +currInput.value || 0;
      const unitEl = document.getElementById(`unit_${i}`);
      const costEl = document.getElementById(`cost_${i}`);
      const isInvalid = currInput.value !== '' && curr < prev;

      if (isInvalid) {
        // DVC: ค่ามิเตอร์ปัจจุบันต้องไม่น้อยกว่าครั้งก่อน
        unitEl.innerHTML = '<span style="color:#ef4444;font-weight:700">⚠️ Invalid</span>';
        costEl.innerHTML = '<span style="color:#ef4444">—</span>';
        currInput.style.borderColor = '#ef4444';
        currInput.style.background = '#fee2e2';
        currInput.dataset.invalid = '1';
      } else {
        const units = curr - prev;
        unitEl.textContent = units.toFixed(2);
        unitEl.style.color = '';
        costEl.textContent = (units * rate).toFixed(2);
        costEl.style.color = '#059669';
        currInput.style.borderColor = '';
        currInput.style.background = '';
        currInput.dataset.invalid = '';
      }

      // Recalc totals (skip invalid rows)
      const count = +document.getElementById('meterCount').value;
      let totalU = 0, totalC = 0;
      for (let k = 0; k < count; k++) {
        const p = +document.querySelector(`input[name=prev_${k}]`).value || 0;
        const cInp = document.querySelector(`input[name=curr_${k}]`);
        const c = +cInp.value || 0;
        if (cInp.value !== '' && c >= p) {
          totalU += (c - p);
          totalC += (c - p) * rate;
        }
      }
      document.getElementById('totalUnits').textContent = totalU.toFixed(2);
      document.getElementById('totalCost').textContent = totalC.toFixed(2);

      // Outlier check (ค่ามิเตอร์เกินปกติ)
      if (!isInvalid && curr > 0 && (curr - prev) > 100) {
        toast('⚠️ ค่ามิเตอร์สูงผิดปกติ กรุณาตรวจสอบอีกครั้ง', 'warning');
      }
    };

    document.getElementById('meterForm').addEventListener('submit', async e => {
      e.preventDefault();
      const count = +document.getElementById('meterCount').value;
      const details = [];
      const invalidRooms = [];
      for (let i = 0; i < count; i++) {
        const prevEl = document.querySelector(`input[name=prev_${i}]`);
        const currEl = document.querySelector(`input[name=curr_${i}]`);
        const room_no = rooms[i].room_no;
        const room_id = +prevEl.dataset.rid;
        const previous_reading = +prevEl.value || 0;
        const current_reading = currEl.value === '' ? null : +currEl.value;
        if (current_reading !== null && current_reading < previous_reading) {
          invalidRooms.push(`ห้อง ${room_no} (${current_reading} < ${previous_reading})`);
          currEl.style.borderColor = '#ef4444';
          currEl.style.background = '#fee2e2';
          continue;
        }
        details.push({ room_id, room_no, previous_reading, current_reading });
      }
      if (invalidRooms.length > 0) {
        return toast(`❌ ค่ามิเตอร์ปัจจุบันต้องไม่น้อยกว่าครั้งก่อน:\n${invalidRooms.join(', ')}`, 'error');
      }
      const filledRooms = details.filter(d => d.current_reading !== null && d.current_reading > 0);
      if (filledRooms.length === 0) {
        return toast('กรุณากรอกค่ามิเตอร์อย่างน้อย 1 ห้อง', 'error');
      }
      try {
        await api('/api/meters', {
          method: 'POST',
          body: JSON.stringify({ record_date: date, meter_type: type, details })
        });
        toast('บันทึกสำเร็จ'); closeModal(); loadMeters();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function viewMeter(id) {
  try {
    const m = await api(`/api/meters/${id}`);
    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">${m.meter_type === 'water' ? '💧 มิเตอร์น้ำ' : '⚡ มิเตอร์ไฟฟ้า'} - ${fmtDate(m.record_date)}</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <table>
        <thead><tr><th>ห้อง</th><th>สถานะ</th><th>ครั้งล่าสุด</th><th>ปัจจุบัน</th><th>หน่วย</th></tr></thead>
        <tbody>
          ${m.details.map(d => `
            <tr><td>${d.room_no}</td><td>${d.room_status}</td>
              <td>${d.previous_reading}</td><td>${d.current_reading}</td><td><strong>${d.units_used}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `, true);
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteMeter(id, evt) {
  evt.stopPropagation();
  if (!await confirmDialog('ลบรายการมิเตอร์นี้?')) return;
  try { await api(`/api/meters/${id}`, { method: 'DELETE' }); toast('ลบสำเร็จ'); loadMeters(); }
  catch (e) { toast(e.message, 'error'); }
}

// =====================================================================
// 5. MAINTENANCE
// =====================================================================
let maintTab = 'รอดำเนินการ';
function switchMaintTab(s) {
  maintTab = s;
  document.getElementById('tabPending').classList.toggle('active', s === 'รอดำเนินการ');
  document.getElementById('tabDone').classList.toggle('active', s === 'ดำเนินการเสร็จสิ้น');
  loadMaint();
}
async function loadMaint() {
  try {
    const list = await api('/api/maintenance?status=' + encodeURIComponent(maintTab));
    const tbody = document.getElementById('maintTable');
    if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">ไม่มีรายการ</td></tr>'; return; }
    tbody.innerHTML = list.map(m => `
      <tr>
        <td>${fmtDate(m.report_date)}</td>
        <td>${fmtDate(m.appointment_date)}</td>
        <td>${m.room_no}</td>
        <td><span class="badge badge-${m.status === 'รอดำเนินการ' ? 'pending' : 'done'}">${m.status}</span></td>
        <td>${escapeHtml(m.details)}</td>
        <td>
          <button class="btn btn-sm" onclick="viewMaint(${m.id})">${m.status === 'รอดำเนินการ' ? 'แก้ไข' : 'ดู'}</button>
          ${m.status === 'รอดำเนินการ' ? `<button class="btn btn-sm btn-success" onclick="completeMaint(${m.id})">✅ เสร็จ</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function viewMaint(id) {
  try {
    const m = await api(`/api/maintenance/${id}`);
    const isPending = m.status === 'รอดำเนินการ';
    const rooms = await api('/api/rooms');
    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">รายละเอียดการซ่อม <span class="badge badge-${isPending ? 'pending' : 'done'}">${m.status}</span></h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="maintForm" enctype="multipart/form-data">
        <div class="form-group">
          <label>ห้อง <span class="required">*</span></label>
          <select id="mRoom" required ${!isPending ? 'disabled' : ''}>
            ${rooms.map(r => `<option value="${r.id}" ${r.id === m.room_id ? 'selected' : ''}>${r.room_no}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group"><label>วันแจ้งซ่อม</label><input type="date" id="mReport" value="${m.report_date}" ${!isPending ? 'disabled' : ''} required></div>
          <div class="form-group"><label>วันนัดซ่อม</label><input type="date" id="mAppt" value="${m.appointment_date || ''}" ${!isPending ? 'disabled' : ''}></div>
        </div>
        <div class="form-group"><label>รายละเอียด <span class="required">*</span></label>
          <textarea id="mDetails" rows="3" ${!isPending ? 'disabled' : ''} required>${escapeHtml(m.details)}</textarea>
        </div>
        <div class="form-group">
          <label>รูปภาพ</label>
          <input type="file" id="mImage" accept="image/*" ${!isPending ? 'disabled' : ''}>
          ${m.image ? `<img src="${m.image}" class="file-preview">` : ''}
        </div>
        ${m.status === 'ดำเนินการเสร็จสิ้น' ? `
          <div style="padding:14px;background:#d1fae5;border-radius:8px">
            <strong>การซ่อม:</strong><br>
            วันที่ซ่อมเสร็จ: ${fmtDate(m.completed_date)}<br>
            ค่าใช้จ่าย: ${fmt(m.cost)} บาท<br>
            หมายเหตุ: ${escapeHtml(m.repair_notes || '-')}
          </div>
        ` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
          ${isPending ? '<button type="submit" class="btn btn-success">💾 บันทึกการแก้ไข</button>' : ''}
        </div>
      </form>
    `, true);
    if (isPending) {
      document.getElementById('maintForm').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('room_id', document.getElementById('mRoom').value);
        fd.append('report_date', document.getElementById('mReport').value);
        fd.append('appointment_date', document.getElementById('mAppt').value);
        fd.append('details', document.getElementById('mDetails').value);
        const f = document.getElementById('mImage').files[0];
        if (f) fd.append('image', f);
        try {
          await api(`/api/maintenance/${id}`, { method: 'PUT', body: fd });
          toast('สำเร็จ'); closeModal(); loadMaint();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  } catch (e) { toast(e.message, 'error'); }
}

function completeMaint(id) {
  showModal(`
    <div class="modal-header"><h2 class="modal-title">บันทึกการซ่อม</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <form id="completeForm">
      <div class="form-group"><label>วันที่ซ่อมเสร็จ <span class="required">*</span></label>
        <input type="date" id="cDate" value="${todayStr()}" max="${todayStr()}" required>
      </div>
      <div class="form-group"><label>ค่าใช้จ่ายทั้งหมด <span class="required">*</span></label>
        <div class="input-group"><input type="number" id="cCost" min="0" step="0.01" required><span class="input-suffix">บาท</span></div>
      </div>
      <div class="form-group"><label>รายละเอียดการซ่อม <span class="required">*</span></label>
        <textarea id="cNotes" rows="3" required></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
        <button type="submit" class="btn btn-success">💾 Save</button>
      </div>
    </form>
  `);
  document.getElementById('completeForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api(`/api/maintenance/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          completed_date: document.getElementById('cDate').value,
          cost: +document.getElementById('cCost').value,
          repair_notes: document.getElementById('cNotes').value
        })
      });
      toast('บันทึกสำเร็จ'); closeModal(); loadMaint();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// =====================================================================
// 6. PAYMENT & BILLS
// =====================================================================
function loadRatesPage() { loadRates(); }
function loadBillsPage() {
  switchBillTab('create');
  refreshPendingBadge();
}
function switchBillTab(t) {
  ['pending', 'create', 'unpaid', 'paid'].forEach(x =>
    document.getElementById('billsTab-' + x).classList.toggle('hidden', x !== t)
  );
  if (t === 'create') loadAllInvoices();
  else if (t === 'unpaid') loadUnpaidInvoices();
  else if (t === 'paid') loadPaidInvoices();
  else if (t === 'pending') loadPendingInvoices();
}

async function refreshPendingBadge() {
  try {
    const list = await api('/api/invoices?status=' + encodeURIComponent('รอตรวจสอบ'));
    const el = document.getElementById('pendingCount');
    if (!el) return;
    if (list.length > 0) { el.textContent = list.length; el.style.display = 'inline-block'; }
    else el.style.display = 'none';
  } catch {}
}

async function loadPendingInvoices() {
  try {
    const list = await api('/api/invoices?status=' + encodeURIComponent('รอตรวจสอบ'));
    document.getElementById('pendingTable').innerHTML = list.length ? list.map(b => `
      <tr>
        <td>${b.invoice_no}</td>
        <td>${fmtDate(b.payment_date)}</td>
        <td>${b.room_no}</td>
        <td><strong>${fmt(b.paid_amount)}</strong> / ${fmt(b.total_amount)}</td>
        <td>${b.payment_method || '-'}</td>
        <td><button class="btn btn-sm btn-primary" onclick="viewInvoice(${b.id})">ตรวจสอบ</button></td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">ไม่มีรายการรอตรวจสอบ</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

async function verifyPayment(id) {
  if (!await confirmDialog('ยืนยันการชำระเงินสำหรับบิลนี้?')) return;
  try {
    await api(`/api/invoices/${id}/verify`, { method: 'POST', body: JSON.stringify({}) });
    toast('ยืนยันการชำระเงินสำเร็จ ✅');
    closeModal();
    loadPendingInvoices();
    refreshPendingBadge();
  } catch (e) { toast(e.message, 'error'); }
}

async function rejectPayment(id) {
  if (!await confirmDialog('ปฏิเสธการชำระและคืนสถานะเป็นค้างชำระ?')) return;
  try {
    await api(`/api/invoices/${id}/reject`, { method: 'POST', body: JSON.stringify({}) });
    toast('ปฏิเสธสำเร็จ');
    closeModal();
    loadPendingInvoices();
    refreshPendingBadge();
  } catch (e) { toast(e.message, 'error'); }
}

function showPendingInvoice(inv) {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">ตรวจสอบการชำระ ${inv.invoice_no} <span class="badge badge-pending">รอตรวจสอบ</span></h2>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <h3 style="margin-bottom:12px">📄 ข้อมูลบิล</h3>
        <div style="padding:14px;background:#f9fafb;border-radius:8px;font-size:13px">
          <div>เลขที่: <strong>${inv.invoice_no}</strong></div>
          <div>ห้อง: <strong>${inv.room_no}</strong></div>
          <div>ยอดที่ต้องชำระ: <strong>${fmt(inv.total_amount)}</strong> บาท</div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb">
            <div>ยอดที่ผู้พักโอนมา: <strong style="color:${+inv.paid_amount === +inv.total_amount ? '#10b981' : '#ef4444'}">${fmt(inv.paid_amount)}</strong> บาท</div>
            <div>ช่องทาง: ${inv.payment_method || '-'}</div>
            <div>วันที่โอน: ${fmtDate(inv.payment_date)}</div>
          </div>
          ${+inv.paid_amount !== +inv.total_amount ? `<div style="margin-top:8px;color:#ef4444;font-size:12px">⚠️ ยอดไม่ตรงกับใบแจ้งหนี้ (${fmt(Math.abs(inv.total_amount - inv.paid_amount))} บาท)</div>` : ''}
        </div>
        <h4 style="margin-top:14px">รายการในบิล</h4>
        <table style="font-size:12px"><tbody>
          ${inv.items.map(it => `<tr><td>${escapeHtml(it.service_name)}</td><td style="text-align:right">${fmt(it.amount)}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div>
        <h3 style="margin-bottom:12px">📸 หลักฐานการชำระ</h3>
        ${inv.payment_proof ? `<a href="${inv.payment_proof}" target="_blank"><img src="${inv.payment_proof}" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;max-height:400px;object-fit:contain;background:#f9fafb"></a>` : '<div style="padding:60px;text-align:center;background:#f9fafb;border-radius:8px;color:#9ca3af">ไม่มีหลักฐาน</div>'}
        <p style="font-size:11px;color:#6b7280;margin-top:6px">คลิกที่รูปเพื่อขยาย</p>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" onclick="closeModal()">⊘ ปิด</button>
      <button class="btn btn-danger" onclick="rejectPayment(${inv.id})">❌ ปฏิเสธ</button>
      <button class="btn btn-success" onclick="verifyPayment(${inv.id})">✅ ยืนยันการชำระ</button>
    </div>
  `, true);
}

async function loadRates() {
  try {
    const list = await api('/api/rates');
    const tbody = document.getElementById('ratesTable');
    tbody.innerHTML = list.map(r => `
      <tr>
        <td>${escapeHtml(r.service_name)}</td>
        <td>${r.is_metered ? '✓ มิเตอร์' : 'รายการ'}</td>
        <td>${fmt(r.rate)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteRate(${r.id})">🗑</button></td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}
document.getElementById('rateForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/api/rates', {
      method: 'POST',
      body: JSON.stringify({
        service_name: document.getElementById('rateName').value.trim(),
        rate: +document.getElementById('rateValue').value,
        is_metered: document.getElementById('rateMetered').checked
      })
    });
    toast('เพิ่มสำเร็จ');
    e.target.reset();
    loadRates();
  } catch (err) { toast(err.message, 'error'); }
});

async function deleteRate(id) {
  if (!await confirmDialog('ลบอัตราค่าบริการนี้?')) return;
  try { await api(`/api/rates/${id}`, { method: 'DELETE' }); toast('ลบสำเร็จ'); loadRates(); }
  catch (e) { toast(e.message, 'error'); }
}

async function loadAllInvoices() {
  try {
    const list = await api('/api/invoices');
    document.getElementById('allBillsTable').innerHTML = list.length ? list.map(b => `
      <tr>
        <td>${b.invoice_no}</td>
        <td>${fmtDate(b.invoice_date)}</td>
        <td><span class="badge badge-${b.status === 'ชำระแล้ว' ? 'paid' : 'unpaid'}">${b.status}</span></td>
        <td>${b.room_no}</td>
        <td>${fmt(b.total_amount)}</td>
        <td><span class="badge badge-${b.type === 'รายเดือน' ? 'staff' : 'admin'}">${b.type}</span></td>
        <td><button class="btn btn-sm" onclick="viewInvoice(${b.id})">รายละเอียด</button></td>
      </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#9ca3af">ไม่มีรายการ</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}
async function loadUnpaidInvoices() {
  try {
    const list = await api('/api/invoices?status=' + encodeURIComponent('ค้างชำระ'));
    document.getElementById('unpaidTable').innerHTML = list.length ? list.map(b => `
      <tr>
        <td>${b.invoice_no}</td><td>${fmtDate(b.invoice_date)}</td><td>${b.room_no}</td><td>${fmt(b.total_amount)}</td>
        <td><button class="btn btn-sm btn-success" onclick="viewInvoice(${b.id})">รับชำระ</button></td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af">ไม่มี</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}
async function loadPaidInvoices() {
  try {
    const list = await api('/api/invoices?status=' + encodeURIComponent('ชำระแล้ว'));
    document.getElementById('paidTable').innerHTML = list.length ? list.map(b => `
      <tr>
        <td>${b.invoice_no}</td><td>${fmtDate(b.invoice_date)}</td><td>${b.room_no}</td><td>${fmt(b.total_amount)}</td>
        <td><button class="btn btn-sm" onclick="viewInvoice(${b.id})">รายละเอียด</button></td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;padding:30px;color:#9ca3af">ไม่มี</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

async function openCreateBill() {
  const rooms = await api('/api/rooms');
  const rates = await api('/api/rates');
  showModal(`
    <div class="modal-header"><h2 class="modal-title">สร้างใบแจ้งหนี้ทั่วไป</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <form id="createBillForm">
      <div class="form-row">
        <div class="form-group"><label>ห้อง <span class="required">*</span></label>
          <select id="bRoom" required>${rooms.map(r => `<option value="${r.id}">${r.room_no}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>วันที่ออกบิล</label><input type="date" id="bDate" value="${todayStr()}" required></div>
        <div class="form-group"><label>วันครบกำหนด</label><input type="date" id="bDue" required></div>
      </div>
      <h4 style="margin:12px 0">รายการ</h4>
      <div id="billItems"></div>
      <button type="button" class="btn" onclick="addBillItem()" style="margin-top:8px">+ เพิ่มรายการ</button>
      <div style="margin-top:16px;padding:14px;background:#f9fafb;border-radius:8px">
        <strong>รวม: <span id="billTotal">0.00</span> บาท</strong>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
        <button type="submit" class="btn btn-success">💾 Save</button>
      </div>
    </form>
  `, true);
  window.billRates = rates;
  addBillItem();
  document.getElementById('createBillForm').addEventListener('submit', async e => {
    e.preventDefault();
    const items = collectBillItems();
    if (items.length === 0) return toast('กรุณาเพิ่มรายการ', 'error');
    try {
      await api('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          room_id: +document.getElementById('bRoom').value,
          invoice_date: document.getElementById('bDate').value,
          due_date: document.getElementById('bDue').value,
          type: 'ทั่วไป',
          items
        })
      });
      toast('สร้างบิลสำเร็จ'); closeModal(); loadAllInvoices();
    } catch (err) { toast(err.message, 'error'); }
  });
}
function addBillItem() {
  const div = document.createElement('div');
  div.className = 'bill-item';
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px';
  div.innerHTML = `
    <select class="b-name" onchange="updateBillItem(this)">
      <option value="">-- เลือกรายการ --</option>
      ${window.billRates.map(r => `<option value="${r.service_name}" data-rate="${r.rate}">${r.service_name}</option>`).join('')}
    </select>
    <input type="number" class="b-qty" value="1" min="0.01" step="0.01" oninput="recalcBill()">
    <input type="number" class="b-price" min="0" step="0.01" oninput="recalcBill()" placeholder="ราคา">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove();recalcBill()">×</button>
  `;
  document.getElementById('billItems').appendChild(div);
}
function updateBillItem(sel) {
  const opt = sel.selectedOptions[0];
  const row = sel.closest('.bill-item');
  row.querySelector('.b-price').value = opt.dataset.rate || 0;
  recalcBill();
}
function recalcBill() {
  let total = 0;
  document.querySelectorAll('.bill-item').forEach(r => {
    const q = +r.querySelector('.b-qty').value || 0;
    const p = +r.querySelector('.b-price').value || 0;
    total += q * p;
  });
  document.getElementById('billTotal').textContent = fmt(total);
}
function collectBillItems() {
  const items = [];
  document.querySelectorAll('.bill-item').forEach(r => {
    const name = r.querySelector('.b-name').value;
    const q = +r.querySelector('.b-qty').value || 0;
    const p = +r.querySelector('.b-price').value || 0;
    if (name && q > 0 && p > 0) items.push({ service_name: name, quantity: q, unit_price: p, amount: +(q * p).toFixed(2) });
  });
  return items;
}

function openBatchMonthly() {
  showModal(`
    <div class="modal-header"><h2 class="modal-title">ออกบิลรายเดือน (Batch)</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <p>สร้างบิลสำหรับห้องที่ "ไม่ว่าง" ทั้งหมด - ระบบจะข้ามห้องที่มีบิลของเดือนเดียวกันแล้ว</p>
    <form id="batchForm" style="margin-top:16px">
      <div class="form-row">
        <div class="form-group"><label>วันที่ออกบิล <span class="required">*</span></label>
          <input type="date" id="batchDate" value="${todayStr()}" required>
        </div>
        <div class="form-group"><label>วันครบกำหนด <span class="required">*</span></label>
          <input type="date" id="batchDue" required>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="closeModal()">⊘ Cancel</button>
        <button type="submit" class="btn btn-success">💾 ออกบิล</button>
      </div>
    </form>
  `);
  document.getElementById('batchForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('/api/invoices/batch-monthly', {
        method: 'POST',
        body: JSON.stringify({
          invoice_date: document.getElementById('batchDate').value,
          due_date: document.getElementById('batchDue').value
        })
      });
      toast(`สร้างบิล ${r.created} รายการ (ข้าม ${r.skipped})`);
      closeModal(); loadAllInvoices();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function viewInvoice(id) {
  try {
    const inv = await api(`/api/invoices/${id}`);
    const isUnpaid = inv.status === 'ค้างชำระ';
    const isPending = inv.status === 'รอตรวจสอบ';
    if (isPending) return showPendingInvoice(inv);
    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">${isUnpaid ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน'} ${inv.invoice_no}</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
        <div class="invoice-paper">
          <h2>${isUnpaid ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน'} / Invoice</h2>
          <div style="display:flex;justify-content:space-between;margin-bottom:14px">
            <div>
              หอพักทิวลิปแมนชั่น<br>
              199/12 หมู่ 5 ตำบลกิตติพานิช อ.เมืองยโส จ.ยโสธร<br>
              โทรศัพท์ / Tel no.<br>
              เลขประจำตัวผู้เสียภาษี / Tax no.
            </div>
            <div style="text-align:right">
              เลขที่: ${inv.invoice_no}<br>
              ห้อง: ${inv.room_no}<br>
              <span class="badge badge-${isUnpaid ? 'unpaid' : 'paid'}">${inv.status}</span>
            </div>
          </div>
          <table style="font-size:11px">
            <thead><tr><th>#</th><th>รายการ</th><th>หน่วยที่ใช้</th><th>ราคา/หน่วย</th><th>ยอดรวม</th></tr></thead>
            <tbody>
              ${inv.items.map((it, i) => `<tr><td>${i+1}</td><td>${escapeHtml(it.service_name)}</td><td>${it.quantity}</td><td>${fmt(it.unit_price)}</td><td>${fmt(it.amount)}</td></tr>`).join('')}
              <tr><td colspan="4" style="text-align:right"><strong>รวม</strong></td><td><strong>${fmt(inv.total_amount)}</strong></td></tr>
            </tbody>
          </table>
          ${!isUnpaid ? `<div style="margin-top:12px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px">
            ชำระเมื่อ ${fmtDate(inv.payment_date)} ผ่าน ${inv.payment_method} จำนวน ${fmt(inv.paid_amount)} บาท
          </div>` : ''}
        </div>
        <div>
          ${isUnpaid ? `
            <div class="card" style="background:#fee2e2;margin-bottom:12px;text-align:center">
              <div>ค้างชำระ:</div>
              <div style="font-size:24px;font-weight:700">${fmt(inv.total_amount)}</div>
              <div>บาท</div>
            </div>
            <form id="payForm" enctype="multipart/form-data">
              <h3>รับเงิน</h3>
              <div class="form-group"><label>จำนวนเงิน <span class="required">*</span></label>
                <input type="number" id="pAmount" value="${inv.total_amount}" min="0.01" step="0.01" required>
              </div>
              <div class="form-group"><label>ช่องทาง <span class="required">*</span></label>
                <select id="pMethod" required>
                  <option value="">-- เลือก --</option>
                  <option>เงินสด</option>
                  <option>Debit/Credit Card</option>
                  <option>โอนผ่านบัญชี</option>
                </select>
              </div>
              <div class="form-group"><label>วันรับเงิน <span class="required">*</span></label>
                <input type="date" id="pDate" value="${todayStr()}" max="${todayStr()}" required>
              </div>
              <div class="form-group"><label>หลักฐาน <span class="required">*</span></label>
                <input type="file" id="pProof" accept="image/*" required>
              </div>
              <button type="submit" class="btn btn-success" style="width:100%">💾 บันทึกการชำระ</button>
            </form>
          ` : `
            <div class="card" style="background:#d1fae5">
              <h3 style="margin-bottom:12px">หลักฐานการชำระ</h3>
              <div>จำนวน: ${fmt(inv.paid_amount)}</div>
              <div>ช่องทาง: ${inv.payment_method || '-'}</div>
              <div>วันที่: ${fmtDate(inv.payment_date)}</div>
              ${inv.payment_proof ? `<img src="${inv.payment_proof}" class="file-preview">` : ''}
            </div>
          `}
        </div>
      </div>
    `, true);
    if (isUnpaid) {
      document.getElementById('payForm').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('paid_amount', document.getElementById('pAmount').value);
        fd.append('payment_method', document.getElementById('pMethod').value);
        fd.append('payment_date', document.getElementById('pDate').value);
        const f = document.getElementById('pProof').files[0];
        if (f) fd.append('payment_proof', f);
        try {
          await api(`/api/invoices/${id}/pay`, { method: 'POST', body: fd });
          toast('บันทึกการชำระสำเร็จ'); closeModal(); loadAllInvoices();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  } catch (e) { toast(e.message, 'error'); }
}

// =====================================================================
// 7. REPORTS
// =====================================================================
let currentReport = null;
function loadReportsPage() {
  document.getElementById('reportsHome').classList.remove('hidden');
  document.getElementById('reportsDetail').classList.add('hidden');
}
function openReport(t) {
  currentReport = t;
  document.getElementById('reportsHome').classList.add('hidden');
  document.getElementById('reportsDetail').classList.remove('hidden');
  const titles = {
    receipts: 'ใบเสร็จรับเงิน',
    unpaid: 'ใบแจ้งหนี้ค้างชำระ',
    monthly: 'ใบแจ้งหนี้รายเดือน',
    residents: 'ผู้พักอาศัยปัจจุบัน',
    meters: 'มิเตอร์ค่าน้ำและค่าไฟฟ้า'
  };
  document.getElementById('reportTitle').textContent = titles[t];
  document.getElementById('exportExcelBtn').onclick = () => exportReport(t);
  loadReport();
}
async function loadReport() {
  const t = currentReport;
  const from = document.getElementById('reportFrom').value;
  const to = document.getElementById('reportTo').value;
  const params = new URLSearchParams({ from: from || '', to: to || '' });
  try {
    let data;
    if (t === 'receipts') data = await api('/api/reports/receipts?' + params);
    else if (t === 'unpaid' || t === 'monthly') data = await api('/api/reports/unpaid?' + params);
    else if (t === 'residents') data = await api('/api/reports/residents');
    else if (t === 'meters') data = await api('/api/reports/meters');

    const list = data.list || [];
    if (list.length === 0) {
      document.getElementById('reportContent').innerHTML = '<div style="padding:60px;text-align:center;color:#9ca3af">📭 No Data Found</div>';
      document.getElementById('reportSummary').innerHTML = '';
      return;
    }

    if (t === 'receipts') {
      document.getElementById('reportSummary').innerHTML = `<strong>จำนวน:</strong> ${data.count} ใบ | <strong>ยอดรวม:</strong> ${fmt(data.total)} บาท`;
      document.getElementById('reportContent').innerHTML = `<table><thead><tr><th>#</th><th>เลขที่</th><th>วันที่</th><th>ห้อง</th><th>ช่องทาง</th><th>ยอด</th></tr></thead><tbody>${list.map((r,i)=>`<tr><td>${i+1}</td><td>${r.invoice_no}</td><td>${fmtDate(r.payment_date)}</td><td>${r.room_no}</td><td>${r.payment_method || '-'}</td><td>${fmt(r.paid_amount)}</td></tr>`).join('')}</tbody></table>`;
    } else if (t === 'unpaid' || t === 'monthly') {
      document.getElementById('reportSummary').innerHTML = `<strong>จำนวน:</strong> ${data.count} ใบ`;
      document.getElementById('reportContent').innerHTML = `<table><thead><tr><th>#</th><th>เลขที่</th><th>วันที่</th><th>ห้อง</th><th>สถานะ</th><th>ยอด</th><th>ค้างชำระ</th></tr></thead><tbody>${list.map((r,i)=>`<tr><td>${i+1}</td><td>${r.invoice_no}</td><td>${fmtDate(r.invoice_date)}</td><td>${r.room_no}</td><td><span class="badge badge-unpaid">${r.status}</span></td><td>${fmt(r.total_amount)}</td><td>${fmt(r.total_amount - (r.paid_amount||0))}</td></tr>`).join('')}</tbody></table>`;
    } else if (t === 'residents') {
      document.getElementById('reportSummary').innerHTML = `<strong>จำนวนห้อง:</strong> ${list.length}`;
      document.getElementById('reportContent').innerHTML = `<table><thead><tr><th>ห้อง</th><th>สถานะ</th><th>ผู้เช่า</th></tr></thead><tbody>${list.map(r=>`<tr><td>${r.room_no}</td><td><span class="badge badge-${r.status === 'ว่าง' ? 'available' : r.status === 'ปรับปรุง' ? 'renovating' : 'occupied'}">${r.status}</span></td><td>${escapeHtml(r.resident_name || '-')}</td></tr>`).join('')}</tbody></table>`;
    } else if (t === 'meters') {
      document.getElementById('reportSummary').innerHTML = `<strong>รายการ:</strong> ${list.length}`;
      document.getElementById('reportContent').innerHTML = `<table><thead><tr><th>วันที่</th><th>ประเภท</th><th>ห้อง</th><th>ครั้งก่อน</th><th>ปัจจุบัน</th><th>หน่วย</th></tr></thead><tbody>${list.map(r=>`<tr><td>${fmtDate(r.record_date)}</td><td>${r.meter_type === 'water' ? '💧 น้ำ' : '⚡ ไฟ'}</td><td>${r.room_no}</td><td>${r.previous_reading}</td><td>${r.current_reading}</td><td>${r.units_used}</td></tr>`).join('')}</tbody></table>`;
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function exportReport(t) {
  const map = { receipts: 'receipts', unpaid: 'unpaid', monthly: 'unpaid', residents: 'residents', meters: 'meters' };
  try {
    const res = await fetch(`/api/reports/export/${map[t]}`, { headers: { Authorization: 'Bearer ' + Auth.getToken() } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${t}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
    toast('ดาวน์โหลดไฟล์ Excel');
  } catch (e) { toast('ดาวน์โหลดไม่สำเร็จ', 'error'); }
}

// =====================================================================
// SETTINGS
// =====================================================================
async function loadSettings() {
  const u = Auth.getUser();
  document.getElementById('userInfoBox').innerHTML = `
    <div style="padding:14px;background:#f9fafb;border-radius:8px">
      <strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.username)}) - ${u.user_type}
    </div>
  `;
  try {
    const list = await api('/api/announcements');
    document.getElementById('annList').innerHTML = list.length
      ? list.map(a => `<div style="padding:10px;background:#f9fafb;border-radius:8px;margin-bottom:8px;font-size:13px">${escapeHtml(a.message)} <span style="color:#9ca3af;font-size:11px">${fmtDate(a.created_at)}</span></div>`).join('')
      : '<div style="color:#9ca3af">ยังไม่มีประชาสัมพันธ์</div>';
  } catch {}
}
document.getElementById('annForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/api/announcements', { method: 'POST', body: JSON.stringify({ message: document.getElementById('annMsg').value }) });
    toast('เพิ่มสำเร็จ');
    document.getElementById('annMsg').value = '';
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
});

// Initial load
loadHome();
