// database.js - Pure JavaScript SQLite via sql.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'tulip_mansion.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

let _db = null;
let _inTx = false;

function saveDb() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

class StmtWrapper {
  constructor(sql) { this.sql = sql; }

  _bind(stmt, params) {
    if (params.length === 1 && Array.isArray(params[0])) params = params[0];
    if (params.length > 0) {
      const cleaned = params.map(p => p === undefined ? null : p);
      stmt.bind(cleaned);
    }
  }

  run(...params) {
    const stmt = _db.prepare(this.sql);
    try { this._bind(stmt, params); stmt.step(); }
    finally { stmt.free(); }
    if (!_inTx) saveDb();
    const r = _db.exec("SELECT last_insert_rowid() as id, changes() as c");
    const row = r[0] && r[0].values[0] ? r[0].values[0] : [0, 0];
    return { lastInsertRowid: row[0], changes: row[1] };
  }

  get(...params) {
    const stmt = _db.prepare(this.sql);
    let result;
    try { this._bind(stmt, params); if (stmt.step()) result = stmt.getAsObject(); }
    finally { stmt.free(); }
    return result;
  }

  all(...params) {
    const stmt = _db.prepare(this.sql);
    const rows = [];
    try { this._bind(stmt, params); while (stmt.step()) rows.push(stmt.getAsObject()); }
    finally { stmt.free(); }
    return rows;
  }
}

