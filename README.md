# 🩺 CarePlus Diagnostic Center - Patient Test POS, Billing & Lab Management System

A high-speed, modern Point of Sale (POS), patient billing, and laboratory information desk system designed specifically for diagnostic centers, pathology laboratories, and clinical consultation facilities.

Built with **Node.js 22 native modules** (`node:sqlite`, `node:http`), zero external npm dependencies, pure reactive JavaScript, and print-ready stylesheets for **80mm POS thermal receipt printers**, **A4 diagnostic money receipts**, **clinical laboratory test reports**, and **cashier day-end shift closure slips**.

---

## 🚀 Key Features

### 1. Front Desk & Counter Billing (⚡ `F1`)
- **Fast Patient Intake & Auto-Lookup:** Quick-search existing patients by phone number, patient ID (MRN), or name. Automatically fills patient demographics.
- **Categorized Test Catalog:** Instant filtering across **Pathology & Hematology**, **Biochemistry**, **Serology & Immunology**, **Clinical Pathology**, **Radiology & Digital Imaging**, and **Cardiology**.
- **🎁 Health Checkup Bundles / Packages:** Pre-configured discounted bundles (e.g., Executive Health Checkup, Diabetic Care Profile, Cardiac Wellness, Acute Fever & Dengue Screen, Maternity Profile). Adding a package automatically bundles the tests and applies the bundle discount!
- **Real-Time Search:** Live filter by test code (e.g. `CBC`, `RBS`, `LIPID`, `XRAY`, `ECG`) or name.
- **Dynamic Cart & Calculations:** Real-time computation of Subtotal, Urgent/Emergency surcharge (+15%), Concessions/Discounts (% or Flat), Net Payable, and Due amount.
- **Multi-Payment Modes:** Cash, bKash, Nagad, Rocket, or Card with transaction ID logging.
- **Quick-Cash Counter Keypad:** 1-click buttons for exact net, ৳500, ৳1,000, ৳2,000 with real-time change or due calculation.

### 2. Dual Printable Invoices & QR Verification
- **80mm POS Thermal Receipt:** Compact, high-contrast thermal layout with clinic branding, patient details, itemized investigations, delivery schedule, and scannable Code 128 barcode & QR code.
- **A4 Diagnostic Money Receipt & Lab Token:** Full professional letterhead with specimen collection barcodes, tear-off phlebotomy tube labels (EDTA, Clot Activator, Fluoride, Urine cup), room locations, and authorized signature.
- **Zero-Dependency Barcode & QR Generator:** Generates crisp Code 128-B SVG barcodes and verification QR codes natively in the browser without external libraries or CDN access.

### 3. Patient Invoice & Due Management (📋 `F2`)
- Filter by date, test status, dues, or search terms.
- **Due Collection Workflow:** Front desk can accept partial payment at registration and collect remaining due balance when the patient arrives for report delivery, issuing an updated paid receipt.
- **📥 CSV Data Export:** One-click export of patient invoices to CSV for spreadsheet accounting.

### 4. Laboratory Requisition & Result Entry (🔬 `F3`)
- Live lifecycle state tracking:
  - `Sample Pending` ➔ `Sample Collected` ➔ `In Testing` ➔ `Ready for Delivery` ➔ `Delivered`.
- **📝 Clinical Result Entry:** Lab technicians can enter observed values for test parameters (e.g. Hemoglobin, Total WBC, Platelets, Fasting Glucose, Serum Creatinine, Cholesterol, SGPT, Urine microscopic findings).
- **📄 Printable Clinical Pathology Report:** Generates an official publication-grade Diagnostic Laboratory Report complete with biological reference intervals, abnormal result highlights, and consultant pathologist sign-off blocks.

### 5. Daily Close Register & Doctor Referral Commission Ledger (📊 `F4`)
- **Financial Reconciliation:** Gross sales, discounts authorized, net revenue, cash in drawer, digital MFS (bKash/Nagad), and outstanding dues.
- **Doctor Commission Ledger:** Calculates referral fees per doctor based on their agreed commission percentage (e.g., 10%, 15%, 20%).
- **📥 CSV Commission Export:** Export referral ledger to CSV for doctor payout reconciliation.
- **🖨️ Cashier Day-End Shift Handover Slip:** Print counter handover slips with opening float, physical cash total, and manager sign-off.

### 6. Settings & Customization (⚙️ `F5`)
- Center Name, Tagline, Address, Hotlines, DGHS License number, Currency symbol, and Receipt terms.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `F1` | Switch to **POS Billing** desk |
| `F2` | Switch to **Invoices & Due Ledger** |
| `F3` | Switch to **Lab Status & Result Entry** |
| `F4` | Switch to **Day Close & Doctor Commission** |
| `F5` | Switch to **Settings & Preferences** |
| `Ctrl + Enter` | **Complete Bill & Open Print Dialog** |
| `Esc` | Close any open modal |

---

## 🛠️ Architecture & Tech Stack

- **Runtime:** Node.js (v20+ / v22+)
- **Database:** SQLite via native `node:sqlite` (`diagnostic_pos.db` with WAL mode enabled)
- **Server:** Pure `node:http` REST API with built-in router, auto port-conflict resolution, and static file server
- **Frontend:** Vanilla modern ES modules (`public/js/app.js`), responsive CSS (`public/css/app.css`)
- **Dependencies:** **0 external npm dependencies** (starts instantly, fully offline capable!)

---

## 🏁 Quick Start

### 1. Start the POS Server
```bash
cd /home/mimos/Projects/diagnostic-pos
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** (or the port displayed in terminal) in your web browser.

### 2. Development Mode (with file watcher)
```bash
npm run dev
```

### 3. Run Automated Tests
```bash
npm test
```
Runs the built-in test suite verifying all API routes, billing mathematics, status transitions, result entries, packages, and due collections.
