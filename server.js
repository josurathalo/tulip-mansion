// server.js - Tulip Mansion Backend
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { init: initDb, CONST } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = 'tulip-mansion-secret-key-2026';
const C = CONST;
let db;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('image only'));
    cb(null, true);
  }
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'not logged in' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'invalid token' }); }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.user_type)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

// AUTH
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'user not found' });
  if (user.status === 'Inactive') return res.status(401).json({ error: 'account disabled' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'wrong password' });
  const token = jwt.sign(
    { id: user.id, username: user.username, user_type: user.user_type, name: user.name, room_no: user.room_no },
    SECRET, { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, username: user.username, user_type: user.user_type, room_no: user.room_no } });
});
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

// USERS
app.get('/api/users', auth, requireRole('Admin'), (req, res) => {
  const { search = '', type = 'all', status = 'all', sort = 'recent' } = req.query;
  let sql = `SELECT id, name, username, room_no, status, user_type, created_at FROM users WHERE 1=1`;
  const params = [];
  if (search) { sql += ` AND (name LIKE ? OR username LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (type !== 'all') { sql += ' AND user_type = ?'; params.push(type); }
  if (status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  sql += sort === 'oldest' ? ' ORDER BY created_at ASC' : ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});
app.get('/api/users/:id', auth, requireRole('Admin'), (req, res) => {
  const u = db.prepare('SELECT id, name, username, room_no, status, user_type FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u);
});
app.post('/api/users', auth, requireRole('Admin'), (req, res) => {
  const { name, username, password, room_no, status, user_type } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'missing fields' });
  if (username.length < 3) return res.status(400).json({ error: 'Username at least 3 chars' });
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/.test(password))
    return res.status(400).json({ error: 'Password needs upper+lower+digit, min 8 chars' });
  if (room_no && !/^\d+[a-zA-Z]?$/.test(room_no)) return res.status(400).json({ error: 'Room must be number' });
  if (!['Admin', 'Staff', 'Resident'].includes(user_type)) return res.status(400).json({ error: 'invalid user_type' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Username already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(`INSERT INTO users (name, username, password, room_no, status, user_type) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, username, hash, room_no || null, status || 'Active', user_type);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/users/:id', auth, requireRole('Admin'), (req, res) => {
  const { name, username, room_no, status, user_type, password } = req.body;
  const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
  if (exists) return res.status(400).json({ error: 'Username already exists' });
  if (password && password !== '**********') {
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/.test(password))
      return res.status(400).json({ error: 'password rule' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET name=?, username=?, password=?, room_no=?, status=?, user_type=? WHERE id=?')
      .run(name, username, hash, room_no, status, user_type, req.params.id);
  } else {
    db.prepare('UPDATE users SET name=?, username=?, room_no=?, status=?, user_type=? WHERE id=?')
      .run(name, username, room_no, status, user_type, req.params.id);
  }
  res.json({ ok: true });
});
app.delete('/api/users/:id', auth, requireRole('Admin'), (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ROOMS
app.get('/api/rooms', auth, (req, res) => {
  const rooms = db.prepare(`
    SELECT r.*, l.resident_name, l.end_date as lease_end,
      (SELECT COUNT(*) FROM invoices i WHERE i.room_id=r.id AND i.status=?) as unpaid_count
    FROM rooms r
    LEFT JOIN leases l ON l.room_id=r.id AND l.status='active'
    ORDER BY r.room_no
  `).all(C.T_UNPAID);
  res.json(rooms);
});
app.get('/api/rooms/stats', auth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c;
  const available = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE status=?').get(C.T_VAC).c;
  const occupied = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE status=?').get(C.T_OCC).c;
  const renovating = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE status=?').get(C.T_RENO).c;
  const unpaid = db.prepare('SELECT COUNT(DISTINCT room_id) as c FROM invoices WHERE status=?').get(C.T_UNPAID).c;
  const paid = db.prepare('SELECT COUNT(DISTINCT room_id) as c FROM invoices WHERE status=?').get(C.T_PAID).c;
  const pendingMaintenance = db.prepare('SELECT COUNT(*) as c FROM maintenance WHERE status=?').get(C.T_PEND).c;
  const revenue = db.prepare(`
    SELECT strftime('%m', payment_date) as month, SUM(paid_amount) as total
    FROM invoices WHERE status=? AND payment_date IS NOT NULL
    GROUP BY strftime('%m', payment_date)
  `).all(C.T_PAID);
  res.json({ total, available, occupied, renovating, unpaid, paid, pendingMaintenance, revenue });
});
app.get('/api/rooms/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM rooms WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});
app.post('/api/rooms', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { room_no, floor, room_type, price, status } = req.body;
  if (!room_no || !floor || !room_type) return res.status(400).json({ error: 'missing fields' });
  if (!Number.isFinite(+price) || +price <= 0) return res.status(400).json({ error: 'Price must be positive' });
  const exists = db.prepare('SELECT id FROM rooms WHERE room_no=?').get(room_no);
  if (exists) return res.status(400).json({ error: 'Room number already exists' });
  const r = db.prepare('INSERT INTO rooms (room_no, floor, room_type, price, status) VALUES (?, ?, ?, ?, ?)')
    .run(room_no, +floor, room_type, +price, status || C.T_VAC);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/rooms/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { room_no, floor, room_type, price, status } = req.body;
  if (!Number.isFinite(+price) || +price <= 0) return res.status(400).json({ error: 'Price must be positive' });
  db.prepare('UPDATE rooms SET room_no=?, floor=?, room_type=?, price=?, status=? WHERE id=?')
    .run(room_no, +floor, room_type, +price, status, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/rooms/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// LEASES
app.get('/api/leases', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, r.room_no, r.status as room_status, r.price as room_price
    FROM leases l JOIN rooms r ON l.room_id=r.id
    ORDER BY l.created_at DESC
  `).all());
});
app.get('/api/leases/by-room/:roomId', auth, (req, res) => {
  const lease = db.prepare(`
    SELECT l.*, r.room_no, r.status as room_status
    FROM leases l JOIN rooms r ON l.room_id=r.id
    WHERE l.room_id=? AND l.status='active'
    ORDER BY l.id DESC LIMIT 1
  `).get(req.params.roomId);
  res.json(lease || null);
});
app.post('/api/leases', auth, requireRole('Admin', 'Staff'), upload.single('contract_image'), (req, res) => {
  try {
    const { room_id, resident_name, start_date, end_date, rent_price, duration_years, deposit, payment_method } = req.body;
    if (!resident_name || !resident_name.trim()) return res.status(400).json({ error: 'Name required' });
    if (!start_date || !end_date) return res.status(400).json({ error: 'Date required' });
    const sd = new Date(start_date), ed = new Date(end_date), today = new Date();
    today.setHours(0, 0, 0, 0);
    if (sd > today) return res.status(400).json({ error: 'Start date cannot be in future' });
    if (ed <= sd) return res.status(400).json({ error: 'End date must be after start' });
    if (!Number.isFinite(+rent_price) || +rent_price <= 0) return res.status(400).json({ error: 'Rent must be positive' });
    if (+duration_years < 1) return res.status(400).json({ error: 'Duration min 1 year' });
    if (+deposit !== +rent_price) return res.status(400).json({ error: 'Deposit must equal rent' });
    if (![C.T_CASH, 'Debit/Credit Card', C.T_TRANSFER].includes(payment_method))
      return res.status(400).json({ error: 'Invalid payment method' });
    if (!req.file) return res.status(400).json({ error: 'Contract image required' });
    const conflict = db.prepare(`
      SELECT id FROM leases WHERE room_id=? AND status='active'
        AND NOT (end_date < ? OR start_date > ?)
    `).get(room_id, start_date, end_date);
    if (conflict) return res.status(400).json({ error: 'Room has active lease in this period' });
    const r = db.prepare(`INSERT INTO leases
      (room_id, resident_name, start_date, end_date, rent_price, duration_years, deposit, payment_method, contract_image)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      room_id, resident_name, start_date, end_date, +rent_price, +duration_years, +deposit, payment_method,
      '/uploads/' + req.file.filename
    );
    db.prepare('UPDATE rooms SET status=? WHERE id=?').run(C.T_OCC, room_id);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/leases/:id', auth, requireRole('Admin', 'Staff'), upload.single('contract_image'), (req, res) => {
  try {
    const { resident_name, start_date, end_date, rent_price, duration_years, deposit, payment_method } = req.body;
    if (!resident_name) return res.status(400).json({ error: 'Name required' });
    const sd = new Date(start_date), ed = new Date(end_date);
    if (ed <= sd) return res.status(400).json({ error: 'End date must be after start' });
    if (+deposit !== +rent_price) return res.status(400).json({ error: 'Deposit must equal rent' });
    if (req.file) {
      db.prepare(`UPDATE leases SET resident_name=?, start_date=?, end_date=?, rent_price=?, duration_years=?, deposit=?, payment_method=?, contract_image=? WHERE id=?`)
        .run(resident_name, start_date, end_date, +rent_price, +duration_years, +deposit, payment_method, '/uploads/' + req.file.filename, req.params.id);
    } else {
      db.prepare(`UPDATE leases SET resident_name=?, start_date=?, end_date=?, rent_price=?, duration_years=?, deposit=?, payment_method=? WHERE id=?`)
        .run(resident_name, start_date, end_date, +rent_price, +duration_years, +deposit, payment_method, req.params.id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// METERS
app.get('/api/meters', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT mr.*,
      (SELECT COUNT(*) FROM meter_details md WHERE md.record_id=mr.id) as room_count,
      (SELECT SUM(units_used) FROM meter_details md WHERE md.record_id=mr.id) as total_units
    FROM meter_records mr ORDER BY record_date DESC
  `).all());
});
app.get('/api/meters/:id', auth, (req, res) => {
  const record = db.prepare('SELECT * FROM meter_records WHERE id=?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'not found' });
  const details = db.prepare(`
    SELECT md.*, r.room_no, r.status as room_status
    FROM meter_details md JOIN rooms r ON md.room_id=r.id
    WHERE md.record_id=? ORDER BY r.room_no
  `).all(req.params.id);
  res.json(Object.assign({}, record, { details }));
});
app.get('/api/meters/last-readings/:type', auth, (req, res) => {
  const type = req.params.type;
  const rooms = db.prepare(`
    SELECT r.id as room_id, r.room_no, r.status,
      COALESCE((SELECT md.current_reading FROM meter_details md
        JOIN meter_records mr ON md.record_id=mr.id
        WHERE md.room_id=r.id AND mr.meter_type=?
        ORDER BY mr.record_date DESC LIMIT 1), 0) as last_reading
    FROM rooms r ORDER BY r.room_no
  `).all(type);
  res.json(rooms);
});
app.post('/api/meters', auth, requireRole('Admin', 'Staff'), (req, res) => {
  try {
    const { record_date, meter_type, details } = req.body;
    if (!record_date || !meter_type || !Array.isArray(details))
      return res.status(400).json({ error: 'missing fields' });
    if (!['water', 'electric'].includes(meter_type))
      return res.status(400).json({ error: 'invalid type' });
    for (const d of details) {
      if (d.current_reading === '' || d.current_reading == null) continue;
      if (!Number.isFinite(+d.current_reading)) return res.status(400).json({ error: 'meter must be number' });
      if (+d.current_reading < +d.previous_reading)
        return res.status(400).json({ error: `Room ${d.room_no}: current must be >= previous` });
    }
    const recId = db.transaction(() => {
      const r = db.prepare('INSERT INTO meter_records (record_date, meter_type) VALUES (?, ?)').run(record_date, meter_type);
      const rid = r.lastInsertRowid;
      const insertDetail = db.prepare(`INSERT INTO meter_details (record_id, room_id, previous_reading, current_reading, units_used) VALUES (?, ?, ?, ?, ?)`);
      for (const d of details) {
        if (d.current_reading === '' || d.current_reading == null) continue;
        const prev = +d.previous_reading || 0;
        const curr = +d.current_reading;
        insertDetail.run(rid, d.room_id, prev, curr, +(curr - prev).toFixed(2));
      }
      return rid;
    })();
    res.json({ id: recId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/meters/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  db.prepare('DELETE FROM meter_records WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// MAINTENANCE
app.get('/api/maintenance', auth, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT m.*, r.room_no FROM maintenance m JOIN rooms r ON m.room_id=r.id`;
  const params = [];
  if (status) { sql += ' WHERE m.status=?'; params.push(status); }
  sql += ' ORDER BY m.report_date DESC';
  const items = db.prepare(sql).all(...params);
  if (req.user.user_type === 'Resident') {
    const room = db.prepare('SELECT id FROM rooms WHERE room_no=?').get(req.user.room_no);
    if (room) return res.json(items.filter(i => i.room_id === room.id));
    return res.json([]);
  }
  res.json(items);
});
app.get('/api/maintenance/:id', auth, (req, res) => {
  const item = db.prepare(`SELECT m.*, r.room_no FROM maintenance m JOIN rooms r ON m.room_id=r.id WHERE m.id=?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});
app.post('/api/maintenance', auth, upload.single('image'), (req, res) => {
  try {
    let { room_id, report_date, appointment_date, details } = req.body;
    if (req.user.user_type === 'Resident') {
      const room = db.prepare('SELECT id FROM rooms WHERE room_no=?').get(req.user.room_no);
      if (!room) return res.status(400).json({ error: 'No room found' });
      room_id = room.id;
    }
    if (!room_id) return res.status(400).json({ error: 'Select room' });
    if (!report_date) return res.status(400).json({ error: 'Report date required' });
    if (!details || !details.trim()) return res.status(400).json({ error: 'Details required' });
    const r = db.prepare(`INSERT INTO maintenance (room_id, reported_by, report_date, appointment_date, details, image, status)
      VALUES (?,?,?,?,?,?,?)`).run(
      room_id, req.user.id, report_date, appointment_date || null, details,
      req.file ? '/uploads/' + req.file.filename : null, C.T_PEND
    );
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/maintenance/:id', auth, upload.single('image'), (req, res) => {
  try {
    const { room_id, report_date, appointment_date, details } = req.body;
    if (!details) return res.status(400).json({ error: 'Details required' });
    const current = db.prepare('SELECT status FROM maintenance WHERE id=?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'not found' });
    if (current.status === C.T_DONE)
      return res.status(400).json({ error: 'Already completed, cannot edit' });
    if (req.file) {
      db.prepare(`UPDATE maintenance SET room_id=?, report_date=?, appointment_date=?, details=?, image=? WHERE id=?`)
        .run(room_id, report_date, appointment_date, details, '/uploads/' + req.file.filename, req.params.id);
    } else {
      db.prepare(`UPDATE maintenance SET room_id=?, report_date=?, appointment_date=?, details=? WHERE id=?`)
        .run(room_id, report_date, appointment_date, details, req.params.id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/maintenance/:id/complete', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { completed_date, cost, repair_notes } = req.body;
  if (!completed_date) return res.status(400).json({ error: 'Date required' });
  if (!Number.isFinite(+cost) || +cost < 0) return res.status(400).json({ error: 'Cost must be number' });
  if (!repair_notes || !repair_notes.trim()) return res.status(400).json({ error: 'Notes required' });
  db.prepare(`UPDATE maintenance SET status=?, completed_date=?, cost=?, repair_notes=? WHERE id=?`)
    .run(C.T_DONE, completed_date, +cost, repair_notes, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/maintenance/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  db.prepare('DELETE FROM maintenance WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// SERVICE RATES
app.get('/api/rates', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM service_rates ORDER BY service_name').all());
});
app.post('/api/rates', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { service_name, rate, is_metered } = req.body;
  if (!service_name || !service_name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!Number.isFinite(+rate) || +rate <= 0) return res.status(400).json({ error: 'Rate must be positive' });
  const r = db.prepare('INSERT INTO service_rates (service_name, rate, is_metered) VALUES (?, ?, ?)').run(service_name, +rate, is_metered ? 1 : 0);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/rates/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { service_name, rate, is_metered } = req.body;
  if (+rate < 0) return res.status(400).json({ error: 'Cannot be negative' });
  db.prepare('UPDATE service_rates SET service_name=?, rate=?, is_metered=? WHERE id=?').run(service_name, +rate, is_metered ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/rates/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  db.prepare('DELETE FROM service_rates WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// INVOICES
app.get('/api/invoices', auth, (req, res) => {
  const { status, search_room, search_invoice, from_date, to_date } = req.query;
  let sql = `SELECT i.*, r.room_no FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND i.status=?'; params.push(status); }
  if (search_room) { sql += ' AND r.room_no LIKE ?'; params.push(`%${search_room}%`); }
  if (search_invoice) { sql += ' AND i.invoice_no LIKE ?'; params.push(`%${search_invoice}%`); }
  if (from_date) { sql += ' AND i.invoice_date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND i.invoice_date <= ?'; params.push(to_date); }
  if (req.user.user_type === 'Resident') { sql += ' AND r.room_no=?'; params.push(req.user.room_no); }
  sql += ' ORDER BY i.invoice_date DESC';
  res.json(db.prepare(sql).all(...params));
});
app.get('/api/invoices/:id', auth, (req, res) => {
  const inv = db.prepare(`SELECT i.*, r.room_no, r.room_type FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE i.id=?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (req.user.user_type === 'Resident' && inv.room_no !== req.user.room_no)
    return res.status(403).json({ error: 'forbidden' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(req.params.id);
  const lease = db.prepare(`SELECT resident_name FROM leases WHERE room_id=? AND status='active' ORDER BY id DESC LIMIT 1`).get(inv.room_id);
  res.json(Object.assign({}, inv, { items, resident_name: lease ? lease.resident_name : null }));
});
function generateInvoiceNo() {
  const last = db.prepare(`SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1`).get();
  if (!last) return 'WO-12500';
  const num = parseInt(last.invoice_no.split('-')[1]) + 1;
  return 'WO-' + num;
}
app.post('/api/invoices', auth, requireRole('Admin', 'Staff'), (req, res) => {
  try {
    const { room_id, invoice_date, due_date, type, items } = req.body;
    if (!room_id || !invoice_date || !due_date || !type) return res.status(400).json({ error: 'missing fields' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Need at least 1 item' });
    if (type === C.T_MONTHLY) {
      const m = invoice_date.substring(0, 7);
      const dup = db.prepare(`SELECT id FROM invoices WHERE room_id=? AND type=? AND substr(invoice_date,1,7)=?`).get(room_id, C.T_MONTHLY, m);
      if (dup) return res.status(400).json({ error: 'Monthly invoice already exists for this month' });
    }
    const total = items.reduce((s, i) => s + (+i.amount || 0), 0);
    const inv_no = generateInvoiceNo();
    const newId = db.transaction(() => {
      const r = db.prepare(`INSERT INTO invoices (invoice_no, room_id, invoice_date, due_date, type, total_amount, status) VALUES (?,?,?,?,?,?,?)`)
        .run(inv_no, room_id, invoice_date, due_date, type, +total.toFixed(2), C.T_UNPAID);
      const ins = db.prepare(`INSERT INTO invoice_items (invoice_id, service_name, quantity, unit_price, amount) VALUES (?,?,?,?,?)`);
      for (const it of items) ins.run(r.lastInsertRowid, it.service_name, +it.quantity || 1, +it.unit_price, +it.amount);
      return r.lastInsertRowid;
    })();
    res.json({ id: newId, invoice_no: inv_no });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/invoices/batch-monthly', auth, requireRole('Admin', 'Staff'), (req, res) => {
  try {
    const { invoice_date, due_date } = req.body;
    if (!invoice_date || !due_date) return res.status(400).json({ error: 'Dates required' });
    const m = invoice_date.substring(0, 7);
    const occupiedRooms = db.prepare('SELECT * FROM rooms WHERE status=?').all(C.T_OCC);
    const rates = db.prepare(`SELECT * FROM service_rates`).all();
    let created = 0, skipped = 0;
    db.transaction(() => {
      for (const rm of occupiedRooms) {
        const dup = db.prepare(`SELECT id FROM invoices WHERE room_id=? AND type=? AND substr(invoice_date,1,7)=?`).get(rm.id, C.T_MONTHLY, m);
        if (dup) { skipped++; continue; }
        const items = [{ service_name: C.T_FEE_RENT, quantity: 1, unit_price: rm.price, amount: rm.price }];
        for (const rt of rates) {
          if (!rt.is_metered) items.push({ service_name: rt.service_name, quantity: 1, unit_price: rt.rate, amount: rt.rate });
        }
        const total = items.reduce((s, i) => s + i.amount, 0);
        const inv_no = generateInvoiceNo();
        const r = db.prepare(`INSERT INTO invoices (invoice_no, room_id, invoice_date, due_date, type, total_amount, status) VALUES (?,?,?,?,?,?,?)`)
          .run(inv_no, rm.id, invoice_date, due_date, C.T_MONTHLY, +total.toFixed(2), C.T_UNPAID);
        const ins = db.prepare(`INSERT INTO invoice_items (invoice_id, service_name, quantity, unit_price, amount) VALUES (?,?,?,?,?)`);
        for (const it of items) ins.run(r.lastInsertRowid, it.service_name, it.quantity, it.unit_price, it.amount);
        created++;
      }
    })();
    res.json({ created, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/invoices/:id/pay', auth, requireRole('Admin', 'Staff'), upload.single('payment_proof'), (req, res) => {
  try {
    const { paid_amount, payment_method, payment_date } = req.body;
    if (!Number.isFinite(+paid_amount) || +paid_amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!payment_method) return res.status(400).json({ error: 'Method required' });
    if (!payment_date) return res.status(400).json({ error: 'Date required' });
    const today = new Date().toISOString().slice(0, 10);
    if (payment_date > today) return res.status(400).json({ error: 'Date cannot be future' });
    if (!req.file) return res.status(400).json({ error: 'Proof required' });
    db.prepare(`UPDATE invoices SET paid_amount=?, payment_method=?, payment_date=?, payment_proof=?, status=? WHERE id=?`)
      .run(+paid_amount, payment_method, payment_date, '/uploads/' + req.file.filename, C.T_PAID, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/invoices/:id', auth, requireRole('Admin', 'Staff'), (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Resident submits payment proof (QR transfer slip)
app.post('/api/invoices/:id/submit-payment', auth, requireRole('Resident'), upload.single('payment_proof'), (req, res) => {
  try {
    const { paid_amount, payment_method, payment_date } = req.body;
    const inv = db.prepare('SELECT i.*, r.room_no FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE i.id=?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'not found' });
    if (inv.room_no !== req.user.room_no) return res.status(403).json({ error: 'forbidden' });
    if (inv.status === C.T_PAID) return res.status(400).json({ error: 'invoice already paid' });
    if (!Number.isFinite(+paid_amount) || +paid_amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!payment_date) return res.status(400).json({ error: 'Date required' });
    const today = new Date().toISOString().slice(0, 10);
    if (payment_date > today) return res.status(400).json({ error: 'Date cannot be future' });
    if (!req.file) return res.status(400).json({ error: 'Slip image required' });
    db.prepare(`UPDATE invoices SET paid_amount=?, payment_method=?, payment_date=?, payment_proof=?, status=? WHERE id=?`)
      .run(+paid_amount, payment_method || C.T_TRANSFER, payment_date, '/uploads/' + req.file.filename, C.T_PENDING_VERIFY, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Staff verifies a pending payment -> mark as PAID
app.post('/api/invoices/:id/verify', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status !== C.T_PENDING_VERIFY) return res.status(400).json({ error: 'invoice is not pending verification' });
  db.prepare('UPDATE invoices SET status=? WHERE id=?').run(C.T_PAID, req.params.id);
  res.json({ ok: true });
});

// Staff rejects a pending payment -> revert to UNPAID and clear proof
app.post('/api/invoices/:id/reject', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'not found' });
  if (inv.status !== C.T_PENDING_VERIFY) return res.status(400).json({ error: 'invoice is not pending verification' });
  db.prepare(`UPDATE invoices SET status=?, paid_amount=0, payment_method=NULL, payment_date=NULL, payment_proof=NULL WHERE id=?`)
    .run(C.T_UNPAID, req.params.id);
  res.json({ ok: true });
});

// REPORTS
app.get('/api/reports/receipts', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT i.*, r.room_no FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE i.status=?`;
  const p = [C.T_PAID];
  if (from) { sql += ' AND i.payment_date >= ?'; p.push(from); }
  if (to) { sql += ' AND i.payment_date <= ?'; p.push(to); }
  sql += ' ORDER BY i.payment_date DESC';
  const list = db.prepare(sql).all(...p);
  const total = list.reduce((s, i) => s + (+i.paid_amount || 0), 0);
  res.json({ list, count: list.length, total });
});
app.get('/api/reports/unpaid', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT i.*, r.room_no FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE i.status=?`;
  const p = [C.T_UNPAID];
  if (from) { sql += ' AND i.invoice_date >= ?'; p.push(from); }
  if (to) { sql += ' AND i.invoice_date <= ?'; p.push(to); }
  sql += ' ORDER BY i.due_date ASC';
  const list = db.prepare(sql).all(...p);
  res.json({ list, count: list.length });
});
app.get('/api/reports/residents', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const list = db.prepare(`
    SELECT r.id, r.room_no, r.status, l.resident_name, u.username as note
    FROM rooms r
    LEFT JOIN leases l ON l.room_id=r.id AND l.status='active'
    LEFT JOIN users u ON u.room_no = r.room_no AND u.user_type='Resident'
    ORDER BY r.room_no
  `).all();
  res.json({ list });
});
app.get('/api/reports/meters', auth, requireRole('Admin', 'Staff'), (req, res) => {
  const list = db.prepare(`
    SELECT mr.id, mr.record_date, mr.meter_type, r.room_no,
      md.previous_reading, md.current_reading, md.units_used
    FROM meter_records mr JOIN meter_details md ON md.record_id=mr.id JOIN rooms r ON md.room_id=r.id
    ORDER BY mr.record_date DESC
  `).all();
  res.json({ list });
});
app.get('/api/reports/export/:type', auth, requireRole('Admin', 'Staff'), async (req, res) => {
  const t = req.params.type;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Report');
  if (t === 'receipts') {
    const list = db.prepare(`SELECT i.invoice_no, i.payment_date, r.room_no, i.payment_method, i.paid_amount FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE i.status=? ORDER BY i.payment_date DESC`).all(C.T_PAID);
    ws.columns = [{ header: 'Invoice No', key: 'invoice_no', width: 20 }, { header: 'Date', key: 'payment_date', width: 15 }, { header: 'Room', key: 'room_no', width: 10 }, { header: 'Method', key: 'payment_method', width: 20 }, { header: 'Amount', key: 'paid_amount', width: 15 }];
    list.forEach(r => ws.addRow(r));
  } else if (t === 'unpaid') {
    const list = db.prepare(`SELECT i.invoice_no, i.invoice_date, r.room_no, i.status, i.total_amount FROM invoices i JOIN rooms r ON i.room_id=r.id WHERE i.status=? ORDER BY i.due_date`).all(C.T_UNPAID);
    ws.columns = [{ header: 'Invoice No', key: 'invoice_no', width: 20 }, { header: 'Date', key: 'invoice_date', width: 15 }, { header: 'Room', key: 'room_no', width: 10 }, { header: 'Status', key: 'status', width: 15 }, { header: 'Amount', key: 'total_amount', width: 15 }];
    list.forEach(r => ws.addRow(r));
  } else if (t === 'residents') {
    const list = db.prepare(`SELECT r.room_no, r.status, l.resident_name FROM rooms r LEFT JOIN leases l ON l.room_id=r.id AND l.status='active' ORDER BY r.room_no`).all();
    ws.columns = [{ header: 'Room', key: 'room_no', width: 10 }, { header: 'Status', key: 'status', width: 15 }, { header: 'Resident', key: 'resident_name', width: 30 }];
    list.forEach(r => ws.addRow(r));
  } else if (t === 'meters') {
    const list = db.prepare(`SELECT mr.record_date, mr.meter_type, r.room_no, md.previous_reading, md.current_reading, md.units_used FROM meter_records mr JOIN meter_details md ON md.record_id=mr.id JOIN rooms r ON md.room_id=r.id ORDER BY mr.record_date DESC`).all();
    ws.columns = [{ header: 'Date', key: 'record_date', width: 15 }, { header: 'Type', key: 'meter_type', width: 12 }, { header: 'Room', key: 'room_no', width: 10 }, { header: 'Previous', key: 'previous_reading', width: 12 }, { header: 'Current', key: 'current_reading', width: 12 }, { header: 'Units', key: 'units_used', width: 12 }];
    list.forEach(r => ws.addRow(r));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="report-${t}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ANNOUNCEMENTS
app.get('/api/announcements', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all());
});
app.post('/api/announcements', auth, requireRole('Admin', 'Staff'), (req, res) => {
  if (!req.body.message) return res.status(400).json({ error: 'Message required' });
  const r = db.prepare('INSERT INTO announcements (message) VALUES (?)').run(req.body.message);
  res.json({ id: r.lastInsertRowid });
});

// RESIDENT
app.get('/api/resident/dashboard', auth, requireRole('Resident'), (req, res) => {
  const unpaid = db.prepare(`
    SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
    FROM invoices i JOIN rooms r ON i.room_id=r.id
    WHERE i.status=? AND r.room_no=?
  `).get(C.T_UNPAID, req.user.room_no);
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 5').all();
  res.json({ unpaid_total: unpaid.total, announcements });
});

// HTML routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/staff', (req, res) => res.sendFile(path.join(__dirname, 'public', 'staff.html')));
app.get('/resident', (req, res) => res.sendFile(path.join(__dirname, 'public', 'resident.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// START
initDb().then(d => {
  db = d;
  app.listen(PORT, () => {
    console.log('');
    console.log('=== Tulip Mansion Management System ===');
    console.log('   Server: http://localhost:' + PORT);
    console.log('   Admin:    admin / Admin1234');
    console.log('   Staff:    staff / Staff1234');
    console.log('   Resident: apirati205 / User1234');
    console.log('');
  });
}).catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});
