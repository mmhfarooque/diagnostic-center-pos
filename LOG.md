# CarePlus Diagnostic Center — Patient Test POS & Billing Desk
## Local Engineering & Deployment Log

**Project Location:** `/home/mimos/Projects/diagnostic-pos`  
**GitHub Repository:** [https://github.com/mmhfarooque/diagnostic-center-pos](https://github.com/mmhfarooque/diagnostic-center-pos) (Public, branch `main`)  
**Vercel Production Deployment:** [https://diagnostic-pos.vercel.app](https://diagnostic-pos.vercel.app)  
**Vercel Project:** `farooque7-9785/diagnostic-pos`  
**Last Updated:** 20 November 2026

---

### 1. Executive Summary & Architecture

A high-performance, touch-first Diagnostic Center Patient Test Point of Sale (POS), billing, and clinical pathology workflow system built specifically for 14-inch touchscreen monitors, tablets, and hospital reception counters.

- **Frontend:** Pure vanilla JavaScript ES Modules, zero build dependencies, touch-optimized UX (minimum 48px hit areas, 3D active tactile states), Dual Mode (Day Shift Light & Clinical OLED Night Shift Dark), synthesized Web Audio API sound feedback engine.
- **Backend:** Node.js 22 built-in `node:http` and native `node:sqlite` (`DatabaseSync`), custom regex-based HTTP router (`src/router.js`), JSON-LD/REST endpoints, JWT authentication, and PIN switching.
- **Database Architecture:**
  - Local / Self-Hosted: Node.js 22 native SQLite with WAL journal mode. Automatically falls back to `/tmp/diagnostic_pos.db` on serverless environments (Vercel).
  - Cloud / Enterprise: MongoDB Atlas cluster support via dynamic Mongoose loader (`src/config/mongo.js`, `src/models/MongoModels.js`) targeting `cluster0.lfzluek.mongodb.net/diagnostic_pos`.
- **Printing Engine:** Native in-browser thermal and laser print stylesheets with Code 128-B SVG barcode generator (`public/js/barcode.js`) and SVG QR code generator (`public/js/qrcode.js`).

---

### 2. User Roles & Default Counter Credentials

| Role | Default User | PIN | Email | Password | Primary Interface |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Admin** | Dr. Mahmud Farooque | `9999` | `admin@careplus.com` | `Admin@1234` | Full System & Financial Controls |
| **Operator / Cashier** | Rehana Begum (Counter 1) | `1234` | `cashier@careplus.com` | `Cashier@1234` | Front-Desk Touch Billing Desk |
| **Lab Technologist** | Kamrul Hassan | `5678` | `lab@careplus.com` | `Lab@1234` | Clinical Findings & Pathology Reports |

---

### 3. Core Features & Workflow Capabilities

1. **Express Patient Intake Strip:**
   - Single-line compact layout freeing up 140px of vertical space for the test catalog.
   - 1-tap phone lookup with automatic **Returning Patient Detection** (`✨ Found: [Name] - Tap to Autofill`).
   - 1-tap tactile gender segmented control (👨 Male, 👩 Female, 👶 Child).
   - Referred doctor selection with live commission calculation.
   - Collapsible `+ Details` drawer for patient address and clinical notes.

2. **⚡ Fast Rush Shelf (Peak Morning Hours):**
   - 8 one-tap rapid tiles directly at the top of the catalog for 3-second routine checkup billing:
     - `CBC + ESR (৳400)`
     - `Fasting Glucose FBS (৳150)`
     - `Lipid Profile (৳1,000)`
     - `Serum Creatinine (৳350)`
     - `Serum SGPT/ALT (৳350)`
     - `Urine R/M/E (৳250)`
     - `Dengue NS1 Antigen (৳450)`
     - `ECG 12-Lead Computerized (৳400)`

3. **Universal Specimen Tube Color Language:**
   - Visual phlebotomy vacutainer tube cap indicators on every test tile:
     - 🟣 Purple Dot (`#9333ea`) = EDTA (CBC, HbA1c, Blood Group, Platelet)
     - ⚪ Grey Dot (`#64748b`) = Fluoride (FBS, 2HABF, RBS Glucose)
     - 🟡 Gold Dot (`#eab308`) = Serum SST Clot Activator (Lipid, Liver, Kidney, Electrolytes)
     - 🔵 Blue Dot (`#0284c7`) = Sodium Citrate (PT/INR)
     - 🟠 Amber Dot (`#f97316`) = Sterile Urine / Stool Container
     - 🩻 Cyan Badge (`#06b6d4`) = Radiology & Imaging (X-Ray, USG, Echo, ECG)
   - Displays laboratory room routing (`Room 101 Phlebotomy`, `Room 208 Radiology`) and delivery turnaround (`⚡ 2h`).

4. **Clinical Cashier & Billing Terminal (Right Desk):**
   - **Luminous Digital Grand Net Display:** High-contrast LED display readable from across the counter.
   - **1-Tap Concession Chips:** `[None]`, `[5%]`, `[10%]`, `[15%]`, `[Flat ৳50]`, `[Flat ৳100]`, `[Doctor Ref]`.
   - **Emergency / Urgent Toggle:** iOS-style glowing slider for `+15% Urgent Surcharge`.
   - **Branded Payment Tiles:** 💵 Cash (Emerald), 📱 bKash (`#e2136e` Crimson), 📱 Nagad (`#f7941d` Orange), 💳 Card (Cobalt).
   - **Smart Dynamic Quick-Cash Calculator:** Intelligently calculates round banknote chips based on the net bill, plus real-time change return banner.
   - **Empty-Cart Diagnostic Combos:** 1-tap routine bundles (`Routine Health Checkup`, `Diabetic Duo`, `Dengue & Fever Panel`, `Cardiac Baseline`).
   - **Dual Checkout Triggers:** Primary `Complete & Print 80mm Slip [Ctrl+Enter]` and secondary `📄 A4 Hospital Receipt`.

5. **Diagnostic Money Receipts & Clinical Reports:**
   - 80mm POS Thermal Slip: Patient info, tests, rooms, delivery times, native Code 128 barcode & SVG QR code.
   - A4 Diagnostic Money Receipt: Full hospital header, token strip, due balance tracking.
   - A4 Clinical Pathology Lab Report: Biological reference intervals, abnormal flags (`HIGH`, `LOW`, `CRITICAL`), and digital sign-off blocks.

6. **Due Collection & Audit Ledger:**
   - Dedicated `/invoices` ledger with live filters for date, status, due-only, and keyword search.
   - 1-tap partial and full due collection with instant receipt re-printing.
   - CSV exports for accounting (`/api/export/invoices-csv`).

7. **Shift Closure & Doctor Referral Commission:**
   - Cashier shift closure modal computing gross subtotal, discounts, net collections, cash drawer breakdown, and unpaid dues.
   - Doctor referral commission reports (`/api/reports/doctor-commissions`) with CSV export (`/api/export/commissions-csv`).

---

### 4. Development & Deployment Timeline

#### 20 November 2026 — Milestone 1: Core System Architecture & Engine
- Initialized Node 22 project structure using native `node:sqlite` and zero runtime npm dependencies.
- Seeded clinical database schema: `users`, `departments`, `tests` (40 tests across 7 departments), `packages`, `test_parameters`, `doctors`, `patients`, `invoices`, `payments`, `settings`.
- Built REST API endpoints covering auth, catalog, cart calculation, invoices, due payments, results entry, and CSV exports.
- Integration test suite written (`tests/api.test.js`) with 11 tests passing in ~45ms.
- Remote repository created and pushed: `https://github.com/mmhfarooque/diagnostic-center-pos`.

#### 20 November 2026 — Milestone 2: Cloud Database & Vercel Production
- Added MongoDB Atlas dynamic Mongoose integration (`src/config/mongo.js`, `src/models/MongoModels.js`) with fail-safe fallback to local SQLite.
- Deployed production build on Vercel at `https://diagnostic-pos.vercel.app`.
- Configured production environment variables (`MONGODB_URI`, `JWT_SECRET`).
- Resolved Vercel serverless bundling of dynamic dependencies in `package.json`.

#### 20 November 2026 — Milestone 3: World-Class Touch POS UI/UX Overhaul
- Transformed UI from a basic web form into a hospital-grade Touch POS terminal.
- Introduced **Fast Rush Shelf** for 3-second routine walk-in billing.
- Implemented **Specimen Tube Color Language** with phlebotomy cap indicators.
- Added **Hospital Night Shift Mode (Clinical OLED Dark Theme)** with 1-tap header toggle and `localStorage` persistence.
- Built native **Web Audio API Synthesizer** for tactile click, affirmative addition, removal pop, and cash register completion chimes.
- Streamlined **Express Patient Intake Strip** doubling vertical catalog real estate.
- Redesigned **Financial Cashier Terminal** with digital LED net readout, branded payment buttons, 1-tap discount chips, dynamic quick cash, and dual print triggers.
- Verified live deployment and committed all updates to GitHub and Vercel.
