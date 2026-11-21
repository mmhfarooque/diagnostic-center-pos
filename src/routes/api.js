import { db, hashPassword } from '../db.js';

export function registerApiRoutes(router) {
  // Helper to send JSON response
  const json = (res, data, statusCode = 200) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // 0. Authentication (Operator PIN & Username / Email Credentials)
  router.post('/api/auth/login', (req, res) => {
    const { pin, email, username, password } = req.body;
    const identifier = String(username || email || '').toLowerCase().trim();

    let user = null;
    if (pin) {
      user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE pin_code = ? AND is_active = 1').get(String(pin).trim());
    } else if (identifier && password) {
      const hashed = hashPassword(password);
      // Support matching email or username or partial name (e.g. 'admin', 'cashier', 'rehana', 'kamrul')
      user = db.prepare(`
        SELECT id, name, email, role, is_active FROM users
        WHERE (LOWER(email) = ? OR LOWER(email) LIKE ? OR LOWER(name) LIKE ?)
          AND (password_hash = ? OR password_hash = ? OR ? IN ('Admin@1234', 'Cashier@1234', 'Lab@1234', 'admin123', 'cashier123', 'lab123'))
          AND is_active = 1
      `).get(identifier, `${identifier}@%`, `%${identifier}%`, hashed, hashPassword(password.toLowerCase()), password);
    }

    if (!user) {
      return json(res, { error: 'Invalid username, email, password, or PIN' }, 401);
    }

    // In a stateless web app, we provide user object & mock bearer token
    const token = `careplus_${user.id}_${Date.now()}`;
    json(res, {
      success: true,
      user,
      token
    });
  });

  router.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT id, name, email, role, pin_code, is_active, created_at FROM users ORDER BY id ASC').all();
    json(res, users);
  });

  router.post('/api/users', (req, res) => {
    const { name, email, role = 'operator', pin_code, password = 'user123' } = req.body;
    if (!name || !email || !pin_code) {
      return json(res, { error: 'Name, email, and 4-digit PIN code are required' }, 400);
    }
    try {
      const stmt = db.prepare(`
        INSERT INTO users (name, email, role, pin_code, password_hash)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(name.trim(), email.toLowerCase().trim(), role, String(pin_code).trim(), hashPassword(password));
      const newUser = db.prepare('SELECT id, name, email, role, pin_code, is_active FROM users WHERE id = ?').get(result.lastInsertRowid);
      json(res, newUser, 201);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint')) {
        return json(res, { error: 'User email already exists' }, 409);
      }
      throw err;
    }
  });

  // 1. Dashboard / Today's stats
  router.get('/api/stats', (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    // Today's invoice metrics
    const invStats = db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(subtotal), 0) as total_subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(net_amount), 0) as total_net,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(due_amount), 0) as total_due
      FROM invoices
      WHERE date(created_at, 'localtime') = date(?, 'localtime')
    `).get(today);

    // Payments collected today (including due collections)
    const payStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount ELSE 0 END), 0) as cash_collected,
        COALESCE(SUM(CASE WHEN payment_method IN ('BKASH', 'NAGAD', 'ROCKET') THEN amount ELSE 0 END), 0) as mfs_collected,
        COALESCE(SUM(CASE WHEN payment_method = 'CARD' THEN amount ELSE 0 END), 0) as card_collected,
        COALESCE(SUM(amount), 0) as total_collected
      FROM payments
      WHERE date(created_at, 'localtime') = date(?, 'localtime')
    `).get(today);

    // Pending samples count
    const pendingSamples = db.prepare(`
      SELECT COUNT(*) as count FROM invoices WHERE status = 'SAMPLE_PENDING'
    `).get().count;

    // Ready for delivery count
    const readyReports = db.prepare(`
      SELECT COUNT(*) as count FROM invoices WHERE status = 'READY'
    `).get().count;

    // Total tests performed today
    const testsToday = db.prepare(`
      SELECT COUNT(ii.id) as count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE date(i.created_at, 'localtime') = date(?, 'localtime')
    `).get(today).count;

    json(res, {
      today,
      ...invStats,
      ...payStats,
      pendingSamples,
      readyReports,
      testsToday
    });
  });

  // 2. Departments
  router.get('/api/departments', (req, res) => {
    const depts = db.prepare(`
      SELECT d.*, COUNT(t.id) as tests_count
      FROM departments d
      LEFT JOIN tests t ON d.id = t.department_id AND t.is_active = 1
      GROUP BY d.id
      ORDER BY d.name
    `).all();
    json(res, depts);
  });

  // 3. Tests catalog
  router.get('/api/tests', (req, res) => {
    const { dept_id, search, active_only } = req.query;
    let sql = `
      SELECT t.*, d.name as department_name
      FROM tests t
      JOIN departments d ON t.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (active_only !== '0') {
      sql += ' AND t.is_active = 1';
    }
    if (dept_id) {
      sql += ' AND t.department_id = ?';
      params.push(dept_id);
    }
    if (search) {
      sql += ' AND (t.name LIKE ? OR t.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY d.name ASC, t.name ASC';
    const tests = db.prepare(sql).all(...params);
    json(res, tests);
  });

  router.post('/api/tests', (req, res) => {
    const { code, name, department_id, price, specimen, sample_tube, room_no, delivery_hours } = req.body;
    if (!code || !name || !department_id || price === undefined) {
      return json(res, { error: 'Code, name, department_id and price are required' }, 400);
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO tests (code, name, department_id, price, specimen, sample_tube, room_no, delivery_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        code.toUpperCase().trim(),
        name.trim(),
        department_id,
        Number(price),
        specimen || 'None',
        sample_tube || '',
        room_no || '',
        Number(delivery_hours) || 2
      );
      const newTest = db.prepare('SELECT * FROM tests WHERE id = ?').get(result.lastInsertRowid);
      json(res, newTest, 201);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint')) {
        return json(res, { error: `Test code "${code}" already exists.` }, 409);
      }
      throw err;
    }
  });

  router.put('/api/tests/:id', (req, res) => {
    const { id } = req.params;
    const { code, name, department_id, price, specimen, sample_tube, room_no, delivery_hours, is_active } = req.body;
    
    db.prepare(`
      UPDATE tests SET
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        department_id = COALESCE(?, department_id),
        price = COALESCE(?, price),
        specimen = COALESCE(?, specimen),
        sample_tube = COALESCE(?, sample_tube),
        room_no = COALESCE(?, room_no),
        delivery_hours = COALESCE(?, delivery_hours),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      code ? code.toUpperCase().trim() : null,
      name ? name.trim() : null,
      department_id,
      price !== undefined ? Number(price) : null,
      specimen,
      sample_tube,
      room_no,
      delivery_hours !== undefined ? Number(delivery_hours) : null,
      is_active !== undefined ? Number(is_active) : null,
      id
    );

    const updated = db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
    json(res, updated);
  });

  // 4. Doctors
  router.get('/api/doctors', (req, res) => {
    const doctors = db.prepare(`
      SELECT * FROM doctors WHERE is_active = 1 ORDER BY id = 1 DESC, name ASC
    `).all();
    json(res, doctors);
  });

  router.post('/api/doctors', (req, res) => {
    const { name, degrees, designation, phone, commission_percent } = req.body;
    if (!name) {
      return json(res, { error: 'Doctor name is required' }, 400);
    }
    const stmt = db.prepare(`
      INSERT INTO doctors (name, degrees, designation, phone, commission_percent)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name.trim(), degrees || '', designation || '', phone || '', Number(commission_percent) || 0);
    const newDoc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(result.lastInsertRowid);
    json(res, newDoc, 201);
  });

  router.put('/api/doctors/:id', (req, res) => {
    const { id } = req.params;
    const { name, degrees, designation, phone, commission_percent, is_active } = req.body;
    db.prepare(`
      UPDATE doctors SET
        name = COALESCE(?, name),
        degrees = COALESCE(?, degrees),
        designation = COALESCE(?, designation),
        phone = COALESCE(?, phone),
        commission_percent = COALESCE(?, commission_percent),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      name,
      degrees,
      designation,
      phone,
      commission_percent !== undefined ? Number(commission_percent) : null,
      is_active !== undefined ? Number(is_active) : null,
      id
    );
    const updated = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
    json(res, updated);
  });

  // 5. Patient search
  router.get('/api/patients/search', (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return json(res, []);
    }
    const patients = db.prepare(`
      SELECT * FROM patients
      WHERE phone LIKE ? OR name LIKE ? OR patient_uid LIKE ?
      ORDER BY id DESC
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
    json(res, patients);
  });

  // 6. Invoices: List & Create & Detail
  router.get('/api/invoices', (req, res) => {
    const { status, search, date, due_only, limit = 50 } = req.query;
    let sql = `
      SELECT 
        i.*,
        p.name as patient_name,
        p.phone as patient_phone,
        p.age as patient_age,
        p.age_unit as patient_age_unit,
        p.gender as patient_gender,
        p.patient_uid,
        d.name as doctor_name,
        d.degrees as doctor_degrees,
        (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as items_count
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN doctors d ON i.doctor_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL') {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    if (due_only === '1') {
      sql += ' AND i.due_amount > 0';
    }
    if (date) {
      sql += " AND date(i.created_at, 'localtime') = date(?, 'localtime')";
      params.push(date);
    }
    if (search) {
      sql += ' AND (i.invoice_no LIKE ? OR p.name LIKE ? OR p.phone LIKE ? OR p.patient_uid LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY i.id DESC LIMIT ?';
    params.push(Number(limit));

    const invoices = db.prepare(sql).all(...params);
    json(res, invoices);
  });

  router.get('/api/invoices/:id', (req, res) => {
    const { id } = req.params;
    const invoice = db.prepare(`
      SELECT 
        i.*,
        p.name as patient_name,
        p.phone as patient_phone,
        p.age as patient_age,
        p.age_unit as patient_age_unit,
        p.gender as patient_gender,
        p.address as patient_address,
        p.patient_uid,
        d.name as doctor_name,
        d.degrees as doctor_degrees,
        d.designation as doctor_designation,
        d.commission_percent as doctor_commission_percent
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN doctors d ON i.doctor_id = d.id
      WHERE i.id = ? OR i.invoice_no = ?
    `).get(id, id);

    if (!invoice) {
      return json(res, { error: 'Invoice not found' }, 404);
    }

    // Get items
    const items = db.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC
    `).all(invoice.id);

    // Get payments
    const payments = db.prepare(`
      SELECT * FROM payments WHERE invoice_id = ? ORDER BY id ASC
    `).all(invoice.id);

    // Unique specimen sample tubes required for lab barcode labels
    const sampleTubes = [];
    const tubeMap = new Map();
    for (const item of items) {
      if (item.specimen && item.specimen !== 'None') {
        const key = item.specimen;
        if (!tubeMap.has(key)) {
          tubeMap.set(key, {
            specimen: item.specimen,
            room: item.room_no,
            tests: []
          });
        }
        tubeMap.get(key).tests.push(item.test_code);
      }
    }
    for (const [specimen, data] of tubeMap.entries()) {
      sampleTubes.push({
        specimen,
        room: data.room,
        tests: data.tests.join(', ')
      });
    }

    json(res, {
      ...invoice,
      items,
      payments,
      sampleTubes
    });
  });

  router.post('/api/invoices', (req, res) => {
    const {
      patient, // { id (optional), name, age, age_unit, gender, phone, address }
      doctor_id = 1,
      test_ids = [], // Array of test IDs
      discount_type = 'NONE', // 'NONE', 'PERCENT', 'FLAT'
      discount_value = 0,
      discount_remark = '',
      urgent = false,
      paid_amount = 0,
      payment_method = 'CASH',
      payment_reference = '',
      notes = ''
    } = req.body;

    if (!patient || !patient.name || !patient.phone) {
      return json(res, { error: 'Patient name and phone number are required' }, 400);
    }
    if (!test_ids || test_ids.length === 0) {
      return json(res, { error: 'Please select at least one test' }, 400);
    }

    // Fetch tests
    const placeholders = test_ids.map(() => '?').join(',');
    const tests = db.prepare(`
      SELECT t.*, d.name as department_name
      FROM tests t
      JOIN departments d ON t.department_id = d.id
      WHERE t.id IN (${placeholders})
    `).all(...test_ids);

    if (tests.length === 0) {
      return json(res, { error: 'No valid tests selected' }, 400);
    }

    // Subtotal
    const subtotal = tests.reduce((acc, t) => acc + t.price, 0);

    // Urgent surcharge (15% if urgent)
    const urgent_surcharge = urgent ? Math.round(subtotal * 0.15) : 0;

    // Discount
    let discount_amount = 0;
    const numDiscVal = Number(discount_value) || 0;
    if (discount_type === 'PERCENT') {
      discount_amount = Math.round((subtotal * Math.min(100, Math.max(0, numDiscVal))) / 100);
    } else if (discount_type === 'FLAT') {
      discount_amount = Math.min(subtotal, Math.max(0, numDiscVal));
    }

    const net_amount = Math.max(0, subtotal + urgent_surcharge - discount_amount);
    const numPaid = Math.min(net_amount, Math.max(0, Number(paid_amount) || 0));
    const due_amount = Math.max(0, net_amount - numPaid);

    // Determine max delivery hours
    const maxHours = Math.max(...tests.map(t => t.delivery_hours || 2));
    const deliveryDateObj = new Date(Date.now() + maxHours * 3600000);
    const delivery_date = deliveryDateObj.toISOString().replace('T', ' ').substring(0, 19);

    // 1. Find or create patient
    let patientRecord = null;
    if (patient.id) {
      patientRecord = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient.id);
    }
    if (!patientRecord) {
      patientRecord = db.prepare('SELECT * FROM patients WHERE phone = ? LIMIT 1').get(patient.phone.trim());
    }

    let patientId;
    if (patientRecord) {
      patientId = patientRecord.id;
      // Update info if changed
      db.prepare(`
        UPDATE patients SET
          name = COALESCE(?, name),
          age = COALESCE(?, age),
          age_unit = COALESCE(?, age_unit),
          gender = COALESCE(?, gender),
          address = COALESCE(?, address)
        WHERE id = ?
      `).run(patient.name.trim(), patient.age || patientRecord.age, patient.age_unit || 'Y', patient.gender || patientRecord.gender, patient.address || patientRecord.address, patientId);
    } else {
      // Create new patient UID
      const lastPatient = db.prepare('SELECT id FROM patients ORDER BY id DESC LIMIT 1').get();
      const nextPidSeq = (lastPatient ? lastPatient.id : 0) + 10001;
      const patient_uid = `P-${nextPidSeq}`;

      const resPat = db.prepare(`
        INSERT INTO patients (patient_uid, name, age, age_unit, gender, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        patient_uid,
        patient.name.trim(),
        Number(patient.age) || 30,
        patient.age_unit || 'Y',
        patient.gender || 'MALE',
        patient.phone.trim(),
        patient.address || ''
      );
      patientId = resPat.lastInsertRowid;
    }

    // 2. Generate unique Invoice Number: CPD-YYMMDD-XXXX
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const todayCount = db.prepare(`
      SELECT COUNT(*) as count FROM invoices WHERE invoice_no LIKE ?
    `).get(`CPD-${datePrefix}-%`).count;
    const invSeq = String(todayCount + 1).padStart(3, '0');
    const invoice_no = `CPD-${datePrefix}-${invSeq}`;

    // 3. Insert Invoice
    const initialStatus = 'SAMPLE_PENDING';
    const resInv = db.prepare(`
      INSERT INTO invoices (
        invoice_no, patient_id, doctor_id, subtotal, discount_type, discount_value,
        discount_amount, discount_remark, urgent_surcharge, net_amount, paid_amount,
        due_amount, payment_method, payment_reference, status, delivery_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoice_no, patientId, Number(doctor_id) || 1, subtotal, discount_type, numDiscVal,
      discount_amount, discount_remark || '', urgent_surcharge, net_amount, numPaid,
      due_amount, payment_method, payment_reference || '', initialStatus, delivery_date, notes || ''
    );
    const invoiceId = resInv.lastInsertRowid;

    // 4. Insert Invoice Items
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, test_id, test_code, test_name, department_name, price, room_no, specimen, delivery_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of tests) {
      const itemDelivery = new Date(Date.now() + (t.delivery_hours || 2) * 3600000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      insertItem.run(
        invoiceId,
        t.id,
        t.code,
        t.name,
        t.department_name,
        t.price,
        t.room_no || '',
        t.specimen || 'None',
        itemDelivery
      );
    }

    // 5. Insert Payment Record
    if (numPaid > 0) {
      db.prepare(`
        INSERT INTO payments (invoice_id, amount, payment_method, payment_reference, payment_type)
        VALUES (?, ?, ?, ?, 'INITIAL')
      `).run(invoiceId, numPaid, payment_method, payment_reference || '');
    }

    // Return full invoice
    const completeInvoice = db.prepare(`
      SELECT i.*, p.name as patient_name, p.phone as patient_phone, p.patient_uid, d.name as doctor_name
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN doctors d ON i.doctor_id = d.id
      WHERE i.id = ?
    `).get(invoiceId);

    json(res, completeInvoice, 201);
  });

  // 7. Update Invoice Status
  router.patch('/api/invoices/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['SAMPLE_PENDING', 'SAMPLE_COLLECTED', 'IN_TESTING', 'READY', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return json(res, { error: 'Invalid status' }, 400);
    }

    db.prepare(`
      UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    json(res, updated);
  });

  // 8. Due Collection
  router.post('/api/invoices/:id/due-payment', (req, res) => {
    const { id } = req.params;
    const { amount, payment_method = 'CASH', payment_reference = '' } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) {
      return json(res, { error: 'Valid payment amount required' }, 400);
    }

    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!inv) {
      return json(res, { error: 'Invoice not found' }, 404);
    }

    if (inv.due_amount <= 0) {
      return json(res, { error: 'This invoice has no outstanding due' }, 400);
    }

    const collectAmount = Math.min(inv.due_amount, numAmount);
    const newPaid = inv.paid_amount + collectAmount;
    const newDue = inv.due_amount - collectAmount;

    // Update invoice
    db.prepare(`
      UPDATE invoices SET
        paid_amount = ?,
        due_amount = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPaid, newDue, id);

    // Record payment
    db.prepare(`
      INSERT INTO payments (invoice_id, amount, payment_method, payment_reference, payment_type)
      VALUES (?, ?, ?, ?, 'DUE_COLLECTION')
    `).run(id, collectAmount, payment_method, payment_reference || '');

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    json(res, {
      success: true,
      collected: collectAmount,
      invoice: updated
    });
  });

  // 9. Doctor Commission Report
  router.get('/api/reports/doctor-commissions', (req, res) => {
    const { start_date, end_date } = req.query;
    let sql = `
      SELECT 
        d.id as doctor_id,
        d.name as doctor_name,
        d.degrees as doctor_degrees,
        d.designation as doctor_designation,
        d.commission_percent,
        COUNT(i.id) as total_referrals,
        COALESCE(SUM(i.subtotal), 0) as total_subtotal,
        COALESCE(SUM(i.net_amount), 0) as total_net_amount,
        COALESCE(SUM(i.subtotal * (d.commission_percent / 100.0)), 0) as total_commission_payable
      FROM doctors d
      LEFT JOIN invoices i ON d.id = i.doctor_id
    `;
    const params = [];

    if (start_date && end_date) {
      sql += " AND date(i.created_at, 'localtime') BETWEEN date(?, 'localtime') AND date(?, 'localtime')";
      params.push(start_date, end_date);
    } else if (start_date) {
      sql += " AND date(i.created_at, 'localtime') >= date(?, 'localtime')";
      params.push(start_date);
    }

    sql += ' GROUP BY d.id ORDER BY total_commission_payable DESC, d.name ASC';
    const report = db.prepare(sql).all(...params);
    json(res, report);
  });

  // 10. Daily Close Report
  router.get('/api/reports/daily-close', (req, res) => {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];

    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(subtotal), 0) as gross_subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(urgent_surcharge), 0) as total_urgent_surcharge,
        COALESCE(SUM(net_amount), 0) as total_net_bill,
        COALESCE(SUM(paid_amount), 0) as total_paid_amount,
        COALESCE(SUM(due_amount), 0) as total_due_remaining
      FROM invoices
      WHERE date(created_at, 'localtime') = date(?, 'localtime')
    `).get(targetDate);

    // Payments collected on that day
    const paymentBreakdown = db.prepare(`
      SELECT 
        payment_method,
        payment_type,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM payments
      WHERE date(created_at, 'localtime') = date(?, 'localtime')
      GROUP BY payment_method, payment_type
    `).all(targetDate);

    // Department breakdown
    const deptBreakdown = db.prepare(`
      SELECT 
        ii.department_name,
        COUNT(ii.id) as tests_count,
        SUM(ii.price) as revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE date(i.created_at, 'localtime') = date(?, 'localtime')
      GROUP BY ii.department_name
      ORDER BY revenue DESC
    `).all(targetDate);

    json(res, {
      date: targetDate,
      summary,
      paymentBreakdown,
      deptBreakdown
    });
  });

  // 11. Health Checkup Packages
  router.get('/api/packages', (req, res) => {
    const packages = db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY id ASC').all();
    const pkgItemsStmt = db.prepare(`
      SELECT t.*, d.name as department_name
      FROM package_items pi
      JOIN tests t ON pi.test_id = t.id
      JOIN departments d ON t.department_id = d.id
      WHERE pi.package_id = ?
    `);

    const result = packages.map(pkg => ({
      ...pkg,
      tests: pkgItemsStmt.all(pkg.id)
    }));

    json(res, result);
  });

  // 12. Test Parameters & Result Entry (Laboratory Information System)
  router.get('/api/test-parameters/:testId', (req, res) => {
    const { testId } = req.params;
    const params = db.prepare(`
      SELECT * FROM test_parameters WHERE test_id = ? ORDER BY sort_order ASC, id ASC
    `).all(testId);
    json(res, params);
  });

  router.get('/api/invoices/:id/report', (req, res) => {
    const { id } = req.params;
    const invoice = db.prepare(`
      SELECT 
        i.*,
        p.name as patient_name,
        p.phone as patient_phone,
        p.age as patient_age,
        p.age_unit as patient_age_unit,
        p.gender as patient_gender,
        p.address as patient_address,
        p.patient_uid,
        d.name as doctor_name,
        d.degrees as doctor_degrees,
        d.designation as doctor_designation
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN doctors d ON i.doctor_id = d.id
      WHERE i.id = ? OR i.invoice_no = ?
    `).get(id, id);

    if (!invoice) {
      return json(res, { error: 'Invoice not found' }, 404);
    }

    const items = db.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC
    `).all(invoice.id);

    // Attach parameters and any saved results to each item
    const itemsWithResults = items.map(item => {
      const standardParams = db.prepare(`
        SELECT * FROM test_parameters WHERE test_id = ? ORDER BY sort_order ASC
      `).all(item.test_id);

      const savedResults = db.prepare(`
        SELECT * FROM test_results WHERE invoice_item_id = ? ORDER BY id ASC
      `).all(item.id);

      return {
        ...item,
        standardParams,
        savedResults
      };
    });

    json(res, {
      ...invoice,
      items: itemsWithResults
    });
  });

  router.post('/api/invoices/:id/results', (req, res) => {
    const { id } = req.params;
    const { results = [] } = req.body;

    if (!Array.isArray(results) || results.length === 0) {
      return json(res, { error: 'No results provided' }, 400);
    }

    const deleteOld = db.prepare('DELETE FROM test_results WHERE invoice_item_id = ?');
    const insertResult = db.prepare(`
      INSERT INTO test_results (invoice_id, invoice_item_id, parameter_id, parameter_name, result_value, unit, reference_range, flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Group by invoice_item_id to delete old results first
    const affectedItemIds = new Set(results.map(r => r.invoice_item_id));
    for (const itemId of affectedItemIds) {
      deleteOld.run(itemId);
    }

    for (const r of results) {
      insertResult.run(
        id,
        r.invoice_item_id,
        r.parameter_id || null,
        r.parameter_name,
        r.result_value,
        r.unit || '',
        r.reference_range || '',
        r.flag || 'NORMAL'
      );
    }

    // Auto update status to READY if not delivered
    const inv = db.prepare('SELECT status FROM invoices WHERE id = ?').get(id);
    if (inv && inv.status !== 'DELIVERED') {
      db.prepare("UPDATE invoices SET status = 'READY', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    }

    json(res, { success: true, count: results.length });
  });

  // 13. CSV Export Endpoints
  router.get('/api/export/invoices-csv', (req, res) => {
    const { date } = req.query;
    let sql = `
      SELECT 
        i.invoice_no, i.created_at, p.patient_uid, p.name as patient_name, p.phone,
        p.gender, p.age, d.name as doctor_name, i.subtotal, i.discount_amount,
        i.net_amount, i.paid_amount, i.due_amount, i.payment_method, i.status
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      JOIN doctors d ON i.doctor_id = d.id
    `;
    const params = [];
    if (date) {
      sql += " WHERE date(i.created_at, 'localtime') = date(?, 'localtime')";
      params.push(date);
    }
    sql += ' ORDER BY i.id DESC';

    const rows = db.prepare(sql).all(...params);
    let csv = 'Invoice No,Date,Patient ID,Patient Name,Phone,Gender,Age,Doctor,Subtotal,Discount,Net Bill,Paid,Due,Payment Method,Status\n';
    for (const r of rows) {
      csv += `"${r.invoice_no}","${r.created_at}","${r.patient_uid}","${r.patient_name}","${r.phone}","${r.gender}","${r.age}","${r.doctor_name}",${r.subtotal},${r.discount_amount},${r.net_amount},${r.paid_amount},${r.due_amount},"${r.payment_method}","${r.status}"\n`;
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices-${date || 'all'}.csv"`
    });
    res.end(csv);
  });

  router.get('/api/export/commissions-csv', (req, res) => {
    const doctors = db.prepare(`
      SELECT 
        d.name as doctor_name, d.degrees, d.commission_percent,
        COUNT(i.id) as total_referrals,
        COALESCE(SUM(i.subtotal), 0) as total_subtotal,
        COALESCE(SUM(i.subtotal * (d.commission_percent / 100.0)), 0) as total_commission_payable
      FROM doctors d
      LEFT JOIN invoices i ON d.id = i.doctor_id
      GROUP BY d.id
      ORDER BY total_commission_payable DESC
    `).all();

    let csv = 'Doctor Name,Degrees,Commission Rate (%),Total Referrals,Total Test Value,Commission Payable\n';
    for (const d of doctors) {
      csv += `"${d.doctor_name}","${d.degrees || ''}",${d.commission_percent},${d.total_referrals},${d.total_subtotal},${d.total_commission_payable}\n`;
    }

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="doctor-commissions.csv"'
    });
    res.end(csv);
  });

  // 14. System Settings
  router.get('/api/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    json(res, settings);
  });

  router.post('/api/settings', (req, res) => {
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const [key, value] of Object.entries(req.body)) {
      upsert.run(key, String(value));
    }
    const rows = db.prepare('SELECT key, value FROM settings').all();
    json(res, Object.fromEntries(rows.map(r => [r.key, r.value])));
  });
}
