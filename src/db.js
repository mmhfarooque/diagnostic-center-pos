import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'diagnostic_pos.db');

export function initDatabase(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for concurrency
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Create core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id),
      price REAL NOT NULL,
      specimen TEXT NOT NULL,
      sample_tube TEXT,
      room_no TEXT,
      delivery_hours REAL NOT NULL DEFAULT 4,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      package_price REAL NOT NULL,
      regular_price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS package_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      unit TEXT,
      ref_range_male TEXT,
      ref_range_female TEXT,
      default_value TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      degrees TEXT,
      designation TEXT,
      phone TEXT,
      commission_percent REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_uid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      age_unit TEXT NOT NULL DEFAULT 'Y',
      gender TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      doctor_id INTEGER NOT NULL REFERENCES doctors(id),
      subtotal REAL NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'NONE',
      discount_value REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      discount_remark TEXT,
      urgent_surcharge REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL,
      paid_amount REAL NOT NULL,
      due_amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      payment_reference TEXT,
      status TEXT NOT NULL DEFAULT 'SAMPLE_PENDING',
      delivery_date TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      test_id INTEGER NOT NULL REFERENCES tests(id),
      test_code TEXT NOT NULL,
      test_name TEXT NOT NULL,
      department_name TEXT NOT NULL,
      price REAL NOT NULL,
      room_no TEXT,
      specimen TEXT,
      delivery_time TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      invoice_item_id INTEGER NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
      parameter_id INTEGER REFERENCES test_parameters(id),
      parameter_name TEXT NOT NULL,
      result_value TEXT NOT NULL,
      unit TEXT,
      reference_range TEXT,
      flag TEXT DEFAULT 'NORMAL',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      payment_type TEXT NOT NULL DEFAULT 'INITIAL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_doctor ON invoices(doctor_id);
  `);

  // Seed Settings
  const settingCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingCount.count === 0) {
    const defaultSettings = [
      ['center_name', 'CarePlus Diagnostic & Consultation Centre'],
      ['tagline', 'Accurate Diagnostics • Compassionate Care'],
      ['address', 'House #42, Road #11, Dhanmondi, Dhaka-1209'],
      ['phone', '+880 1711-000222, +880 2-9876543'],
      ['license_no', 'DGHS-REG-2024-8849'],
      ['currency_symbol', '৳'],
      ['currency_code', 'BDT'],
      ['invoice_prefix', 'CPD'],
      ['sample_token_prefix', 'SMP'],
      ['vat_percent', '0'],
      ['report_delivery_hours_default', '4'],
      ['thermal_printer_width', '80mm'],
      ['notice', 'Please bring this money receipt while collecting your test report. Reports are available between 5:00 PM and 10:00 PM.']
    ];
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v);
    }
  }

  // Seed Departments
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get();
  if (deptCount.count === 0) {
    const departments = [
      ['Hematology & Pathology', 'Blood cell counts, blood grouping, coagulopathy'],
      ['Biochemistry', 'Blood sugars, kidney, liver, lipids, electrolytes'],
      ['Serology & Immunology', 'Viral markers, infectious serology, antibody tests'],
      ['Clinical Pathology', 'Urine and stool routine examinations, body fluids'],
      ['Radiology & Imaging', 'Digital X-Rays, 4D Ultrasound, Color Doppler'],
      ['Cardiology & Neurology', '12-lead ECG, 2D Echo, EEG, ETT']
    ];
    const insertDept = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
    for (const [name, desc] of departments) {
      insertDept.run(name, desc);
    }
  }

  // Seed Tests
  const testCount = db.prepare('SELECT COUNT(*) as count FROM tests').get();
  if (testCount.count === 0) {
    const depts = db.prepare('SELECT id, name FROM departments').all();
    const deptMap = Object.fromEntries(depts.map(d => [d.name, d.id]));

    const catalog = [
      // Hematology
      { code: 'CBC-01', name: 'Complete Blood Count (CBC) with ESR', dept: 'Hematology & Pathology', price: 400, specimen: 'Blood (EDTA)', tube: 'Purple (EDTA)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'BG-01', name: 'Blood Grouping & Rh Factor', dept: 'Hematology & Pathology', price: 150, specimen: 'Blood (EDTA)', tube: 'Purple (EDTA)', room: 'Room 101 - Phlebotomy', hours: 1 },
      { code: 'PBF-01', name: 'Peripheral Blood Film (PBF)', dept: 'Hematology & Pathology', price: 500, specimen: 'Blood (EDTA Slide)', tube: 'Purple (EDTA)', room: 'Room 101 - Phlebotomy', hours: 4 },
      { code: 'PT-01', name: 'Prothrombin Time with INR (PT/INR)', dept: 'Hematology & Pathology', price: 650, specimen: 'Blood (Citrate)', tube: 'Blue (Sodium Citrate)', room: 'Room 101 - Phlebotomy', hours: 3 },
      { code: 'PLT-01', name: 'Platelet Count (Manual & Machine)', dept: 'Hematology & Pathology', price: 200, specimen: 'Blood (EDTA)', tube: 'Purple (EDTA)', room: 'Room 101 - Phlebotomy', hours: 1 },

      // Biochemistry
      { code: 'FBS-01', name: 'Fasting Blood Sugar (FBS)', dept: 'Biochemistry', price: 150, specimen: 'Blood (Fluoride)', tube: 'Grey (Fluoride)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'RBS-01', name: 'Random Blood Sugar (RBS)', dept: 'Biochemistry', price: 150, specimen: 'Blood (Fluoride/Clot)', tube: 'Grey / Yellow', room: 'Room 101 - Phlebotomy', hours: 1 },
      { code: '2ABF-01', name: '2 Hours After Breakfast (2HABF) Glucose', dept: 'Biochemistry', price: 150, specimen: 'Blood (Fluoride)', tube: 'Grey (Fluoride)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'HBA1C-01', name: 'Glycated Hemoglobin (HbA1c)', dept: 'Biochemistry', price: 800, specimen: 'Blood (EDTA)', tube: 'Purple (EDTA)', room: 'Room 101 - Phlebotomy', hours: 4 },
      { code: 'CREAT-01', name: 'Serum Creatinine (with eGFR)', dept: 'Biochemistry', price: 350, specimen: 'Blood (Serum Clot)', tube: 'Yellow / Red (SST)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'LIPID-01', name: 'Lipid Profile (Chol, TG, HDL, LDL)', dept: 'Biochemistry', price: 1000, specimen: 'Blood (Fasting Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 4 },
      { code: 'SGPT-01', name: 'Serum ALT / SGPT', dept: 'Biochemistry', price: 350, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'SGOT-01', name: 'Serum AST / SGOT', dept: 'Biochemistry', price: 350, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'BIL-01', name: 'Serum Bilirubin (Total, Direct & Indirect)', dept: 'Biochemistry', price: 400, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'ELEC-01', name: 'Serum Electrolytes (Na+, K+, Cl-)', dept: 'Biochemistry', price: 900, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 3 },
      { code: 'URIC-01', name: 'Serum Uric Acid', dept: 'Biochemistry', price: 400, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 2 },
      { code: 'LFT-01', name: 'Liver Function Test (Comprehensive)', dept: 'Biochemistry', price: 1200, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 101 - Phlebotomy', hours: 4 },

      // Serology & Immunology
      { code: 'DENG-01', name: 'Dengue NS1 Antigen (Rapid/ELISA)', dept: 'Serology & Immunology', price: 450, specimen: 'Blood (Serum)', tube: 'Yellow / Red', room: 'Room 102 - Serology', hours: 1 },
      { code: 'DENG-02', name: 'Dengue Antibody IgG & IgM', dept: 'Serology & Immunology', price: 600, specimen: 'Blood (Serum)', tube: 'Yellow / Red', room: 'Room 102 - Serology', hours: 1.5 },
      { code: 'WIDAL-01', name: 'Widal Test (Typhoid Serology)', dept: 'Serology & Immunology', price: 350, specimen: 'Blood (Serum)', tube: 'Yellow / Red', room: 'Room 102 - Serology', hours: 2 },
      { code: 'HBSAG-01', name: 'HBsAg (Hepatitis B Surface Antigen)', dept: 'Serology & Immunology', price: 400, specimen: 'Blood (Serum)', tube: 'Yellow / Red', room: 'Room 102 - Serology', hours: 2 },
      { code: 'HCV-01', name: 'Anti-HCV (Hepatitis C Antibody)', dept: 'Serology & Immunology', price: 600, specimen: 'Blood (Serum)', tube: 'Yellow / Red', room: 'Room 102 - Serology', hours: 2 },
      { code: 'TSH-01', name: 'Thyroid Stimulating Hormone (TSH)', dept: 'Serology & Immunology', price: 600, specimen: 'Blood (Serum)', tube: 'Yellow (SST Gel)', room: 'Room 102 - Serology', hours: 4 },
      { code: 'THY-01', name: 'Thyroid Panel (TSH, FT4, FT3)', dept: 'Serology & Immunology', price: 1500, specimen: 'Blood (Serum)', tube: 'Yellow (SST Gel)', room: 'Room 102 - Serology', hours: 6 },
      { code: 'CRP-01', name: 'C-Reactive Protein (CRP Quantitative)', dept: 'Serology & Immunology', price: 650, specimen: 'Blood (Serum)', tube: 'Yellow (SST Gel)', room: 'Room 102 - Serology', hours: 2 },
      { code: 'TROP-01', name: 'Troponin-I (Quantitative / Cardiac)', dept: 'Serology & Immunology', price: 1200, specimen: 'Blood (Serum/Whole)', tube: 'Yellow / Green', room: 'Room 102 - Serology', hours: 1 },
      { code: 'VITD-01', name: 'Vitamin D (25-Hydroxy)', dept: 'Serology & Immunology', price: 2200, specimen: 'Blood (Serum Clot)', tube: 'Yellow (SST Gel)', room: 'Room 102 - Serology', hours: 24 },

      // Clinical Pathology
      { code: 'URINE-01', name: 'Urine Routine & Microscopic (R/M/E)', dept: 'Clinical Pathology', price: 250, specimen: 'Spot Clean Urine', tube: 'Sterile Urine Cup', room: 'Room 103 - Sample Drop', hours: 2 },
      { code: 'STOOL-01', name: 'Stool Routine & Microscopic (R/M/E)', dept: 'Clinical Pathology', price: 250, specimen: 'Stool Specimen', tube: 'Stool Container', room: 'Room 103 - Sample Drop', hours: 2 },
      { code: 'UC-01', name: 'Urine Culture & Sensitivity (C/S)', dept: 'Clinical Pathology', price: 650, specimen: 'Mid-stream Urine', tube: 'Sterile Culture Cup', room: 'Room 103 - Sample Drop', hours: 48 },

      // Radiology & Imaging
      { code: 'XRAY-01', name: 'Digital X-Ray Chest P/A View', dept: 'Radiology & Imaging', price: 600, specimen: 'None', tube: 'N/A', room: 'Room 201 - Digital X-Ray', hours: 2 },
      { code: 'XRAY-02', name: 'Digital X-Ray KUB View', dept: 'Radiology & Imaging', price: 700, specimen: 'None', tube: 'N/A', room: 'Room 201 - Digital X-Ray', hours: 2 },
      { code: 'XRAY-03', name: 'Digital X-Ray Cervical Spine (B/V)', dept: 'Radiology & Imaging', price: 800, specimen: 'None', tube: 'N/A', room: 'Room 201 - Digital X-Ray', hours: 2 },
      { code: 'XRAY-04', name: 'Digital X-Ray Lumbosacral Spine (B/V)', dept: 'Radiology & Imaging', price: 800, specimen: 'None', tube: 'N/A', room: 'Room 201 - Digital X-Ray', hours: 2 },
      { code: 'USG-01', name: 'USG of Whole Abdomen (with PVR)', dept: 'Radiology & Imaging', price: 1400, specimen: 'Full Bladder', tube: 'N/A', room: 'Room 204 - Ultrasonography', hours: 2 },
      { code: 'USG-02', name: 'USG of Lower Abdomen', dept: 'Radiology & Imaging', price: 1000, specimen: 'Full Bladder', tube: 'N/A', room: 'Room 204 - Ultrasonography', hours: 2 },
      { code: 'USG-03', name: 'USG of Pregnancy Profile (Anomaly)', dept: 'Radiology & Imaging', price: 1300, specimen: 'None', tube: 'N/A', room: 'Room 204 - Ultrasonography', hours: 2 },
      { code: 'USG-04', name: 'USG of Thyroid / Neck Region', dept: 'Radiology & Imaging', price: 1200, specimen: 'None', tube: 'N/A', room: 'Room 204 - Ultrasonography', hours: 2 },

      // Cardiology & Neurology
      { code: 'ECG-01', name: 'ECG 12-Lead Computerized', dept: 'Cardiology & Neurology', price: 400, specimen: 'None', tube: 'N/A', room: 'Room 208 - ECG & Echo', hours: 0.5 },
      { code: 'ECHO-01', name: '2D Color Doppler Echocardiography', dept: 'Cardiology & Neurology', price: 2500, specimen: 'None', tube: 'N/A', room: 'Room 208 - ECG & Echo', hours: 2 }
    ];

    const insertTest = db.prepare(`
      INSERT INTO tests (code, name, department_id, price, specimen, sample_tube, room_no, delivery_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of catalog) {
      const deptId = deptMap[t.dept];
      if (deptId) {
        insertTest.run(t.code, t.name, deptId, t.price, t.specimen, t.tube, t.room, t.hours);
      }
    }
  }

  // Seed Test Parameters for Report Generation
  const paramCount = db.prepare('SELECT COUNT(*) as count FROM test_parameters').get();
  if (paramCount.count === 0) {
    const cbc = db.prepare("SELECT id FROM tests WHERE code = 'CBC-01'").get();
    const creat = db.prepare("SELECT id FROM tests WHERE code = 'CREAT-01'").get();
    const fbs = db.prepare("SELECT id FROM tests WHERE code = 'FBS-01'").get();
    const lipid = db.prepare("SELECT id FROM tests WHERE code = 'LIPID-01'").get();
    const sgpt = db.prepare("SELECT id FROM tests WHERE code = 'SGPT-01'").get();
    const urine = db.prepare("SELECT id FROM tests WHERE code = 'URINE-01'").get();

    const insertParam = db.prepare(`
      INSERT INTO test_parameters (test_id, name, unit, ref_range_male, ref_range_female, default_value, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (cbc) {
      const cbcParams = [
        ['Hemoglobin (Hb%)', 'g/dL', '13.0 - 17.0', '11.5 - 15.5', '14.2', 1],
        ['ESR (Westergren method)', 'mm in 1st hr', '0 - 10', '0 - 20', '12', 2],
        ['Total WBC Count (TC)', '/cumm', '4,000 - 11,000', '4,000 - 11,000', '7,800', 3],
        ['Platelet Count', '/cumm', '150,000 - 450,000', '150,000 - 450,000', '240,000', 4],
        ['Neutrophils', '%', '40 - 75', '40 - 75', '62', 5],
        ['Lymphocytes', '%', '20 - 45', '20 - 45', '30', 6],
        ['Eosinophils', '%', '01 - 06', '01 - 06', '04', 7],
        ['Monocytes', '%', '02 - 08', '02 - 08', '04', 8]
      ];
      for (const p of cbcParams) insertParam.run(cbc.id, ...p);
    }

    if (creat) {
      insertParam.run(creat.id, 'Serum Creatinine', 'mg/dL', '0.7 - 1.3', '0.5 - 1.1', '0.95', 1);
      insertParam.run(creat.id, 'Estimated GFR (eGFR)', 'mL/min/1.73m²', '> 90 (Normal)', '> 90 (Normal)', '95', 2);
    }

    if (fbs) {
      insertParam.run(fbs.id, 'Fasting Plasma Glucose', 'mmol/L', '3.9 - 6.0 (Normal)', '3.9 - 6.0 (Normal)', '5.4', 1);
    }

    if (lipid) {
      insertParam.run(lipid.id, 'Total Cholesterol', 'mg/dL', '< 200 (Desirable)', '< 200 (Desirable)', '185', 1);
      insertParam.run(lipid.id, 'Triglycerides', 'mg/dL', '< 150 (Normal)', '< 150 (Normal)', '140', 2);
      insertParam.run(lipid.id, 'HDL Cholesterol (Good)', 'mg/dL', '> 40', '> 50', '46', 3);
      insertParam.run(lipid.id, 'LDL Cholesterol (Bad)', 'mg/dL', '< 100 (Optimal)', '< 100 (Optimal)', '92', 4);
    }

    if (sgpt) {
      insertParam.run(sgpt.id, 'Serum ALT / SGPT', 'U/L', 'Up to 45', 'Up to 34', '28', 1);
    }

    if (urine) {
      insertParam.run(urine.id, 'Color', '', 'Pale Yellow / Straw', 'Pale Yellow / Straw', 'Straw', 1);
      insertParam.run(urine.id, 'Transparency', '', 'Clear', 'Clear', 'Clear', 2);
      insertParam.run(urine.id, 'Albumin / Protein', '', 'Nil', 'Nil', 'Nil', 3);
      insertParam.run(urine.id, 'Sugar', '', 'Nil', 'Nil', 'Nil', 4);
      insertParam.run(urine.id, 'Pus Cells', '/HPF', '0 - 5', '0 - 5', '1 - 2', 5);
      insertParam.run(urine.id, 'RBC (Red Blood Cells)', '/HPF', 'Nil', 'Nil', 'Nil', 6);
      insertParam.run(urine.id, 'Epithelial Cells', '/HPF', '0 - 2', '0 - 4', '1 - 2', 7);
    }
  }

  // Seed Health Checkup Packages
  const pkgCount = db.prepare('SELECT COUNT(*) as count FROM packages').get();
  if (pkgCount.count === 0) {
    const packages = [
      {
        code: 'PKG-EXEC',
        name: 'Executive Health Checkup Package',
        desc: 'Comprehensive annual checkup covering blood, liver, kidney, heart, and abdominal scan',
        reg: 4350,
        pkg: 3400,
        tests: ['CBC-01', 'FBS-01', 'LIPID-01', 'CREAT-01', 'SGPT-01', 'URINE-01', 'ECG-01', 'USG-01']
      },
      {
        code: 'PKG-DIAB',
        name: 'Comprehensive Diabetic Care Profile',
        desc: 'Full diabetes evaluation including HbA1c, fasting sugars, kidney, and lipid panel',
        reg: 2700,
        pkg: 2100,
        tests: ['FBS-01', '2ABF-01', 'HBA1C-01', 'CREAT-01', 'LIPID-01', 'URINE-01']
      },
      {
        code: 'PKG-CARD',
        name: 'Cardiac Wellness Screening',
        desc: 'Advanced heart health checkup with 2D Echo, ECG, cardiac enzymes, and electrolytes',
        reg: 6000,
        pkg: 4800,
        tests: ['ECG-01', 'ECHO-01', 'LIPID-01', 'TROP-01', 'ELEC-01']
      },
      {
        code: 'PKG-FEV',
        name: 'Acute Fever & Dengue Screen',
        desc: 'Rapid workup for viral fevers, dengue antigen/antibodies, and typhoid serology',
        reg: 2100,
        pkg: 1650,
        tests: ['CBC-01', 'DENG-01', 'DENG-02', 'WIDAL-01', 'URINE-01']
      },
      {
        code: 'PKG-ANT',
        name: 'Antenatal / Maternity Care Profile',
        desc: 'Essential routine screening tests for pregnant mothers and fetal wellbeing',
        reg: 2650,
        pkg: 2100,
        tests: ['BG-01', 'CBC-01', 'RBS-01', 'HBSAG-01', 'URINE-01', 'USG-03']
      }
    ];

    const insertPkg = db.prepare(`
      INSERT INTO packages (code, name, description, regular_price, package_price)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertPkgItem = db.prepare(`
      INSERT INTO package_items (package_id, test_id) VALUES (?, ?)
    `);

    for (const p of packages) {
      const res = insertPkg.run(p.code, p.name, p.desc, p.reg, p.pkg);
      const pkgId = res.lastInsertRowid;
      for (const tCode of p.tests) {
        const test = db.prepare('SELECT id FROM tests WHERE code = ?').get(tCode);
        if (test) insertPkgItem.run(pkgId, test.id);
      }
    }
  }

  // Seed Doctors
  const docCount = db.prepare('SELECT COUNT(*) as count FROM doctors').get();
  if (docCount.count === 0) {
    const doctors = [
      ['Self / Direct Walk-in', '', 'General Reception', '', 0],
      ['Prof. Dr. M. A. Rahman', 'MBBS, FCPS, MD (Medicine)', 'Prof. of Internal Medicine, DMC', '+880 1711-234567', 15],
      ['Dr. Farhana Yasmin', 'MBBS, DGO, MCPS (Obs & Gynae)', 'Consultant Gynecologist, BSMMU', '+880 1819-345678', 15],
      ['Dr. Kazi Tanvir Ahmed', 'MBBS, MD (Cardiology)', 'Cardiology Specialist, NICVD', '+880 1912-456789', 20],
      ['Dr. Nazmul Huda', 'MBBS, MS (Ortho)', 'Orthopedic Surgeon, NITOR', '+880 1552-567890', 15],
      ['Dr. Shamima Nasrin', 'MBBS, FCPS (Pediatrics)', 'Associate Prof. of Pediatrics, Shishu Hospital', '+880 1712-678901', 10],
      ['Dr. Tariqul Islam', 'MBBS, MD (Endocrinology)', 'Diabetes & Endocrine Specialist, BIRDEM', '+880 1681-789012', 15]
    ];

    const insertDoc = db.prepare(`
      INSERT INTO doctors (name, degrees, designation, phone, commission_percent)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [name, deg, des, phone, comm] of doctors) {
      insertDoc.run(name, deg, des, phone, comm);
    }
  }

  // Seed sample patients and invoices if empty
  const invCount = db.prepare('SELECT COUNT(*) as count FROM invoices').get();
  if (invCount.count === 0) {
    const samplePatients = [
      { uid: 'P-10001', name: 'Md. Rafiqul Islam', age: 48, gender: 'MALE', phone: '01712345678', address: 'House 14, Sector 7, Uttara, Dhaka' },
      { uid: 'P-10002', name: 'Mrs. Rokeya Sultana', age: 34, gender: 'FEMALE', phone: '01819223344', address: 'Block C, Lalmatia, Dhaka' },
      { uid: 'P-10003', name: 'Tanvir Hossain', age: 29, gender: 'MALE', phone: '01911445566', address: 'Mirpur-2, Dhaka' },
      { uid: 'P-10004', name: 'Kazi Faruk Ahmed', age: 62, gender: 'MALE', phone: '01688778899', address: 'Gulshan-1, Dhaka' },
      { uid: 'P-10005', name: 'Tasnim Jahan', age: 26, gender: 'FEMALE', phone: '01755112233', address: 'Dhanmondi 8/A, Dhaka' }
    ];

    const insertPatient = db.prepare(`
      INSERT INTO patients (patient_uid, name, age, age_unit, gender, phone, address)
      VALUES (?, ?, ?, 'Y', ?, ?, ?)
    `);

    for (const sp of samplePatients) {
      insertPatient.run(sp.uid, sp.name, sp.age, sp.gender, sp.phone, sp.address);
    }

    const p1 = db.prepare("SELECT id FROM patients WHERE patient_uid = 'P-10001'").get().id;
    const p2 = db.prepare("SELECT id FROM patients WHERE patient_uid = 'P-10002'").get().id;
    const p3 = db.prepare("SELECT id FROM patients WHERE patient_uid = 'P-10003'").get().id;
    const p4 = db.prepare("SELECT id FROM patients WHERE patient_uid = 'P-10004'").get().id;
    const p5 = db.prepare("SELECT id FROM patients WHERE patient_uid = 'P-10005'").get().id;

    const docRahman = db.prepare("SELECT id FROM doctors WHERE name LIKE '%Rahman%'").get().id;
    const docFarhana = db.prepare("SELECT id FROM doctors WHERE name LIKE '%Farhana%'").get().id;
    const docTanvir = db.prepare("SELECT id FROM doctors WHERE name LIKE '%Tanvir%'").get().id;

    const insertInvoice = db.prepare(`
      INSERT INTO invoices (
        invoice_no, patient_id, doctor_id, subtotal, discount_type, discount_value,
        discount_amount, discount_remark, urgent_surcharge, net_amount, paid_amount,
        due_amount, payment_method, payment_reference, status, delivery_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, test_id, test_code, test_name, department_name, price, room_no, specimen, delivery_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPay = db.prepare(`
      INSERT INTO payments (invoice_id, amount, payment_method, payment_reference, payment_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `CPD-${yy}${mm}${dd}`;

    // Invoice 1: CBC + Lipid (Sample Collected, Partial Due)
    const inv1Res = insertInvoice.run(
      `${prefix}-001`, p1, docRahman, 1400, 'FLAT', 100, 100, 'Doctor recommendation', 0, 1300, 1000, 300, 'CASH', '', 'SAMPLE_COLLECTED', 'Today 6:00 PM', 'Fasting sample given'
    );
    const cbc = db.prepare("SELECT * FROM tests WHERE code = 'CBC-01'").get();
    const lipid = db.prepare("SELECT * FROM tests WHERE code = 'LIPID-01'").get();
    insertItem.run(inv1Res.lastInsertRowid, cbc.id, cbc.code, cbc.name, 'Hematology & Pathology', cbc.price, cbc.room_no, cbc.specimen, '6:00 PM');
    insertItem.run(inv1Res.lastInsertRowid, lipid.id, lipid.code, lipid.name, 'Biochemistry', lipid.price, lipid.room_no, lipid.specimen, '7:30 PM');
    insertPay.run(inv1Res.lastInsertRowid, 1000, 'CASH', '', 'INITIAL');

    // Invoice 2: Dengue NS1 + CBC (Ready for delivery, Full Paid bKash)
    const inv2Res = insertInvoice.run(
      `${prefix}-002`, p2, docFarhana, 850, 'NONE', 0, 0, '', 0, 850, 850, 0, 'BKASH', 'TRX998811', 'READY', 'Today 4:00 PM', 'Acute high fever since 3 days'
    );
    const deng = db.prepare("SELECT * FROM tests WHERE code = 'DENG-01'").get();
    const cbcItemRes = insertItem.run(inv2Res.lastInsertRowid, cbc.id, cbc.code, cbc.name, 'Hematology & Pathology', cbc.price, cbc.room_no, cbc.specimen, '4:00 PM');
    insertItem.run(inv2Res.lastInsertRowid, deng.id, deng.code, deng.name, 'Serology & Immunology', deng.price, deng.room_no, deng.specimen, '3:30 PM');
    insertPay.run(inv2Res.lastInsertRowid, 850, 'BKASH', 'TRX998811', 'INITIAL');

    // Seed test results for Invoice 2's CBC so user can print a finished Lab Report immediately!
    const cbcItemId = cbcItemRes.lastInsertRowid;
    const cbcParams = db.prepare('SELECT * FROM test_parameters WHERE test_id = ?').all(cbc.id);
    const insertResult = db.prepare(`
      INSERT INTO test_results (invoice_id, invoice_item_id, parameter_id, parameter_name, result_value, unit, reference_range, flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const param of cbcParams) {
      let val = param.default_value;
      let flag = 'NORMAL';
      if (param.name.includes('Platelet')) {
        val = '110,000'; // Low platelet for dengue!
        flag = 'LOW';
      }
      insertResult.run(inv2Res.lastInsertRowid, cbcItemId, param.id, param.name, val, param.unit, param.ref_range_female, flag);
    }

    // Invoice 3: USG Pregnancy Profile + Blood Group (In Testing, Paid Cash)
    const inv3Res = insertInvoice.run(
      `${prefix}-003`, p5, docFarhana, 1450, 'NONE', 0, 0, '', 0, 1450, 1450, 0, 'CASH', '', 'IN_TESTING', 'Today 7:00 PM', 'Routine 24 weeks checkup'
    );
    const usg3 = db.prepare("SELECT * FROM tests WHERE code = 'USG-03'").get();
    const bg = db.prepare("SELECT * FROM tests WHERE code = 'BG-01'").get();
    insertItem.run(inv3Res.lastInsertRowid, usg3.id, usg3.code, usg3.name, 'Radiology & Imaging', usg3.price, usg3.room_no, usg3.specimen, '7:00 PM');
    insertItem.run(inv3Res.lastInsertRowid, bg.id, bg.code, bg.name, 'Hematology & Pathology', bg.price, bg.room_no, bg.specimen, '5:00 PM');
    insertPay.run(inv3Res.lastInsertRowid, 1450, 'CASH', '', 'INITIAL');

    // Invoice 4: ECG + Echo + Troponin-I (Sample Pending, Urgent surcharge)
    const inv4Res = insertInvoice.run(
      `${prefix}-004`, p4, docTanvir, 4100, 'PERCENT', 10, 410, 'Senior Citizen Privileged Card', 615, 4305, 4305, 0, 'CARD', 'CARD-TX-5511', 'SAMPLE_PENDING', 'Today 5:00 PM', 'Chest pain on exertion'
    );
    const ecg = db.prepare("SELECT * FROM tests WHERE code = 'ECG-01'").get();
    const echo = db.prepare("SELECT * FROM tests WHERE code = 'ECHO-01'").get();
    const trop = db.prepare("SELECT * FROM tests WHERE code = 'TROP-01'").get();
    insertItem.run(inv4Res.lastInsertRowid, ecg.id, ecg.code, ecg.name, 'Cardiology & Neurology', ecg.price, ecg.room_no, ecg.specimen, 'Immediate');
    insertItem.run(inv4Res.lastInsertRowid, echo.id, echo.code, echo.name, 'Cardiology & Neurology', echo.price, echo.room_no, echo.specimen, '5:00 PM');
    insertItem.run(inv4Res.lastInsertRowid, trop.id, trop.code, trop.name, 'Serology & Immunology', trop.price, trop.room_no, trop.specimen, '4:30 PM');
    insertPay.run(inv4Res.lastInsertRowid, 4305, 'CARD', 'CARD-TX-5511', 'INITIAL');
  }

  return db;
}

export const db = initDatabase();
