// ======================================================
// CONFIGURATION - REPLACE WITH YOUR APPS SCRIPT WEB APP URL
// ======================================================
const API_BASE = 'https://script.google.com/macros/s/1PJK2gQqgAQrmBGrG_k3zPA1yz_LyoXYV4Bk65eNUt8rMMz9-UXkRJhSR/exec'; // <-- Replace

// ======================================================
// STATE
// ======================================================
let dropdownData = null;

// ======================================================
// HELPERS
// ======================================================
function showMessage(id, text, type = 'info') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'message ' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 10000);
}

function clearMessage(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'none'; el.className = 'message'; }
}

// ======================================================
// API CALLS
// ======================================================
async function callAPI(action, data = {}) {
  const url = API_BASE + '?action=' + action + (data.serial ? '&serial=' + encodeURIComponent(data.serial) : '');
  const options = {
    method: data.method || 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  if (data.method === 'POST' || data.body) {
    options.body = JSON.stringify({ action, ...data.body });
  }
  const response = await fetch(url, options);
  return response.json();
}

// ======================================================
// LOAD DROPDOWNS
// ======================================================
async function loadDropdowns() {
  try {
    const data = await callAPI('getDropdownData');
    if (data.success) {
      dropdownData = data;
      populateDropdowns(data);
    } else {
      showMessage('dailyMessage', 'Error loading data: ' + data.error, 'error');
    }
  } catch (e) {
    showMessage('dailyMessage', 'Network error: ' + e.message, 'error');
  }
}

function populateDropdowns(data) {
  // Customers
  ['dailyCustomer', 'serialCustomer'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Select Customer...</option>';
      data.customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code || c.name;
        opt.textContent = c.name + (c.code ? ' (' + c.code + ')' : '');
        sel.appendChild(opt);
      });
    }
  });

  // Projects
  ['dailyProject', 'serialProject', 'pettyProject'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Select Project...</option>';
      data.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    }
  });

  // Crew checkboxes
  const container = document.getElementById('crewCheckboxes');
  if (container) {
    container.innerHTML = '';
    data.crew.forEach(c => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = c.name;
      cb.className = 'crew-checkbox';
      label.appendChild(cb);
      label.appendChild(document.createTextNode(c.name + ' (' + c.role + ')'));
      container.appendChild(label);
    });
  }

  // Crew dropdowns
  ['serialCrew', 'petrolCrew', 'pettyPaidBy'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Select...</option>';
      data.crew.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    }
  });
}

// ======================================================
// MATERIALS
// ======================================================
function addMaterialRow() {
  const container = document.getElementById('materialContainer');
  const div = document.createElement('div');
  div.className = 'material-row';
  div.innerHTML = `
    <input type="text" class="material-item" placeholder="Item name or code">
    <input type="number" class="material-qty" placeholder="Qty" min="0" step="1">
    <button type="button" class="remove-btn" onclick="removeMaterial(this)">×</button>
  `;
  container.appendChild(div);
}

function removeMaterial(btn) {
  const row = btn.parentElement;
  if (document.querySelectorAll('.material-row').length > 1) row.remove();
}

function getMaterials() {
  const items = document.querySelectorAll('.material-item');
  const qtys = document.querySelectorAll('.material-qty');
  const materials = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i].value.trim();
    const qty = parseInt(qtys[i].value) || 0;
    if (item) materials.push({ item, qty });
  }
  return materials;
}

