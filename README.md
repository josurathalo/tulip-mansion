# Tulip Mansion - Dormitory Management System

ระบบจัดการหอพักครบวงจร แบบ Full-Stack Web Application พร้อมฐานข้อมูลจริง

## ฟีเจอร์หลัก

- 👥 **Admin Management** — จัดการผู้ใช้ 3 บทบาท (Admin / Staff / Resident) + Search/Filter/Pagination
- 🏨 **Room Management** — จัดการห้องพัก + Real-time Status + กราฟวงกลม + กราฟรายรับ
- 📝 **Lease & Agreement** — สร้างสัญญาเช่า + อัปโหลดสัญญา + ตรวจสัญญาซ้อน
- 📊 **Meter Recording** — จดมิเตอร์น้ำ/ไฟ + คำนวณค่าใช้จ่ายอัตโนมัติ + Outlier Check
- 🔧 **Maintenance** — Ticket Tracking + State Transition Validation
- 📋 **Service Rate** — กำหนดอัตราค่าบริการ (มิเตอร์/รายเดือน)
- 💵 **Payment & Bills** — Batch Generate + รับชำระ + ยืนยันการชำระ
- 💳 **QR Payment (Resident)** — ผู้พักอาศัยชำระผ่าน QR + อัปโหลดสลิป → Staff ยืนยัน
- 📈 **Reports** — 5 ประเภท + Export Excel + Print
- 🏠 **Resident View** — Dashboard + แจ้งซ่อม + ดูใบเสร็จ

---

## การติดตั้งและรัน

### ความต้องการ
- **Node.js 22+** ([ดาวน์โหลด](https://nodejs.org/))

### ขั้นตอน

================================
วิธีรันโปรเจกต์ Tulip Mansion
================================

1. เปิด Command Prompt
2. cd เข้าไปที่ folder tulip-mansion:
   cd tulip-mansion
3. รันคำสั่ง:
   npm install
   npm run init-db
   npm start
4. เปิด browser ที่ http://localhost:3000

บัญชีทดสอบ:
- Admin:    admin / Admin1234
- Staff:    staff / Staff1234
- Resident: apirati205 / User1234

ดูรายละเอียดทั้งหมดในไฟล์ tulip-mansion/README.md
และไฟล์ Tulip_Mansion_User_Manual.docx

```bash
# 1. Clone repo
git clone https://github.com/josurathalo/tulip-mansion.git
cd tulip-mansion

# 2. ติดตั้ง dependencies
npm install

# 3. สร้างฐานข้อมูล + ข้อมูลตัวอย่าง
npm run init-db

# 4. รันเซิร์ฟเวอร์
npm start
```

จากนั้นเปิดเบราว์เซอร์ที่ **http://localhost:3000**

---

## บัญชีเริ่มต้น

| Role | Username | Password |
|------|----------|----------|
| 👑 Admin | `admin` | `Admin1234` |
| 👤 Staff | `staff` | `Staff1234` |
| 🏠 Resident | `apirati205` | `User1234` |
| 🏠 Resident | `somchai101` | `User1234` |
| 🏠 Resident | `suda102` | `User1234` |

---

## ตั้งค่า QR Code สำหรับการชำระเงิน

วาง QR Code ของธนาคาร/PromptPay ที่ไฟล์:

```
public/img/qr-payment.jpg
```

หากไม่มีไฟล์ ระบบจะแสดง placeholder ให้ Resident

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | SQLite via `sql.js` (Pure JavaScript - ไม่ต้อง compile) |
| Auth | JWT + bcryptjs |
| File Upload | Multer (จำกัด 5MB, image only) |
| Excel Export | ExcelJS |
| Frontend | Vanilla HTML/CSS/JavaScript (ไม่ใช้ framework) |
| Font | Sarabun (Thai) |

---

## โครงสร้างไฟล์

```
tulip-mansion/
├── package.json
├── server.js              # Express API server
├── database.js            # sql.js wrapper + Schema + Seed
├── .gitignore
├── README.md
├── uploads/               # ไฟล์ที่ผู้ใช้อัปโหลด (gitignored)
└── public/
    ├── index.html         # Login page
    ├── admin.html         # Admin dashboard
    ├── staff.html         # Staff dashboard (7 modules)
    ├── resident.html      # Resident view
    ├── img/
    │   └── qr-payment.jpg (วางเอง)
    ├── css/
    │   └── style.css
    └── js/
        ├── common.js      # Shared auth & utilities
        └── staff.js       # Staff dashboard logic
```

---

## Data Validation Constraints (DVC)

ระบบมี Validation ครบทุกจุด:
- Username/Room number ไม่ซ้ำ
- Password ต้องมีพิมพ์ใหญ่+เล็ก+เลข อย่างน้อย 8 ตัว
- เลขมิเตอร์ปัจจุบัน ≥ ครั้งก่อน + เตือนเมื่อใช้เกิน 100 หน่วย
- วันสิ้นสุดสัญญา > วันเริ่ม + ระยะเวลา ≥ 1 ปี
- มัดจำ = ค่าเช่า × 1
- ตรวจห้องว่างก่อนทำสัญญา (ป้องกันสัญญาซ้อน)
- Duplicate Check บิลรายเดือน
- วันที่ชำระห้ามเป็นอนาคต
- File upload จำกัด 5MB + image only

---

## หมายเหตุ

- ฐานข้อมูลถูกสร้างเป็นไฟล์ `tulip_mansion.db` (gitignored)
- รูปอัปโหลดเก็บใน `uploads/` (gitignored)
- หากต้องการ reset ข้อมูล: ลบ `tulip_mansion.db` แล้วรัน `npm run init-db` ใหม่
- Default port: 3000 (เปลี่ยนได้ผ่าน env `PORT`)

---

## License

MIT License - ใช้ได้ฟรี
