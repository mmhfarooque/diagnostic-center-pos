import { generateBarcodeSvg } from './barcode.js';
import { generateQrCodeSvg } from './qrcode.js';

// Application State
const state = {
  activeTab: 'pos', // 'pos', 'invoices', 'lab', 'reports', 'settings'
  settings: {
    center_name: 'CarePlus Diagnostic Centre',
    tagline: 'Accurate Diagnostics • Compassionate Care',
    address: 'House #42, Road #11, Dhanmondi, Dhaka-1209',
    phone: '+880 1711-000222',
    currency_symbol: '৳'
  },
  departments: [],
  selectedDeptId: null, // null for all, 'packages' for packages, or dept.id
  tests: [],
  packages: [],
  doctors: [],
  cart: [],
  patient: {
    id: null,
    name: '',
    age: '',
    age_unit: 'Y',
    gender: 'MALE',
    phone: '',
    address: ''
  },
  selectedDoctorId: 1,
  discountType: 'NONE', // 'NONE', 'PERCENT', 'FLAT'
  discountValue: 0,
  discountRemark: '',
  urgent: false,
  paidAmount: '',
  paymentMethod: 'CASH',
  paymentReference: '',
  notes: '',
  invoices: [],
  invoiceFilter: {
    status: 'ALL',
    search: '',
    date: new Date().toISOString().split('T')[0],
    dueOnly: false
  },
  currentPrintInvoice: null,
  printMode: 'thermal', // 'thermal', 'a4', 'report', 'shift'
  stats: {},
  dueModalInvoice: null,
  activeReportInvoice: null,
  activeResultsInvoice: null
};

// Utilities
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function formatCurrency(amount) {
  const symbol = state.settings.currency_symbol || '৳';
  return `${symbol}${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function showToast(message, type = 'success') {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// API Calls
async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      return await res.text();
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// Billing Calculations
function calculateBilling() {
  const subtotal = state.cart.reduce((acc, t) => acc + t.price, 0);
  const urgentSurcharge = state.urgent ? Math.round(subtotal * 0.15) : 0;
  
  let discountAmount = 0;
  const discVal = Number(state.discountValue) || 0;
  if (state.discountType === 'PERCENT') {
    discountAmount = Math.round((subtotal * Math.min(100, Math.max(0, discVal))) / 100);
  } else if (state.discountType === 'FLAT') {
    discountAmount = Math.min(subtotal, Math.max(0, discVal));
  }

  const netAmount = Math.max(0, subtotal + urgentSurcharge - discountAmount);
  
  let paid = state.paidAmount === '' ? netAmount : Number(state.paidAmount);
  if (isNaN(paid)) paid = 0;
  
  const due = Math.max(0, netAmount - paid);
  const change = Math.max(0, paid - netAmount);

  return {
    subtotal,
    urgentSurcharge,
    discountAmount,
    netAmount,
    paid,
    due,
    change
  };
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const clockEl = $('#live-clock');
  if (clockEl) clockEl.textContent = `${dateStr} • ${timeStr}`;
}

async function loadInitialData() {
  const [settings, depts, tests, packages, doctors, stats] = await Promise.all([
    api('/api/settings'),
    api('/api/departments'),
    api('/api/tests'),
    api('/api/packages'),
    api('/api/doctors'),
    api('/api/stats')
  ]);

  state.settings = settings;
  state.departments = depts;
  state.tests = tests;
  state.packages = packages;
  state.doctors = doctors;
  state.stats = stats;

  renderDepartments();
  renderDoctorsDropdown();
  renderTests();
  renderCart();
  renderHeaderStats();
}

function renderHeaderStats() {
  const statEl = $('#header-stats');
  if (!statEl || !state.stats) return;
  statEl.innerHTML = `
    <div class="stat-pill">
      <span>Today Invoices:</span>
      <strong>${state.stats.total_invoices || 0}</strong>
    </div>
    <div class="stat-pill">
      <span>Today Cash:</span>
      <strong>${formatCurrency(state.stats.cash_collected || 0)}</strong>
    </div>
    <div class="stat-pill">
      <span>Due Pending:</span>
      <strong style="color: #ea580c;">${formatCurrency(state.stats.total_due || 0)}</strong>
    </div>
  `;
}

function renderDepartments() {
  const container = $('#dept-filters');
  if (!container) return;

  let html = `
    <button class="dept-pill ${state.selectedDeptId === null ? 'active' : ''}" data-id="all">
      All Tests (${state.tests.length})
    </button>
    <button class="dept-pill ${state.selectedDeptId === 'packages' ? 'active' : ''}" data-id="packages" style="border-color: #86efac; color: #15803d; font-weight: 700;">
      🎁 Health Packages (${state.packages.length})
    </button>
  `;

  state.departments.forEach(d => {
    const isActive = state.selectedDeptId === d.id;
    html += `
      <button class="dept-pill ${isActive ? 'active' : ''}" data-id="${d.id}">
        ${d.name} (${d.tests_count})
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.dept-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      state.selectedDeptId = id === 'all' ? null : (id === 'packages' ? 'packages' : Number(id));
      renderDepartments();
      renderTests();
    });
  });
}

function renderDoctorsDropdown() {
  const select = $('#doctor-select');
  if (!select) return;

  select.innerHTML = state.doctors.map(d => `
    <option value="${d.id}" ${state.selectedDoctorId === d.id ? 'selected' : ''}>
      ${d.name} ${d.degrees ? `(${d.degrees})` : ''} ${d.commission_percent > 0 ? `[${d.commission_percent}%]` : ''}
    </option>
  `).join('');

  select.addEventListener('change', (e) => {
    state.selectedDoctorId = Number(e.target.value);
  });
}