function getSelectedCrew() {
  const checkboxes = document.querySelectorAll('.crew-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// ======================================================
// CALCULATIONS
// ======================================================
function calcPetrolTotal() {
  const liters = parseFloat(document.getElementById('petrolLiters').value) || 0;
  const cost = parseFloat(document.getElementById('petrolCostPerLitre').value) || 0;
  if (liters && cost) {
    document.getElementById('petrolAmount').value = (liters * cost).toFixed(3);
  }
}

function calcPettyTotal() {
  const ex = parseFloat(document.getElementById('pettyAmountExVAT').value) || 0;
  const vat = parseFloat(document.getElementById('pettyVAT').value) || 0;
  document.getElementById('pettyTotalAmount').value = (ex + vat).toFixed(3);
}

// ======================================================
// FORM SUBMISSIONS
// ======================================================
async function submitDailyReport(e) {
  e.preventDefault();
  clearMessage('dailyMessage');
  const crew = getSelectedCrew();
  if (crew.length === 0) {
    showMessage('dailyMessage', 'Please select at least one crew member', 'error');
    return;
  }
  const data = {
    action: 'submitDailyReport',
    customer: document.getElementById('dailyCustomer').value,
    project: document.getElementById('dailyProject').value,
    workType: document.getElementById('dailyWorkType').value,
    description: document.getElementById('dailyDescription').value,
    materials: getMaterials(),
    crew,
    date: document.getElementById('dailyDate').value,
    startTime: document.getElementById('dailyStartTime').value,
    endTime: document.getElementById('dailyEndTime').value,
    photos: document.getElementById('dailyPhotos').value,
    issues: document.getElementById('dailyIssues').value,
    email: document.getElementById('dailyEmail').value
  };
  if (!data.customer || !data.project || !data.date || !data.startTime || !data.endTime) {
    showMessage('dailyMessage', 'Please fill all required fields', 'error');
    return;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const result = await callAPI('submitDailyReport', { method: 'POST', body: data });
    btn.disabled = false;
    btn.textContent = 'Submit Daily Report';
    if (result.success) {
      showMessage('dailyMessage', '✅ ' + result.message, 'success');
      // Reset non-essential fields
      document.getElementById('dailyWorkType').value = '';
      document.getElementById('dailyDescription').value = '';
      document.getElementById('dailyPhotos').value = '';
      document.getElementById('dailyIssues').value = '';
      document.getElementById('dailyEmail').value = '';
      document.getElementById('materialContainer').innerHTML = `
        <div class="material-row">
          <input type="text" class="material-item" placeholder="Item name or code">
          <input type="number" class="material-qty" placeholder="Qty" min="0" step="1">
          <button type="button" class="remove-btn" onclick="removeMaterial(this)">×</button>
        </div>
      `;
      document.querySelectorAll('.crew-checkbox').forEach(cb => cb.checked = false);
    } else {
      showMessage('dailyMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Daily Report';
    showMessage('dailyMessage', '❌ Error: ' + error.message, 'error');
  }
}

async function submitSerialEntry(e) {
  e.preventDefault();
  clearMessage('serialMessage');
  const data = {
    action: 'submitSerialEntry',
    customer: document.getElementById('serialCustomer').value,
    project: document.getElementById('serialProject').value,
    date: document.getElementById('serialDate').value,
    item: document.getElementById('serialItem').value,
    serialNumber: document.getElementById('serialNumber').value,
    quantity: document.getElementById('serialQty').value || 1,
    crewOnSite: document.getElementById('serialCrew').value,
    photo: document.getElementById('serialPhoto').value,
    notes: document.getElementById('serialNotes').value
  };
  if (!data.customer || !data.project || !data.date || !data.item || !data.serialNumber) {
    showMessage('serialMessage', 'Please fill all required fields', 'error');
    return;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const result = await callAPI('submitSerialEntry', { method: 'POST', body: data });
    btn.disabled = false;
    btn.textContent = 'Submit Serial Entry';
    if (result.success) {
      showMessage('serialMessage', '✅ ' + result.message, 'success');
      document.getElementById('serialItem').value = '';
      document.getElementById('serialNumber').value = '';
      document.getElementById('serialQty').value = 1;
      document.getElementById('serialCrew').value = '';
      document.getElementById('serialPhoto').value = '';
      document.getElementById('serialNotes').value = '';
    } else {
      showMessage('serialMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Serial Entry';
    showMessage('serialMessage', '❌ Error: ' + error.message, 'error');
  }
}

async function submitPetrol(e) {
  e.preventDefault();
  clearMessage('petrolMessage');
  const data = {
    action: 'submitPetrol',
    crewMember: document.getElementById('petrolCrew').value,
    date: document.getElementById('petrolDate').value,
    odometer: document.getElementById('petrolOdometer').value,
    liters: document.getElementById('petrolLiters').value,
    costPerLitre: document.getElementById('petrolCostPerLitre').value,
    totalAmount: document.getElementById('petrolAmount').value,
    paymentMethod: document.getElementById('petrolPaymentMethod').value,
    receiptPhoto: document.getElementById('petrolReceipt').value,
    email: document.getElementById('petrolEmail').value
  };
  if (!data.crewMember || !data.date || !data.totalAmount) {
    showMessage('petrolMessage', 'Please fill all required fields', 'error');
    return;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const result = await callAPI('submitPetrol', { method: 'POST', body: data });
    btn.disabled = false;
    btn.textContent = 'Submit Petrol Entry';
    if (result.success) {
      showMessage('petrolMessage', '✅ ' + result.message, 'success');
      document.getElementById('petrolOdometer').value = '';
      document.getElementById('petrolLiters').value = '';
      document.getElementById('petrolCostPerLitre').value = '';
      document.getElementById('petrolAmount').value = '';
      document.getElementById('petrolReceipt').value = '';
      document.getElementById('petrolEmail').value = '';
    } else {
      showMessage('petrolMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Petrol Entry';
    showMessage('petrolMessage', '❌ Error: ' + error.message, 'error');
  }
}

async function submitPettyCash(e) {
  e.preventDefault();
  clearMessage('pettyMessage');
  const data = {
    action: 'submitPettyCash',
    date: document.getElementById('pettyDate').value,
    category: document.getElementById('pettyCategory').value,
    description: document.getElementById('pettyDescription').value,
    project: document.getElementById('pettyProject').value,
    amountExcludingVAT: document.getElementById('pettyAmountExVAT').value,
    vatAmount: document.getElementById('pettyVAT').value,
    totalAmount: document.getElementById('pettyTotalAmount').value,
    paidBy: document.getElementById('pettyPaidBy').value,
    paymentMethod: document.getElementById('pettyPaymentMethod').value,
    supplier: document.getElementById('pettySupplier').value,
    receiptPhoto: document.getElementById('pettyReceipt').value,
    notes: document.getElementById('pettyNotes').value,
    email: document.getElementById('pettyEmail').value
  };
  if (!data.date || !data.category || !data.description || !data.totalAmount) {
    showMessage('pettyMessage', 'Please fill all required fields', 'error');
    return;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const result = await callAPI('submitPettyCash', { method: 'POST', body: data });
    btn.disabled = false;
    btn.textContent = 'Submit Petty Cash';
    if (result.success) {
      showMessage('pettyMessage', '✅ ' + result.message, 'success');
      document.getElementById('pettyCategory').value = '';
      document.getElementById('pettyDescription').value = '';
      document.getElementById('pettyAmountExVAT').value = '';
      document.getElementById('pettyVAT').value = '';
      document.getElementById('pettyTotalAmount').value = '';
      document.getElementById('pettySupplier').value = '';
      document.getElementById('pettyReceipt').value = '';
      document.getElementById('pettyNotes').value = '';
      document.getElementById('pettyEmail').value = '';
    } else {
      showMessage('pettyMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Petty Cash';
    showMessage('pettyMessage', '❌ Error: ' + error.message, 'error');
  }
}

// ======================================================
// EXPORT
// ======================================================
async function generateBillableTime() {
  const btn = document.getElementById('exportBtn');
  const msg = document.getElementById('exportMessage');
  const resultDiv = document.getElementById('exportResult');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  msg.style.display = 'none';
  resultDiv.style.display = 'none';
  try {
    const result = await callAPI('generateBillableTime');
    btn.disabled = false;
    btn.textContent = 'Generate Billable Time CSV';
    if (result.success) {
      document.getElementById('exportCount').textContent = result.recordCount || 0;
      document.getElementById('exportFileLink').href = result.fileUrl;
      resultDiv.style.display = 'block';
      showMessage('exportMessage', '✅ ' + result.message, 'success');
    } else {
      showMessage('exportMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Generate Billable Time CSV';
    showMessage('exportMessage', '❌ Error: ' + error.message, 'error');
  }
}

// ======================================================
// SERIAL LOOKUP
// ======================================================
async function lookupSerial() {
  const serial = document.getElementById('lookupSerial').value.trim();
  const resultDiv = document.getElementById('lookupResult');
  if (!serial) {
    showMessage('lookupResult', 'Please enter a serial number', 'info');
    return;
  }
  try {
    const result = await callAPI('getSerialTracking', { serial });
    if (result.success) {
      if (result.records && result.records.length > 0) {
        let html = '<div style="font-weight:500; margin-bottom:8px;">Found ' + result.records.length + ' record(s):</div>';
        html += '<ul style="list-style:none; padding:0;">';
        result.records.forEach(r => {
          html += `<li style="padding:8px; background:#f5f7fa; margin-bottom:4px; border-radius:4px; font-size:13px;">
            <strong>${r['Column 2'] || 'N/A'}</strong> - 
            Customer: ${r['Column 3'] || 'N/A'} | 
            Project: ${r['Column 4'] || 'N/A'} | 
            Date: ${r['Column 5'] || 'N/A'}
          </li>`;
        });
        html += '</ul>';
        resultDiv.innerHTML = html;
        resultDiv.className = 'message info';
        resultDiv.style.display = 'block';
      } else {
        showMessage('lookupResult', 'No records found for serial: ' + serial, 'info');
      }
    } else {
      showMessage('lookupResult', 'Error: ' + result.error, 'error');
    }
  } catch (error) {
    showMessage('lookupResult', 'Error: ' + error.message, 'error');
  }
}

// ======================================================
// INIT
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
  loadDropdowns();

  // Set default date and time
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type="date"]').forEach(el => {
    if (!el.value) el.value = today;
  });
  const now = new Date().toTimeString().slice(0, 5);
  document.getElementById('dailyStartTime').value = now;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById('tab-' + this.dataset.tab).classList.add('active');
    });
  });

  // Form events
  document.getElementById('dailyForm').addEventListener('submit', submitDailyReport);
  document.getElementById('serialForm').addEventListener('submit', submitSerialEntry);
  document.getElementById('petrolForm').addEventListener('submit', submitPetrol);
  document.getElementById('pettyForm').addEventListener('submit', submitPettyCash);

  // Auto-calc
  document.getElementById('petrolLiters').addEventListener('input', calcPetrolTotal);
  document.getElementById('petrolCostPerLitre').addEventListener('input', calcPetrolTotal);
  document.getElementById('pettyAmountExVAT').addEventListener('input', calcPettyTotal);
  document.getElementById('pettyVAT').addEventListener('input', calcPettyTotal);
});
