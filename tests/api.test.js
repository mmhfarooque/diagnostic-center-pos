import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { Router } from '../src/router.js';
import { registerApiRoutes } from '../src/routes/api.js';

// Helper to mock request/response
function mockCall(router, method, path, body = {}) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    let headers = {};
    let responseBody = '';

    const req = {
      method: method.toUpperCase(),
      url: path,
      headers: { host: 'localhost:3000' },
      on: (event, handler) => {
        if (event === 'data' && body) {
          handler(Buffer.from(JSON.stringify(body)));
        }
        if (event === 'end') {
          handler();
        }
      }
    };

    const res = {
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      writeHead: (code, hdrs = {}) => {
        statusCode = code;
        Object.entries(hdrs).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
      },
      end: (data) => {
        if (data) responseBody += data;
        let parsed = responseBody;
        try {
          parsed = JSON.parse(responseBody);
        } catch (_) {}
        resolve({ statusCode, headers, body: parsed });
      }
    };

    router.handle(req, res).catch(reject);
  });
}

test('Diagnostic POS API test suite', async (t) => {
  const router = new Router();
  registerApiRoutes(router);

  await t.test('GET /api/stats returns daily summary', async () => {
    const res = await mockCall(router, 'GET', '/api/stats');
    assert.equal(res.statusCode, 200);
    assert.ok(typeof res.body.total_invoices === 'number');
    assert.ok(typeof res.body.pendingSamples === 'number');
  });

  await t.test('GET /api/tests returns test list with departments', async () => {
    const res = await mockCall(router, 'GET', '/api/tests');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 35);
    const cbc = res.body.find(t => t.code === 'CBC-01');
    assert.ok(cbc);
    assert.equal(cbc.price, 400);
  });

  await t.test('POST /api/invoices creates a new patient test invoice with correct math', async () => {
    const payload = {
      patient: {
        name: 'Mrs. Anwara Begum',
        age: 52,
        age_unit: 'Y',
        gender: 'FEMALE',
        phone: '01899112233',
        address: 'Mirpur-10, Dhaka'
      },
      doctor_id: 2, // Dr. Rahman
      test_ids: [1, 2], // CBC (400) + Blood Group (150) = 550
      discount_type: 'FLAT',
      discount_value: 50,
      discount_remark: 'Senior Citizen concession',
      urgent: false,
      paid_amount: 300,
      payment_method: 'BKASH',
      payment_reference: 'TRX998811'
    };

    const res = await mockCall(router, 'POST', '/api/invoices', payload);
    assert.equal(res.statusCode, 201);
    const inv = res.body;

    assert.ok(inv.invoice_no.startsWith('CPD-'));
    assert.equal(inv.patient_name, 'Mrs. Anwara Begum');
    assert.equal(inv.subtotal, 550);
    assert.equal(inv.discount_amount, 50);
    assert.equal(inv.net_amount, 500);
    assert.equal(inv.paid_amount, 300);
    assert.equal(inv.due_amount, 200);
    assert.equal(inv.payment_method, 'BKASH');
  });

  await t.test('POST /api/invoices/:id/due-payment collects due and updates balance', async () => {
    // Find an invoice with due amount
    const invoiceWithDue = db.prepare('SELECT * FROM invoices WHERE due_amount > 0 LIMIT 1').get();
    assert.ok(invoiceWithDue, 'Should have an invoice with due');

    const initialDue = invoiceWithDue.due_amount;
    const initialPaid = invoiceWithDue.paid_amount;
    const collectAmount = Math.min(100, initialDue);

    const res = await mockCall(router, 'POST', `/api/invoices/${invoiceWithDue.id}/due-payment`, {
      amount: collectAmount,
      payment_method: 'CASH',
      payment_reference: 'Counter Cashier due collection'
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.collected, collectAmount);
    assert.equal(res.body.invoice.due_amount, initialDue - collectAmount);
    assert.equal(res.body.invoice.paid_amount, initialPaid + collectAmount);
  });

  await t.test('PATCH /api/invoices/:id/status updates sample & report lifecycle', async () => {
    const inv = db.prepare('SELECT id FROM invoices ORDER BY id DESC LIMIT 1').get();
    const res = await mockCall(router, 'PATCH', `/api/invoices/${inv.id}/status`, {
      status: 'SAMPLE_COLLECTED'
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'SAMPLE_COLLECTED');
  });

  await t.test('GET /api/reports/doctor-commissions computes doctor referral totals', async () => {
    const res = await mockCall(router, 'GET', '/api/reports/doctor-commissions');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
  });

  await t.test('GET /api/packages returns health checkup bundles with tests', async () => {
    const res = await mockCall(router, 'GET', '/api/packages');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 5);
    const execPkg = res.body.find(p => p.code === 'PKG-EXEC');
    assert.ok(execPkg);
    assert.ok(execPkg.tests.length > 0);
    assert.ok(execPkg.package_price < execPkg.regular_price);
  });

  await t.test('POST /api/invoices/:id/results saves lab test findings and updates status', async () => {
    const inv = db.prepare('SELECT id FROM invoices ORDER BY id ASC LIMIT 1').get();
    const item = db.prepare('SELECT id FROM invoice_items WHERE invoice_id = ? LIMIT 1').get(inv.id);

    const payload = {
      results: [
        {
          invoice_item_id: item.id,
          parameter_name: 'Hemoglobin (Hb%)',
          result_value: '13.8',
          unit: 'g/dL',
          reference_range: '13.0 - 17.0',
          flag: 'NORMAL'
        }
      ]
    };

    const res = await mockCall(router, 'POST', `/api/invoices/${inv.id}/results`, payload);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const repRes = await mockCall(router, 'GET', `/api/invoices/${inv.id}/report`);
    assert.equal(repRes.statusCode, 200);
    assert.ok(repRes.body.items.length > 0);
    const repItem = repRes.body.items.find(i => i.id === item.id);
    assert.ok(repItem.savedResults.length > 0);
    assert.equal(repItem.savedResults[0].result_value, '13.8');
  });

  await t.test('GET /api/export/invoices-csv exports valid CSV data', async () => {
    const res = await mockCall(router, 'GET', '/api/export/invoices-csv');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Invoice No,Date,Patient ID'));
  });

  await t.test('POST /api/auth/login logs in operator via PIN and credentials', async () => {
    // Login with operator PIN 1234
    const pinRes = await mockCall(router, 'POST', '/api/auth/login', { pin: '1234' });
    assert.equal(pinRes.statusCode, 200);
    assert.equal(pinRes.body.user.role, 'operator');
    assert.ok(pinRes.body.token);

    // Login with admin email & password
    const credRes = await mockCall(router, 'POST', '/api/auth/login', { email: 'admin@careplus.com', password: 'Admin@1234' });
    assert.equal(credRes.statusCode, 200);
    assert.equal(credRes.body.user.role, 'admin');

    // Login with username & password
    const userRes = await mockCall(router, 'POST', '/api/auth/login', { username: 'cashier', password: 'Cashier@1234' });
    assert.equal(userRes.statusCode, 200);
    assert.equal(userRes.body.user.role, 'operator');

    // Reject wrong PIN
    const failRes = await mockCall(router, 'POST', '/api/auth/login', { pin: '0000' });
    assert.equal(failRes.statusCode, 401);
  });
});
