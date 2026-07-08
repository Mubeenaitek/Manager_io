// ======================================================
// CONFIGURATION - REPLACE WITH YOUR ACTUAL URL
// ======================================================
const API_BASE = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

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
  if (!container) return;
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
  const container = document.getElementById('materialContainer');
  if (container && container.children.length > 1) row.remove();
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
// FORM SUBMISSIONS (keep as before – these haven't changed)
// ======================================================
// ... (copy the same submit functions from earlier)

// ======================================================
// EXPORT & LOOKUP (keep as before)
// ======================================================
// ... (copy the same generateBillableTime and lookupSerial)

// ======================================================
// INIT
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
  loadDropdowns();

  // Set default date and time only if elements exist
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type="date"]').forEach(el => {
    if (!el.value) el.value = today;
  });

  const startTimeEl = document.getElementById('dailyStartTime');
  if (startTimeEl) {
    const now = new Date().toTimeString().slice(0, 5);
    startTimeEl.value = now;
  }

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
  const dailyForm = document.getElementById('dailyForm');
  if (dailyForm) dailyForm.addEventListener('submit', submitDailyReport);

  const serialForm = document.getElementById('serialForm');
  if (serialForm) serialForm.addEventListener('submit', submitSerialEntry);

  const petrolForm = document.getElementById('petrolForm');
  if (petrolForm) petrolForm.addEventListener('submit', submitPetrol);

  const pettyForm = document.getElementById('pettyForm');
  if (pettyForm) pettyForm.addEventListener('submit', submitPettyCash);

  // Auto-calc
  const petrolLiters = document.getElementById('petrolLiters');
  if (petrolLiters) petrolLiters.addEventListener('input', calcPetrolTotal);
  const petrolCost = document.getElementById('petrolCostPerLitre');
  if (petrolCost) petrolCost.addEventListener('input', calcPetrolTotal);
  const pettyEx = document.getElementById('pettyAmountExVAT');
  if (pettyEx) pettyEx.addEventListener('input', calcPettyTotal);
  const pettyVat = document.getElementById('pettyVAT');
  if (pettyVat) pettyVat.addEventListener('input', calcPettyTotal);
});