function renderTests() {
  const grid = $('#tests-grid');
  if (!grid) return;

  // If Packages view is selected
  if (state.selectedDeptId === 'packages') {
    grid.innerHTML = state.packages.map(pkg => {
      const savings = pkg.regular_price - pkg.package_price;
      const testNames = pkg.tests.map(t => t.name).join(' • ');
      return `
        <div class="pkg-card" data-pkg-id="${pkg.id}">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
              <span class="pkg-badge">🎁 PACKAGE BUNDLE</span>
              <span style="font-size: 0.7rem; color: #15803d; font-weight: 700;">Save ${formatCurrency(savings)}</span>
            </div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 2px;">${pkg.name}</div>
            <div style="font-size: 0.72rem; color: #475569; margin-bottom: 6px;">${pkg.description || ''}</div>
            <div style="font-size: 0.68rem; color: #64748b; background: white; padding: 4px 6px; border-radius: 4px; border: 1px dashed #cbd5e1; line-height: 1.3;">
              <strong>Included (${pkg.tests.length}):</strong> ${testNames}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
            <div>
              <span style="font-size: 0.75rem; text-decoration: line-through; color: #94a3b8;">${formatCurrency(pkg.regular_price)}</span>
              <span style="font-size: 1.1rem; font-weight: 800; color: #15803d; margin-left: 4px;">${formatCurrency(pkg.package_price)}</span>
            </div>
            <button class="btn btn-success btn-sm" onclick="window.posApp.addPackage(${pkg.id})">+ Add Package</button>
          </div>
        </div>
      `;
    }).join('');
    return;
  }

  const search = ($('#test-search-input')?.value || '').toLowerCase().trim();

  const filtered = state.tests.filter(t => {
    if (state.selectedDeptId && t.department_id !== state.selectedDeptId) return false;
    if (search) {
      return t.name.toLowerCase().includes(search) || t.code.toLowerCase().includes(search);
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #94a3b8;">
        No diagnostic tests found matching your search.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(t => {
    const inCart = state.cart.some(item => item.id === t.id);
    return `
      <div class="test-card ${inCart ? 'in-cart' : ''}" data-id="${t.id}">
        <div>
          <div class="test-card-top">
            <span class="test-code">${t.code}</span>
            <span class="test-price">${formatCurrency(t.price)}</span>
          </div>
          <div class="test-name">${t.name}</div>
        </div>
        <div class="test-meta">
          ${t.specimen && t.specimen !== 'None' ? `<span class="specimen-badge">${t.specimen}</span>` : ''}
          ${t.room_no ? `<span class="room-badge">${t.room_no.split('-')[0].trim()}</span>` : ''}
          <span style="font-size: 0.65rem; color: #64748b;">⏱ ${t.delivery_hours}h</span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.test-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.getAttribute('data-id'));
      toggleCartItem(id);
    });
  });
}

function addPackageToCart(pkgId) {
  const pkg = state.packages.find(p => p.id === pkgId);
  if (!pkg) return;

  for (const t of pkg.tests) {
    if (!state.cart.some(c => c.id === t.id)) {
      state.cart.push(t);
    }
  }

  // Auto calculate and set package discount
  const savings = pkg.regular_price - pkg.package_price;
  state.discountType = 'FLAT';
  state.discountValue = savings;
  state.discountRemark = `Package Offer: ${pkg.name}`;

  $('#discount-type-select').value = 'FLAT';
  $('#discount-val-input').value = savings;
  const remarkInput = $('#discount-remark-input');
  remarkInput.value = state.discountRemark;
  remarkInput.style.display = 'block';

  showToast(`Added ${pkg.name} with ${formatCurrency(savings)} bundle discount!`, 'success');
  renderTests();
  renderCart();
}

function toggleCartItem(testId) {
  const index = state.cart.findIndex(i => i.id === testId);
  if (index > -1) {
    state.cart.splice(index, 1);
  } else {
    const test = state.tests.find(t => t.id === testId);
    if (test) state.cart.push(test);
  }
  renderTests();
  renderCart();
}

function renderCart() {
  const list = $('#cart-items-list');
  const countEl = $('#cart-count');
  if (!list) return;

  if (countEl) countEl.textContent = state.cart.length;

  if (state.cart.length === 0) {
    list.innerHTML = `
      <div class="empty-cart-state">
        <svg width="44" height="44" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <p>No tests selected yet</p>
        <span style="font-size: 0.75rem;">Click on any diagnostic test or package to add to bill</span>
      </div>
    `;
  } else {
    list.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div>
          <div class="cart-item-title">${item.name}</div>
          <div class="cart-item-dept">${item.code} • ${item.department_name}</div>
        </div>
        <div class="cart-item-actions">
          <span class="cart-item-price">${formatCurrency(item.price)}</span>
          <button class="btn-remove-item" data-id="${item.id}" title="Remove test">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        toggleCartItem(id);
      });
    });
  }

  // Update summary numbers
  const calc = calculateBilling();
  $('#summary-subtotal').textContent = formatCurrency(calc.subtotal);
  $('#summary-net').textContent = formatCurrency(calc.netAmount);
  
  const urgentRow = $('#urgent-surcharge-row');
  if (urgentRow) {
    urgentRow.style.display = state.urgent ? 'flex' : 'none';
    urgentRow.textContent = `+${formatCurrency(calc.urgentSurcharge)}`;
  }

  const discountRow = $('#summary-discount-row');
  if (discountRow) {
    discountRow.style.display = calc.discountAmount > 0 ? 'inline' : 'none';
    discountRow.textContent = `-${formatCurrency(calc.discountAmount)}`;
  }

  const paidInput = $('#paid-amount-input');
  if (paidInput) {
    paidInput.placeholder = calc.netAmount;
    if (state.paidAmount === '') {
      paidInput.value = '';
    }
  }

  const dueRow = $('#due-display-row');
  if (dueRow) {
    if (calc.due > 0) {
      dueRow.innerHTML = `
        <div class="due-alert-box" style="width: 100%;">
          <span>⚠ Due Remaining:</span>
          <strong>${formatCurrency(calc.due)}</strong>
        </div>
      `;
      dueRow.style.display = 'block';
    } else if (calc.change > 0) {
      dueRow.innerHTML = `
        <div style="background: #d1fae5; border: 1px solid #a7f3d0; color: #065f46; padding: 0.4rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: flex; justify-content: space-between; width: 100%;">
          <span>Return Change:</span>
          <strong>${formatCurrency(calc.change)}</strong>
        </div>
      `;
      dueRow.style.display = 'block';
    } else {
      dueRow.style.display = 'none';
    }
  }

  const completeBtn = $('#btn-complete-pos');
  if (completeBtn) {
    completeBtn.disabled = state.cart.length === 0;
  }
}

// Complete POS Checkout
async function completeCheckout() {
  const calc = calculateBilling();
  if (state.cart.length === 0) {
    showToast('Please add at least one test to bill', 'error');
    return;
  }

  const name = $('#patient-name')?.value.trim();
  const phone = $('#patient-phone')?.value.trim();
  const age = $('#patient-age')?.value.trim();
  const ageUnit = $('#patient-age-unit')?.value || 'Y';
  const gender = $('#patient-gender')?.value || 'MALE';
  const address = $('#patient-address')?.value.trim() || '';

  if (!name) {
    showToast('Please enter patient name', 'error');
    $('#patient-name')?.focus();
    return;
  }
  if (!phone || phone.length < 5) {
    showToast('Please enter a valid patient phone number', 'error');
    $('#patient-phone')?.focus();
    return;
  }

  const payload = {
    patient: {
      id: state.patient.id,
      name,
      phone,
      age: Number(age) || 30,
      age_unit: ageUnit,
      gender,
      address
    },
    doctor_id: state.selectedDoctorId,
    test_ids: state.cart.map(t => t.id),
    discount_type: state.discountType,
    discount_value: Number(state.discountValue) || 0,
    discount_remark: state.discountRemark,
    urgent: state.urgent,
    paid_amount: calc.paid,
    payment_method: state.paymentMethod,
    payment_reference: state.paymentReference,
    notes: state.notes
  };

  try {
    const invoice = await api('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(`Invoice ${invoice.invoice_no} created successfully!`, 'success');

    api('/api/stats').then(st => {
      state.stats = st;
      renderHeaderStats();
    });

    resetPosForm();
    openPrintModal(invoice.id);
  } catch (err) {}
}

function resetPosForm() {
  state.cart = [];
  state.patient = { id: null, name: '', age: '', age_unit: 'Y', gender: 'MALE', phone: '', address: '' };
  state.discountType = 'NONE';
  state.discountValue = 0;
  state.discountRemark = '';
  state.urgent = false;
  state.paidAmount = '';
  state.paymentReference = '';
  state.notes = '';

  $('#patient-name').value = '';
  $('#patient-phone').value = '';
  $('#patient-age').value = '';
  $('#patient-address').value = '';
  $('#discount-val-input').value = '';
  $('#discount-remark-input').value = '';
  $('#urgent-toggle').checked = false;
  $('#paid-amount-input').value = '';
  $('#payment-ref-input').value = '';
  $('#discount-remark-input').style.display = 'none';

  renderTests();
  renderCart();
}

// Print Modal & Formatting
async function openPrintModal(invoiceId) {
  const invoice = await api(`/api/invoices/${invoiceId}`);
  state.currentPrintInvoice = invoice;

  renderPrintPreview();
  $('#print-modal').style.display = 'flex';
}

function renderPrintPreview() {
  const inv = state.currentPrintInvoice;
  if (!inv) return;

  const container = $('#print-preview-content');
  if (!container) return;

  const barcodeSvg = generateBarcodeSvg(inv.invoice_no, { height: 35, barWidth: 1.5, fontSize: 10 });
  const qrSvg = generateQrCodeSvg(`${inv.invoice_no}|${inv.patient_uid}|${inv.net_amount}`, { size: 68 });

  if (state.printMode === 'thermal') {
    container.innerHTML = `
      <div class="thermal-receipt" style="font-family: 'Courier New', monospace; max-width: 340px; margin: 0 auto; background: white; padding: 12px; border: 1px solid #e2e8f0; font-size: 12px;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px;">
          <h2 style="font-size: 15px; font-weight: bold; margin: 0;">${state.settings.center_name}</h2>
          <p style="font-size: 10px; margin: 2px 0;">${state.settings.tagline || ''}</p>
          <p style="font-size: 10px; margin: 2px 0;">${state.settings.address}</p>
          <p style="font-size: 10px; margin: 2px 0;">Tel: ${state.settings.phone}</p>
          <div style="margin: 6px 0;">${barcodeSvg}</div>
          <div style="font-size: 11px; font-weight: bold;">MONEY RECEIPT & LAB TOKEN</div>
        </div>

        <div style="font-size: 11px; margin-bottom: 8px; line-height: 1.4;">
          <div><strong>Bill No:</strong> ${inv.invoice_no}</div>
          <div><strong>Date:</strong> ${new Date(inv.created_at).toLocaleString()}</div>
          <div><strong>Patient:</strong> ${inv.patient_name} (${inv.patient_gender}, ${inv.patient_age}${inv.patient_age_unit})</div>
          <div><strong>PID:</strong> ${inv.patient_uid} | <strong>Mob:</strong> ${inv.patient_phone}</div>
          <div><strong>Ref. Doctor:</strong> ${inv.doctor_name}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
          <thead>
            <tr style="border-top: 1px dashed #000; border-bottom: 1px dashed #000;">
              <th style="text-align: left; padding: 3px 0;">Test Description</th>
              <th style="text-align: right; padding: 3px 0;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items.map(i => `
              <tr>
                <td style="padding: 2px 0;">
                  <div>${i.test_name}</div>
                  <div style="font-size: 9px; color: #555;">[${i.room_no || 'Lab'}] • Del: ${i.delivery_time}</div>
                </td>
                <td style="text-align: right; vertical-align: top; padding: 2px 0;">${formatCurrency(i.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="border-top: 1px dashed #000; padding-top: 4px; font-size: 11px; line-height: 1.4;">
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal:</span>
            <span>${formatCurrency(inv.subtotal)}</span>
          </div>
          ${inv.discount_amount > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Discount (${inv.discount_remark || 'Special'}):</span>
              <span>-${formatCurrency(inv.discount_amount)}</span>
            </div>
          ` : ''}
          ${inv.urgent_surcharge > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Urgent Surcharge:</span>
              <span>+${formatCurrency(inv.urgent_surcharge)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #000; margin-top: 3px; padding-top: 3px;">
            <span>Net Payable:</span>
            <span>${formatCurrency(inv.net_amount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Paid (${inv.payment_method}):</span>
            <span>${formatCurrency(inv.paid_amount)}</span>
          </div>
          ${inv.due_amount > 0 ? `
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;">
              <span>DUE BALANCE:</span>
              <span>${formatCurrency(inv.due_amount)}</span>
            </div>
          ` : `
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #059669;">
              <span>STATUS:</span>
              <span>PAID IN FULL</span>
            </div>
          `}
        </div>

        ${inv.sampleTubes && inv.sampleTubes.length > 0 ? `
          <div style="border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px;">
            <div style="font-weight: bold; text-align: center; font-size: 10px;">SAMPLE COLLECTION TOKEN</div>
            ${inv.sampleTubes.map(s => `
              <div style="font-size: 10px; display: flex; justify-content: space-between; margin-top: 2px;">
                <span>• ${s.specimen}</span>
                <span>${s.room}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div style="text-align: center; margin: 10px 0;">
          ${qrSvg}
          <div style="font-size: 9px; color: #64748b;">Scan to verify report online</div>
        </div>

        <div style="text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 6px;">
          <p>${state.settings.notice || 'Bring this slip to collect test report.'}</p>
          <p style="margin-top: 4px;">Thank you for trusting our care.</p>
        </div>
      </div>
    `;
  } else {
    // A4 Diagnostic Letterhead mode
    container.innerHTML = `
      <div class="a4-invoice" style="max-width: 800px; margin: 0 auto; background: white; padding: 24px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 14px; margin-bottom: 16px;">
          <div>
            <h1 style="font-size: 22px; color: #0369a1; font-weight: 800; margin: 0;">${state.settings.center_name}</h1>
            <p style="font-size: 12px; color: #0d9488; font-weight: 600; margin: 2px 0;">${state.settings.tagline}</p>
            <p style="font-size: 11px; color: #475569; margin: 2px 0;">${state.settings.address}</p>
            <p style="font-size: 11px; color: #475569; margin: 2px 0;">Hotline: ${state.settings.phone} | Reg: ${state.settings.license_no || 'DGHS-REG'}</p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            ${qrSvg}
            <div style="text-align: right;">
              <div style="display: inline-block;">${barcodeSvg}</div>
              <div style="font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 4px;">MONEY RECEIPT & INVOICE</div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 12px;">
          <div>
            <div><strong style="color: #64748b;">Patient Name:</strong> <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${inv.patient_name}</span></div>
            <div><strong style="color: #64748b;">Patient ID (MRN):</strong> ${inv.patient_uid}</div>
            <div><strong style="color: #64748b;">Age / Gender:</strong> ${inv.patient_age} ${inv.patient_age_unit} / ${inv.patient_gender}</div>
            <div><strong style="color: #64748b;">Phone:</strong> ${inv.patient_phone}</div>
            ${inv.patient_address ? `<div><strong style="color: #64748b;">Address:</strong> ${inv.patient_address}</div>` : ''}
          </div>
          <div>
            <div><strong style="color: #64748b;">Invoice No:</strong> <span style="font-weight: 700;">${inv.invoice_no}</span></div>
            <div><strong style="color: #64748b;">Date & Time:</strong> ${new Date(inv.created_at).toLocaleString()}</div>
            <div><strong style="color: #64748b;">Referred By:</strong> <span style="font-weight: 600; color: #0369a1;">${inv.doctor_name}</span></div>
            ${inv.doctor_degrees ? `<div><strong style="color: #64748b;">Degrees:</strong> ${inv.doctor_degrees}</div>` : ''}
            <div><strong style="color: #64748b;">Est. Report Delivery:</strong> ${inv.delivery_date}</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px;">
          <thead>
            <tr style="background: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px; text-align: center; width: 40px;">#</th>
              <th style="padding: 8px; text-align: left; width: 80px;">Code</th>
              <th style="padding: 8px; text-align: left;">Test Name / Investigation</th>
              <th style="padding: 8px; text-align: left;">Department</th>
              <th style="padding: 8px; text-align: left;">Sample / Room</th>
              <th style="padding: 8px; text-align: right; width: 100px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${inv.items.map((item, idx) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px; text-align: center; color: #64748b;">${idx + 1}</td>
                <td style="padding: 8px; font-family: monospace; font-weight: 600;">${item.test_code}</td>
                <td style="padding: 8px; font-weight: 600;">${item.test_name}</td>
                <td style="padding: 8px; color: #475569;">${item.department_name}</td>
                <td style="padding: 8px; color: #475569; font-size: 11px;">${item.specimen} (${item.room_no || 'Lab'})</td>
                <td style="padding: 8px; text-align: right; font-weight: 700;">${formatCurrency(item.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
          <div style="width: 300px; font-size: 12px; line-height: 1.6;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Subtotal:</span>
              <span style="font-weight: 600;">${formatCurrency(inv.subtotal)}</span>
            </div>
            ${inv.discount_amount > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #059669;">
                <span>Discount (${inv.discount_remark || 'Authorized'}):</span>
                <span>-${formatCurrency(inv.discount_amount)}</span>
              </div>
            ` : ''}
            ${inv.urgent_surcharge > 0 ? `
              <div style="display: flex; justify-content: space-between; color: #ea580c;">
                <span>Urgent Surcharge (15%):</span>
                <span>+${formatCurrency(inv.urgent_surcharge)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 4px; font-size: 14px; font-weight: 800; color: #0f172a;">
              <span>Net Payable:</span>
              <span>${formatCurrency(inv.net_amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 600;">
              <span>Amount Paid (${inv.payment_method}):</span>
              <span>${formatCurrency(inv.paid_amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 13px; color: ${inv.due_amount > 0 ? '#dc2626' : '#059669'};">
              <span>${inv.due_amount > 0 ? 'DUE BALANCE:' : 'PAID IN FULL'}</span>
              <span>${formatCurrency(inv.due_amount)}</span>
            </div>
          </div>
        </div>

        <div style="border-top: 2px dashed #94a3b8; padding-top: 14px; margin-top: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 700; font-size: 12px; color: #0369a1;">PHLEBOTOMY & SAMPLE COLLECTION TOKEN</span>
            <span style="font-size: 11px; color: #64748b;">Token No: ${inv.invoice_no}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
            ${inv.sampleTubes.map(tube => `
              <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #fafafa; font-size: 11px;">
                <div style="font-weight: bold; color: #b45309;">${tube.specimen}</div>
                <div style="color: #475569;">Tests: ${tube.tests}</div>
                <div style="color: #64748b; font-size: 10px;">${tube.room}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="margin-top: 35px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
          <div>
            <p>${state.settings.notice || 'Bring this receipt to collect report.'}</p>
            <p style="margin-top: 4px;">System Generated • CarePlus Diagnostic POS</p>
          </div>
          <div style="text-align: center; border-top: 1px solid #94a3b8; width: 160px; padding-top: 4px;">
            Authorized Signature
          </div>
        </div>
      </div>
    `;
  }
}

// Invoices & Dues View
async function loadInvoices() {
  const params = new URLSearchParams();
  if (state.invoiceFilter.status !== 'ALL') params.set('status', state.invoiceFilter.status);
  if (state.invoiceFilter.dueOnly) params.set('due_only', '1');
  if (state.invoiceFilter.search) params.set('search', state.invoiceFilter.search);
  if (state.invoiceFilter.date) params.set('date', state.invoiceFilter.date);

  const invoices = await api(`/api/invoices?${params.toString()}`);
  state.invoices = invoices;
  renderInvoicesTable();
}

function renderInvoicesTable() {
  const tbody = $('#invoices-table-body');
  if (!tbody) return;

  if (state.invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No invoices found matching criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.invoices.map(inv => {
    const isDue = inv.due_amount > 0;
    return `
      <tr>
        <td style="font-family: monospace; font-weight: 700; color: #0284c7;">${inv.invoice_no}</td>
        <td>
          <div style="font-weight: 600;">${inv.patient_name}</div>
          <div style="font-size: 0.7rem; color: #64748b;">${inv.patient_phone} • ${inv.patient_uid}</div>
        </td>
        <td>${inv.doctor_name}</td>
        <td><span class="badge" style="background: #e2e8f0;">${inv.items_count} Tests</span></td>
        <td style="font-weight: 700;">${formatCurrency(inv.net_amount)}</td>
        <td style="color: #059669; font-weight: 600;">${formatCurrency(inv.paid_amount)}</td>
        <td style="font-weight: 700; color: ${isDue ? '#dc2626' : '#64748b'};">
          ${isDue ? formatCurrency(inv.due_amount) : 'PAID'}
        </td>
        <td>
          <span class="badge badge-${inv.status.toLowerCase()}">${inv.status.replace('_', ' ')}</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="window.posApp.viewInvoice(${inv.id})">Receipt</button>
          <button class="btn btn-primary btn-sm" style="margin-left: 4px;" onclick="window.posApp.openReportModal(${inv.id})">Report</button>
          ${isDue ? `<button class="btn btn-warning btn-sm" style="background: #f59e0b; color: white; margin-left: 4px;" onclick="window.posApp.openDueModal(${inv.id})">Collect Due</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// Due Collection Modal
async function openDueModal(invoiceId) {
  const inv = await api(`/api/invoices/${invoiceId}`);
  state.dueModalInvoice = inv;

  $('#due-modal-inv-no').textContent = inv.invoice_no;
  $('#due-modal-patient').textContent = `${inv.patient_name} (${inv.patient_phone})`;
  $('#due-modal-net').textContent = formatCurrency(inv.net_amount);
  $('#due-modal-paid').textContent = formatCurrency(inv.paid_amount);
  $('#due-modal-due').textContent = formatCurrency(inv.due_amount);
  $('#due-collect-amount').value = inv.due_amount;
  $('#due-collect-amount').max = inv.due_amount;

  $('#due-modal').style.display = 'flex';
}

async function submitDuePayment() {
  const inv = state.dueModalInvoice;
  if (!inv) return;

  const amount = Number($('#due-collect-amount').value);
  const method = $('#due-pay-method').value;
  const ref = $('#due-pay-ref').value;

  if (!amount || amount <= 0) {
    showToast('Please enter a valid due collection amount', 'error');
    return;
  }

  try {
    await api(`/api/invoices/${inv.id}/due-payment`, {
      method: 'POST',
      body: JSON.stringify({
        amount,
        payment_method: method,
        payment_reference: ref
      })
    });

    showToast(`Successfully collected ${formatCurrency(amount)} for ${inv.invoice_no}`, 'success');
    $('#due-modal').style.display = 'none';

    loadInvoices();
    api('/api/stats').then(st => {
      state.stats = st;
      renderHeaderStats();
    });

    openPrintModal(inv.id);
  } catch (err) {}
}

// Lab Tracker & Results Entry
async function loadLabTracker() {
  const invoices = await api('/api/invoices?limit=100');
  const tbody = $('#lab-table-body');
  if (!tbody) return;

  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td style="font-family: monospace; font-weight: 700;">${inv.invoice_no}</td>
      <td>
        <div style="font-weight: 600;">${inv.patient_name}</div>
        <div style="font-size: 0.7rem; color: #64748b;">${inv.patient_gender}, ${inv.patient_age}${inv.patient_age_unit}</div>
      </td>
      <td>${inv.doctor_name}</td>
      <td>
        <span class="badge badge-${inv.status.toLowerCase()}">${inv.status.replace('_', ' ')}</span>
      </td>
      <td style="font-size: 0.75rem; color: #475569;">${inv.delivery_date}</td>
      <td>
        <select class="form-control" style="font-size: 0.75rem; padding: 2px 6px;" onchange="window.posApp.updateStatus(${inv.id}, this.value)">
          <option value="SAMPLE_PENDING" ${inv.status === 'SAMPLE_PENDING' ? 'selected' : ''}>Sample Pending</option>
          <option value="SAMPLE_COLLECTED" ${inv.status === 'SAMPLE_COLLECTED' ? 'selected' : ''}>Sample Collected</option>
          <option value="IN_TESTING" ${inv.status === 'IN_TESTING' ? 'selected' : ''}>In Testing</option>
          <option value="READY" ${inv.status === 'READY' ? 'selected' : ''}>Ready for Delivery</option>
          <option value="DELIVERED" ${inv.status === 'DELIVERED' ? 'selected' : ''}>Delivered</option>
        </select>
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="window.posApp.openResultsModal(${inv.id})">📝 Enter Results</button>
        <button class="btn btn-primary btn-sm" style="margin-left: 4px;" onclick="window.posApp.openReportModal(${inv.id})">📄 View Report</button>
      </td>
    </tr>
  `).join('');
}

async function updateStatus(invoiceId, newStatus) {
  try {
    await api(`/api/invoices/${invoiceId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
    api('/api/stats').then(st => {
      state.stats = st;
      renderHeaderStats();
    });
  } catch (err) {}
}

// Result Entry Modal
async function openResultsModal(invoiceId) {
  const report = await api(`/api/invoices/${invoiceId}/report`);
  state.activeResultsInvoice = report;

  $('#results-modal-inv-no').textContent = report.invoice_no;
  $('#results-modal-patient').textContent = `${report.patient_name} (${report.patient_gender}, ${report.patient_age}${report.patient_age_unit})`;

  const container = $('#results-form-container');
  let html = '';

  for (const item of report.items) {
    html += `
      <div style="margin-bottom: 1.25rem; background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; padding: 10px;">
        <div style="font-weight: 700; color: #0284c7; margin-bottom: 6px; font-size: 0.9rem;">
          ${item.test_name} (${item.test_code}) • <span style="font-size: 0.75rem; color: #64748b;">${item.department_name}</span>
        </div>
    `;

    if (item.standardParams.length === 0) {
      html += `
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
          <input type="text" class="form-control general-test-result" data-item-id="${item.id}" data-param-name="${item.test_name}" placeholder="Enter clinical finding / report text..." value="${item.savedResults[0]?.result_value || ''}">
        </div>
      `;
    } else {
      html += `
        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 35%;">Parameter</th>
              <th style="width: 25%;">Result Value</th>
              <th style="width: 15%;">Unit</th>
              <th style="width: 25%;">Ref Interval</th>
            </tr>
          </thead>
          <tbody>
      `;
      for (const p of item.standardParams) {
        const existing = item.savedResults.find(r => r.parameter_id === p.id);
        const val = existing ? existing.result_value : (p.default_value || '');
        const ref = report.patient_gender === 'FEMALE' ? (p.ref_range_female || p.ref_range_male) : p.ref_range_male;

        html += `
          <tr>
            <td style="font-weight: 600;">${p.name}</td>
            <td>
              <input type="text" class="param-input" 
                data-item-id="${item.id}" 
                data-param-id="${p.id}" 
                data-param-name="${p.name}" 
                data-unit="${p.unit || ''}" 
                data-ref="${ref || ''}" 
                value="${val}" 
                placeholder="Value">
            </td>
            <td style="color: #64748b;">${p.unit || '-'}</td>
            <td style="color: #64748b; font-size: 0.75rem;">${ref || 'Normal'}</td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    }

    html += `</div>`;
  }

  container.innerHTML = html;
  $('#results-modal').style.display = 'flex';
}

async function submitResults() {
  const inv = state.activeResultsInvoice;
  if (!inv) return;

  const results = [];

  // Standard params
  $$('.param-input').forEach(input => {
    const val = input.value.trim();
    if (val) {
      results.push({
        invoice_item_id: Number(input.getAttribute('data-item-id')),
        parameter_id: Number(input.getAttribute('data-param-id')),
        parameter_name: input.getAttribute('data-param-name'),
        result_value: val,
        unit: input.getAttribute('data-unit') || '',
        reference_range: input.getAttribute('data-ref') || '',
        flag: 'NORMAL'
      });
    }
  });

  // General text findings
  $$('.general-test-result').forEach(input => {
    const val = input.value.trim();
    if (val) {
      results.push({
        invoice_item_id: Number(input.getAttribute('data-item-id')),
        parameter_id: null,
        parameter_name: input.getAttribute('data-param-name'),
        result_value: val,
        unit: '',
        reference_range: '',
        flag: 'NORMAL'
      });
    }
  });

  try {
    await api(`/api/invoices/${inv.id}/results`, {
      method: 'POST',
      body: JSON.stringify({ results })
    });

    showToast('Lab test findings saved successfully!', 'success');
    $('#results-modal').style.display = 'none';
    loadLabTracker();
  } catch (err) {}
}

// Lab Report View & Printing
async function openReportModal(invoiceId) {
  const rep = await api(`/api/invoices/${invoiceId}/report`);
  state.activeReportInvoice = rep;

  const container = $('#report-preview-content');
  const barcodeSvg = generateBarcodeSvg(rep.invoice_no, { height: 35, barWidth: 1.5, fontSize: 10 });
  const qrSvg = generateQrCodeSvg(`LAB-REPORT|${rep.invoice_no}|${rep.patient_uid}|CarePlus`, { size: 75 });

  let testsHtml = '';
  for (const item of rep.items) {
    testsHtml += `
      <div style="margin-bottom: 20px;">
        <div style="background: #e2e8f0; padding: 6px 10px; font-weight: 700; font-size: 13px; color: #0f172a; border-left: 4px solid #0284c7; text-transform: uppercase;">
          ${item.department_name} — ${item.test_name}
        </div>
    `;

    if (item.savedResults && item.savedResults.length > 0) {
      testsHtml += `
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="border-bottom: 1.5px solid #cbd5e1; background: #f8fafc;">
              <th style="text-align: left; padding: 6px 8px; width: 40%;">Investigation Parameter</th>
              <th style="text-align: left; padding: 6px 8px; width: 20%;">Observed Result</th>
              <th style="text-align: left; padding: 6px 8px; width: 15%;">Unit</th>
              <th style="text-align: left; padding: 6px 8px; width: 25%;">Biological Reference Interval</th>
            </tr>
          </thead>
          <tbody>
            ${item.savedResults.map(r => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 8px; font-weight: 600;">${r.parameter_name}</td>
                <td style="padding: 6px 8px; font-weight: 700; color: ${r.flag !== 'NORMAL' ? '#dc2626' : '#0f172a'};">
                  ${r.result_value} ${r.flag !== 'NORMAL' ? `(${r.flag})` : ''}
                </td>
                <td style="padding: 6px 8px; color: #64748b;">${r.unit || '-'}</td>
                <td style="padding: 6px 8px; color: #64748b; font-size: 11px;">${r.reference_range || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      testsHtml += `
        <div style="padding: 10px; font-style: italic; color: #64748b; font-size: 12px;">
          Findings pending or being analyzed in lab department.
        </div>
      `;
    }

    testsHtml += `</div>`;
  }

  container.innerHTML = `
    <div class="clinical-report" style="max-width: 800px; margin: 0 auto; background: white; padding: 24px; border: 1px solid #cbd5e1; border-radius: 8px;">
      
      <!-- Diagnostic Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 22px; color: #0369a1; font-weight: 800; margin: 0;">${state.settings.center_name}</h1>
          <p style="font-size: 12px; color: #0d9488; font-weight: 600; margin: 2px 0;">${state.settings.tagline}</p>
          <p style="font-size: 11px; color: #475569; margin: 2px 0;">${state.settings.address}</p>
          <p style="font-size: 11px; color: #475569; margin: 2px 0;">Hotline: ${state.settings.phone} | Lic: ${state.settings.license_no}</p>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          ${qrSvg}
          <div style="text-align: right;">
            ${barcodeSvg}
            <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 4px;">CLINICAL LAB REPORT</div>
          </div>
        </div>
      </div>

      <!-- Patient & Referral Info -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 12px;">
        <div>
          <div><strong style="color: #64748b;">Patient Name:</strong> <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${rep.patient_name}</span></div>
          <div><strong style="color: #64748b;">Patient ID (MRN):</strong> ${rep.patient_uid}</div>
          <div><strong style="color: #64748b;">Age / Gender:</strong> ${rep.patient_age} ${rep.patient_age_unit} / ${rep.patient_gender}</div>
          <div><strong style="color: #64748b;">Contact:</strong> ${rep.patient_phone}</div>
        </div>
        <div>
          <div><strong style="color: #64748b;">Invoice No:</strong> <span style="font-weight: 700;">${rep.invoice_no}</span></div>
          <div><strong style="color: #64748b;">Sample Received:</strong> ${new Date(rep.created_at).toLocaleString()}</div>
          <div><strong style="color: #64748b;">Ref. Doctor:</strong> <span style="font-weight: 600; color: #0369a1;">${rep.doctor_name}</span></div>
          ${rep.doctor_degrees ? `<div><strong style="color: #64748b;">Degrees:</strong> ${rep.doctor_degrees}</div>` : ''}
        </div>
      </div>

      <!-- Test Findings Section -->
      ${testsHtml}

      <!-- Pathologist Signatures -->
      <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 11px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 24px;">
        <div style="text-align: center; width: 180px;">
          <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-weight: 600;">Medical Technologist (Lab)</div>
          <div style="font-size: 10px; color: #64748b;">CarePlus Pathology Lab</div>
        </div>
        <div style="text-align: center; width: 220px;">
          <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-weight: 700; color: #0f172a;">Dr. Shahedul Alam, MD</div>
          <div style="font-size: 10px; color: #64748b;">Consultant Clinical Pathologist</div>
          <div style="font-size: 10px; color: #64748b;">BMDC Reg: A-44912</div>
        </div>
      </div>

    </div>
  `;

  $('#report-modal').style.display = 'flex';
}

// Cashier Day-End Shift Handover Modal
async function openShiftModal() {
  const dateInput = $('#report-date-input')?.value || new Date().toISOString().split('T')[0];
  const daily = await api(`/api/reports/daily-close?date=${dateInput}`);
  const sum = daily.summary;

  const container = $('#shift-preview-content');
  container.innerHTML = `
    <div class="shift-slip" style="max-width: 480px; margin: 0 auto; background: white; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 12px;">
      <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
        <h2 style="font-size: 16px; font-weight: 800; margin: 0;">${state.settings.center_name}</h2>
        <div style="font-size: 12px; font-weight: 700; margin-top: 4px;">DAY-END CASHIER SHIFT CLOSURE SLIP</div>
        <div style="font-size: 11px; color: #64748b;">Date: ${daily.date} • Printed: ${new Date().toLocaleTimeString()}</div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px;">
        <tbody>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0;">Total Invoices Issued:</td><td style="text-align: right; font-weight: 700;">${sum.total_invoices}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 4px 0;">Gross Investigation Sales:</td><td style="text-align: right; font-weight: 700;">${formatCurrency(sum.gross_subtotal)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0; color: #ea580c;"><td style="padding: 4px 0;">Authorized Discounts Given:</td><td style="text-align: right; font-weight: 700;">-${formatCurrency(sum.total_discount)}</td></tr>
          <tr style="border-bottom: 1.5px solid #0f172a; font-weight: bold;"><td style="padding: 6px 0;">Net Billed Revenue:</td><td style="text-align: right; font-size: 13px; color: #0284c7;">${formatCurrency(sum.total_net_bill)}</td></tr>
          <tr style="border-bottom: 1px solid #e2e8f0; color: #dc2626;"><td style="padding: 4px 0;">Remaining Due Outstanding:</td><td style="text-align: right; font-weight: 700;">${formatCurrency(sum.total_due_remaining)}</td></tr>
        </tbody>
      </table>

      <div style="font-weight: 700; margin-bottom: 6px;">Cashier Collection Breakdown:</div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
            <th style="text-align: left; padding: 4px;">Method</th>
            <th style="text-align: center; padding: 4px;">Tx Count</th>
            <th style="text-align: right; padding: 4px;">Total Received</th>
          </tr>
        </thead>
        <tbody>
          ${daily.paymentBreakdown.map(p => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 4px; font-weight: 600;">${p.payment_method} (${p.payment_type})</td>
              <td style="text-align: center; padding: 4px;">${p.transaction_count}</td>
              <td style="text-align: right; padding: 4px; font-weight: 700;">${formatCurrency(p.total_amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 6px; padding: 10px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 700; color: #166534; font-size: 13px;">TOTAL CASH HANDOVER:</span>
        <span style="font-size: 16px; font-weight: 800; color: #15803d;">
          ${formatCurrency(daily.paymentBreakdown.filter(p => p.payment_method === 'CASH').reduce((a, b) => a + b.total_amount, 0))}
        </span>
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 30px; font-size: 11px; color: #64748b;">
        <div style="text-align: center; border-top: 1px solid #94a3b8; width: 140px; padding-top: 4px;">Cashier Signature</div>
        <div style="text-align: center; border-top: 1px solid #94a3b8; width: 140px; padding-top: 4px;">Manager / Accounts</div>
      </div>
    </div>
  `;

  $('#shift-modal').style.display = 'flex';
}

// Reports
async function loadReports() {
  const dateInput = $('#report-date-input')?.value || new Date().toISOString().split('T')[0];
  const [daily, commissions] = await Promise.all([
    api(`/api/reports/daily-close?date=${dateInput}`),
    api('/api/reports/doctor-commissions')
  ]);

  const sum = daily.summary;
  $('#report-gross').textContent = formatCurrency(sum.gross_subtotal);
  $('#report-discount').textContent = formatCurrency(sum.total_discount);
  $('#report-net').textContent = formatCurrency(sum.total_net_bill);
  $('#report-paid').textContent = formatCurrency(sum.total_paid_amount);
  $('#report-due').textContent = formatCurrency(sum.total_due_remaining);

  const payTbody = $('#report-payments-body');
  if (payTbody) {
    payTbody.innerHTML = daily.paymentBreakdown.map(p => `
      <tr>
        <td style="font-weight: 600;">${p.payment_method}</td>
        <td><span class="badge" style="background: #e0f2fe;">${p.payment_type}</span></td>
        <td>${p.transaction_count}</td>
        <td style="text-align: right; font-weight: 700;">${formatCurrency(p.total_amount)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">No payments recorded today</td></tr>';
  }

  const docTbody = $('#report-commissions-body');
  if (docTbody) {
    docTbody.innerHTML = commissions.map(c => `
      <tr>
        <td>
          <div style="font-weight: 700;">${c.doctor_name}</div>
          <div style="font-size: 0.7rem; color: #64748b;">${c.doctor_degrees || ''}</div>
        </td>
        <td>${c.commission_percent}%</td>
        <td>${c.total_referrals}</td>
        <td>${formatCurrency(c.total_subtotal)}</td>
        <td style="text-align: right; font-weight: 700; color: #0284c7;">
          ${formatCurrency(c.total_commission_payable)}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align: center; color: #94a3b8;">No doctor referrals recorded</td></tr>';
  }
}

// Global App Initialization
function setupEventListeners() {
  $$('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  $('#test-search-input')?.addEventListener('input', () => {
    renderTests();
  });

  let phoneTimeout;
  $('#patient-phone')?.addEventListener('input', (e) => {
    clearTimeout(phoneTimeout);
    const q = e.target.value.trim();
    if (q.length >= 3) {
      phoneTimeout = setTimeout(async () => {
        const matches = await api(`/api/patients/search?q=${encodeURIComponent(q)}`);
        const dropdown = $('#patient-autocomplete');
        if (matches.length > 0) {
          dropdown.innerHTML = matches.map(p => `
            <div class="autocomplete-item" data-id="${p.id}">
              <div>
                <strong>${p.name}</strong> (${p.gender}, ${p.age}${p.age_unit})
                <div style="font-size: 0.7rem; color: #64748b;">${p.phone} • ${p.patient_uid}</div>
              </div>
              <span class="badge" style="background: #e0f2fe;">Select</span>
            </div>
          `).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
              const pId = Number(item.getAttribute('data-id'));
              const selected = matches.find(m => m.id === pId);
              if (selected) {
                state.patient = selected;
                $('#patient-name').value = selected.name;
                $('#patient-phone').value = selected.phone;
                $('#patient-age').value = selected.age;
                $('#patient-age-unit').value = selected.age_unit;
                $('#patient-gender').value = selected.gender;
                $('#patient-address').value = selected.address || '';
                dropdown.style.display = 'none';
              }
            });
          });
        } else {
          dropdown.style.display = 'none';
        }
      }, 250);
    } else {
      $('#patient-autocomplete').style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#patient-autocomplete') && e.target.id !== 'patient-phone') {
      const drop = $('#patient-autocomplete');
      if (drop) drop.style.display = 'none';
    }
  });

  $('#discount-type-select')?.addEventListener('change', (e) => {
    state.discountType = e.target.value;
    const remarkInput = $('#discount-remark-input');
    if (state.discountType !== 'NONE') {
      remarkInput.style.display = 'block';
    } else {
      remarkInput.style.display = 'none';
      state.discountValue = 0;
      $('#discount-val-input').value = '';
    }
    renderCart();
  });

  $('#discount-val-input')?.addEventListener('input', (e) => {
    state.discountValue = Number(e.target.value) || 0;
    renderCart();
  });

  $('#discount-remark-input')?.addEventListener('input', (e) => {
    state.discountRemark = e.target.value;
  });

  $('#urgent-toggle')?.addEventListener('change', (e) => {
    state.urgent = e.target.checked;
    renderCart();
  });

  $$('.btn-pay-method').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.btn-pay-method').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.paymentMethod = btn.getAttribute('data-method');
      const refInput = $('#payment-ref-input');
      if (state.paymentMethod !== 'CASH') {
        refInput.placeholder = `Transaction / Trx ID (${state.paymentMethod})`;
      } else {
        refInput.placeholder = 'Remarks / Note';
      }
    });
  });

  $('#payment-ref-input')?.addEventListener('input', (e) => {
    state.paymentReference = e.target.value;
  });

  $('#paid-amount-input')?.addEventListener('input', (e) => {
    state.paidAmount = e.target.value;
    renderCart();
  });

  $$('.btn-quick-cash').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      const calc = calculateBilling();
      if (val === 'exact') {
        state.paidAmount = calc.netAmount;
      } else {
        state.paidAmount = Number(val);
      }
      $('#paid-amount-input').value = state.paidAmount;
      renderCart();
    });
  });

  $('#btn-complete-pos')?.addEventListener('click', completeCheckout);

  $('#btn-clear-cart')?.addEventListener('click', () => {
    if (confirm('Clear current selected tests?')) {
      state.cart = [];
      renderTests();
      renderCart();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1') { e.preventDefault(); switchTab('pos'); }
    if (e.key === 'F2') { e.preventDefault(); switchTab('invoices'); }
    if (e.key === 'F3') { e.preventDefault(); switchTab('lab'); }
    if (e.key === 'F4') { e.preventDefault(); switchTab('reports'); }
    if (e.key === 'F5') { e.preventDefault(); switchTab('settings'); }
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (state.activeTab === 'pos') completeCheckout();
    }
    if (e.key === 'Escape') {
      $$('.modal-overlay').forEach(m => m.style.display = 'none');
    }
  });

  $('#btn-modal-print')?.addEventListener('click', () => {
    document.body.className = `print-mode-${state.printMode}`;
    window.print();
  });

  $('#btn-toggle-thermal')?.addEventListener('click', () => {
    state.printMode = 'thermal';
    $('#btn-toggle-thermal').classList.add('active');
    $('#btn-toggle-a4').classList.remove('active');
    renderPrintPreview();
  });

  $('#btn-toggle-a4')?.addEventListener('click', () => {
    state.printMode = 'a4';
    $('#btn-toggle-a4').classList.add('active');
    $('#btn-toggle-thermal').classList.remove('active');
    renderPrintPreview();
  });

  $('#btn-print-report')?.addEventListener('click', () => {
    document.body.className = 'print-mode-report';
    window.print();
  });

  $('#btn-print-shift')?.addEventListener('click', () => {
    document.body.className = 'print-mode-a4';
    window.print();
  });

  $$('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.modal-overlay').forEach(m => m.style.display = 'none');
    });
  });

  $('#btn-submit-due')?.addEventListener('click', submitDuePayment);
  $('#btn-submit-results')?.addEventListener('click', submitResults);

  $('#inv-filter-status')?.addEventListener('change', (e) => {
    state.invoiceFilter.status = e.target.value;
    loadInvoices();
  });
  $('#inv-filter-due')?.addEventListener('change', (e) => {
    state.invoiceFilter.dueOnly = e.target.checked;
    loadInvoices();
  });
  $('#inv-filter-search')?.addEventListener('input', (e) => {
    state.invoiceFilter.search = e.target.value;
    loadInvoices();
  });
  $('#inv-filter-date')?.addEventListener('change', (e) => {
    state.invoiceFilter.date = e.target.value;
    loadInvoices();
  });

  // Export CSV Triggers
  $('#btn-export-invoices-csv')?.addEventListener('click', () => {
    const d = state.invoiceFilter.date || '';
    window.open(`/api/export/invoices-csv${d ? `?date=${d}` : ''}`, '_blank');
  });

  $('#btn-export-commissions-csv')?.addEventListener('click', () => {
    window.open('/api/export/commissions-csv', '_blank');
  });

  $('#btn-open-shift-modal')?.addEventListener('click', openShiftModal);

  $('#settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());
    const updated = await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    state.settings = updated;
    showToast('Settings saved successfully', 'success');
  });

  $('#btn-open-new-test-modal')?.addEventListener('click', () => {
    const sel = $('#new-test-dept');
    sel.innerHTML = state.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    $('#new-test-modal').style.display = 'flex';
  });

  $('#form-new-test')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/api/tests', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('New diagnostic test added to catalog', 'success');
      $('#new-test-modal').style.display = 'none';
      e.target.reset();
      state.tests = await api('/api/tests');
      state.departments = await api('/api/departments');
      renderDepartments();
      renderTests();
    } catch (err) {}
  });

  $('#btn-open-new-doctor-modal')?.addEventListener('click', () => {
    $('#new-doctor-modal').style.display = 'flex';
  });

  $('#form-new-doctor')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const doc = await api('/api/doctors', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast(`Doctor ${doc.name} added`, 'success');
      $('#new-doctor-modal').style.display = 'none';
      e.target.reset();
      state.doctors = await api('/api/doctors');
      renderDoctorsDropdown();
    } catch (err) {}
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  $$('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });

  $$('.tab-content').forEach(view => {
    view.style.display = 'none';
  });

  const targetView = $(`#tab-view-${tab}`);
  if (targetView) targetView.style.display = 'flex';

  if (tab === 'invoices') loadInvoices();
  if (tab === 'lab') loadLabTracker();
  if (tab === 'reports') loadReports();
}

// Global exposure for inline events
window.posApp = {
  viewInvoice: openPrintModal,
  openDueModal: openDueModal,
  updateStatus: updateStatus,
  addPackage: addPackageToCart,
  openResultsModal: openResultsModal,
  openReportModal: openReportModal,
  loadReports: loadReports
};

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadInitialData();
  setInterval(updateClock, 1000);
  updateClock();
});