const dbApi = {
  prepare(sql) { return new StmtWrapper(sql); },
  exec(sql) { _db.exec(sql); if (!_inTx) saveDb(); },
  pragma(setting) { try { _db.exec(`PRAGMA ${setting}`); } catch (e) {} },
  transaction(fn) {
    return (...args) => {
      _inTx = true;
      _db.exec("BEGIN");
      try {
        const result = fn(...args);
        _db.exec("COMMIT");
        _inTx = false;
        saveDb();
        return result;
      } catch (e) {
        try { _db.exec("ROLLBACK"); } catch {}
        _inTx = false;
        throw e;
      }
    };
  },
  close() { saveDb(); _db.close(); },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  room_no TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  user_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_no TEXT UNIQUE NOT NULL,
  floor INTEGER NOT NULL,
  room_type TEXT NOT NULL,
  price REAL NOT NULL CHECK(price > 0),
  status TEXT NOT NULL DEFAULT 'OCC_VACANT',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  resident_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent_price REAL NOT NULL,
  duration_years INTEGER NOT NULL,
  deposit REAL NOT NULL,
  payment_method TEXT NOT NULL,
  contract_image TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
CREATE TABLE IF NOT EXISTS meter_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_date DATE NOT NULL,
  meter_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS meter_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL,
  room_id INTEGER NOT NULL,
  previous_reading REAL NOT NULL DEFAULT 0,
  current_reading REAL NOT NULL,
  units_used REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (record_id) REFERENCES meter_records(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
CREATE TABLE IF NOT EXISTS maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  reported_by INTEGER,
  report_date DATE NOT NULL,
  appointment_date DATE,
  details TEXT NOT NULL,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  completed_date DATE,
  cost REAL DEFAULT 0,
  repair_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (reported_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS service_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_name TEXT NOT NULL,
  rate REAL NOT NULL,
  is_metered INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  room_id INTEGER NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  type TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UNPAID',
  payment_method TEXT,
  payment_date DATE,
  payment_proof TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const T_OCC = 'ไม่ว่าง';
const T_VAC = 'ว่าง';
const T_RENO = 'ปรับปรุง';
const T_PEND = 'รอดำเนินการ';
const T_DONE = 'ดำเนินการเสร็จสิ้น';
const T_UNPAID = 'ค้างชำระ';
const T_PAID = 'ชำระแล้ว';
const T_PENDING_VERIFY = 'รอตรวจสอบ';
const T_MONTHLY = 'รายเดือน';
const T_GENERAL = 'ทั่วไป';
const T_CASH = 'เงินสด';
const T_TRANSFER = 'โอนผ่านบัญชี';
const T_FEE_WATER = 'ค่าน้ำ';
const T_FEE_ELEC = 'ค่าไฟฟ้า';
const T_FEE_NET = 'ค่าอินเตอร์เน็ต';
const T_FEE_COM = 'ค่าส่วนกลาง';
const T_FEE_PARK = 'ค่าที่จอดรถ';
const T_FEE_RENT = 'ค่าเช่า';
const T_ANN = 'ยินดีต้อนรับสู่หอพักทิวลิปแมนชั่น';

module.exports.CONST = { T_OCC, T_VAC, T_RENO, T_PEND, T_DONE, T_UNPAID, T_PAID, T_PENDING_VERIFY, T_MONTHLY, T_GENERAL, T_CASH, T_TRANSFER, T_FEE_WATER, T_FEE_ELEC, T_FEE_NET, T_FEE_COM, T_FEE_PARK, T_FEE_RENT };

async function init() {
  if (_db) return dbApi;

  console.log('Loading SQL.js engine...');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    console.log('Loading existing database:', DB_PATH);
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    console.log('Creating new database');
    _db = new SQL.Database();
  }

  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec(SCHEMA);

  const userCountResult = _db.exec("SELECT COUNT(*) as c FROM users");
  const userCount = userCountResult[0] ? userCountResult[0].values[0][0] : 0;

  if (userCount === 0) {
    console.log('Seeding initial data...');
    const hash = (p) => bcrypt.hashSync(p, 10);

    const seedUsers = [
      ['System Admin', 'admin', hash('Admin1234'), null, 'Active', 'Admin'],
      ['Tulip Staff', 'staff', hash('Staff1234'), null, 'Active', 'Staff'],
      ['Apirati', 'apirati205', hash('User1234'), '205', 'Active', 'Resident'],
      ['Somchai', 'somchai101', hash('User1234'), '101', 'Active', 'Resident'],
      ['Suda', 'suda102', hash('User1234'), '102', 'Active', 'Resident'],
    ];
    for (const u of seedUsers) {
      const s = _db.prepare(`INSERT INTO users (name, username, password, room_no, status, user_type) VALUES (?, ?, ?, ?, ?, ?)`);
      s.bind(u); s.step(); s.free();
    }

    const seedRooms = [
      ['101', 1, 'Standard', 4500, T_OCC],
      ['102', 1, 'Standard', 4500, T_OCC],
      ['103', 1, 'Standard', 4500, T_OCC],
      ['104', 1, 'Standard', 4500, T_OCC],
      ['105', 1, 'Standard', 5000, T_RENO],
      ['201', 2, 'Standard', 4500, T_OCC],
      ['202', 2, 'Standard', 4500, T_VAC],
      ['203', 2, 'Deluxe', 5500, T_OCC],
      ['204', 2, 'Deluxe', 5500, T_OCC],
      ['205', 2, 'Deluxe', 5500, T_OCC],
    ];
    for (const r of seedRooms) {
      const s = _db.prepare(`INSERT INTO rooms (room_no, floor, room_type, price, status) VALUES (?, ?, ?, ?, ?)`);
      s.bind(r); s.step(); s.free();
    }

    const seedRates = [
      [T_FEE_WATER, 25, 1],
      [T_FEE_ELEC, 8, 1],
      [T_FEE_NET, 300, 0],
      [T_FEE_COM, 200, 0],
      [T_FEE_PARK, 500, 0],
    ];
    for (const r of seedRates) {
      const s = _db.prepare(`INSERT INTO service_rates (service_name, rate, is_metered) VALUES (?, ?, ?)`);
      s.bind(r); s.step(); s.free();
    }

    const a = _db.prepare(`INSERT INTO announcements (message) VALUES (?)`);
    a.bind([T_ANN]); a.step(); a.free();

    console.log('Seed data inserted.');
    console.log('Default accounts:');
    console.log('   Admin:    admin / Admin1234');
    console.log('   Staff:    staff / Staff1234');
    console.log('   Resident: apirati205 / User1234');
  }

  saveDb();
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  console.log('Database ready:', DB_PATH);
  return dbApi;
}

module.exports.init = init;

if (require.main === module) {
  init().then(() => process.exit(0)).catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
  });
}
