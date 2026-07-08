// ======================================================
// CONFIGURATION - REPLACE WITH YOUR ACTUAL URL
// ======================================================
const API_BASE = 'https://script.google.com/macros/s/AKfycbwvHPVnXa0KVSZL_9K-rK4_DeydropgerYv_baThjmMABROaB_d9XDRGS7P0tbN2sr5/exec';

// ======================================================
// STATE
// ======================================================
let dropdownData = null;
let uploadedPhotoUrls = {};

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
      showMessage('dailyMessage', '✅ Data refreshed', 'success');
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

  // Inventory dropdown for material rows
  document.querySelectorAll('.material-item-select').forEach(sel => {
    if (sel) {
      sel.innerHTML = '<option value="">Select Item...</option>';
      data.inventory.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.code || item.name;
        opt.textContent = item.name + (item.code ? ' (' + item.code + ')' : '');
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
  // Use select for inventory items
  let optionsHtml = '<option value="">Select Item...</option>';
  if (dropdownData && dropdownData.inventory) {
    dropdownData.inventory.forEach(item => {
      optionsHtml += `<option value="${item.code || item.name}">${item.name} (${item.code || ''})</option>`;
    });
  }
  div.innerHTML = `
    <select class="material-item-select" style="flex:3;">
      ${optionsHtml}
    </select>
    <input type="number" class="material-qty" placeholder="Qty" min="0" step="1" style="flex:1;">
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
  const items = document.querySelectorAll('.material-item-select');
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
// PHOTO UPLOAD
// ======================================================
async function handlePhotoUpload(fileInput, hiddenFieldId, previewContainerId) {
  const files = fileInput.files;
  if (!files || files.length === 0) return;

  const previewContainer = document.getElementById(previewContainerId);
  const hiddenField = document.getElementById(hiddenFieldId);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'photo-preview';
      previewContainer.appendChild(img);
    };
    reader.readAsDataURL(file);

    // Upload to Drive
    try {
      const base64 = await fileToBase64(file);
      const result = await callAPI('uploadPhoto', {
        method: 'POST',
        body: { base64: base64.split(',')[1], fileName: file.name }
      });
      if (result.success) {
        // Append URL to hidden field
        const currentUrls = hiddenField.value ? hiddenField.value.split(',') : [];
        currentUrls.push(result.fileUrl);
        hiddenField.value = currentUrls.join(',');
      } else {
        showMessage('dailyMessage', 'Photo upload failed: ' + result.error, 'error');
      }
    } catch (e) {
      console.error('Upload error:', e);
    }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ======================================================
// ADD MODAL
// ======================================================
function openAddModal(type) {
  const modal = document.getElementById('addModal');
  const title = document.getElementById('modalTitle');
  const fields = document.getElementById('modalFields');
  const form = document.getElementById('addForm');

  // Clear previous fields
  fields.innerHTML = '';
  document.getElementById('addModalMessage').style.display = 'none';

  let html = '';
  switch (type) {
    case 'customer':
      title.textContent = 'Add New Customer';
      html = `
        <div class="form-group">
          <label>Customer Name <span class="required">*</span></label>
          <input type="text" id="addCustomerName" required>
        </div>
        <div class="form-group">
          <label>Code (optional)</label>
          <input type="text" id="addCustomerCode" placeholder="Auto if empty">
        </div>
      `;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('addCustomerName').value.trim();
        const code = document.getElementById('addCustomerCode').value.trim();
        if (!name) { showModalMessage('Please enter a name'); return; }
        const result = await callAPI('addCustomer', { method: 'POST', body: { name, code } });
        if (result.success) {
          showModalMessage('✅ Customer added!', 'success');
          setTimeout(() => { closeAddModal(); loadDropdowns(); }, 1000);
        } else {
          showModalMessage('❌ ' + result.error, 'error');
        }
      };
      break;

    case 'project':
      title.textContent = 'Add New Project';
      html = `
        <div class="form-group">
          <label>Project Name <span class="required">*</span></label>
          <input type="text" id="addProjectName" required>
        </div>
      `;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('addProjectName').value.trim();
        if (!name) { showModalMessage('Please enter a name'); return; }
        const result = await callAPI('addProject', { method: 'POST', body: { name } });
        if (result.success) {
          showModalMessage('✅ Project added!', 'success');
          setTimeout(() => { closeAddModal(); loadDropdowns(); }, 1000);
        } else {
          showModalMessage('❌ ' + result.error, 'error');
        }
      };
      break;

    case 'inventory':
      title.textContent = 'Add New Inventory Item';
      html = `
        <div class="form-group">
          <label>Item Code <span class="required">*</span></label>
          <input type="text" id="addItemCode" required>
        </div>
        <div class="form-group">
          <label>Item Name <span class="required">*</span></label>
          <input type="text" id="addItemName" required>
        </div>
        <div class="form-group">
          <label>Unit (e.g., Nos)</label>
          <input type="text" id="addItemUnit" value="Nos">
        </div>
      `;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const code = document.getElementById('addItemCode').value.trim();
        const name = document.getElementById('addItemName').value.trim();
        const unit = document.getElementById('addItemUnit').value.trim() || 'Nos';
        if (!code || !name) { showModalMessage('Please fill all required fields'); return; }
        const result = await callAPI('addInventoryItem', { method: 'POST', body: { code, name, unit } });
        if (result.success) {
          showModalMessage('✅ Item added!', 'success');
          setTimeout(() => { closeAddModal(); loadDropdowns(); }, 1000);
        } else {
          showModalMessage('❌ ' + result.error, 'error');
        }
      };
      break;

    case 'crew':
      title.textContent = 'Add New Crew Member';
      html = `
        <div class="form-group">
          <label>Name <span class="required">*</span></label>
          <input type="text" id="addCrewName" required>
        </div>
        <div class="form-group">
          <label>Role</label>
          <input type="text" id="addCrewRole" placeholder="e.g., Technician">
        </div>
        <div class="form-group">
          <label>Hourly Rate (BHD)</label>
          <input type="number" id="addCrewRate" step="0.001" value="0">
        </div>
      `;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('addCrewName').value.trim();
        const role = document.getElementById('addCrewRole').value.trim() || 'Technician';
        const hourlyRate = parseFloat(document.getElementById('addCrewRate').value) || 0;
        if (!name) { showModalMessage('Please enter a name'); return; }
        const result = await callAPI('addCrew', { method: 'POST', body: { name, role, hourlyRate } });
        if (result.success) {
          showModalMessage('✅ Crew member added!', 'success');
          setTimeout(() => { closeAddModal(); loadDropdowns(); }, 1000);
        } else {
          showModalMessage('❌ ' + result.error, 'error');
        }
      };
      break;

    case 'supplier':
      title.textContent = 'Add New Supplier';
      html = `
        <div class="form-group">
          <label>Supplier Name <span class="required">*</span></label>
          <input type="text" id="addSupplierName" required>
        </div>
        <div class="form-group">
          <label>Code (optional)</label>
          <input type="text" id="addSupplierCode" placeholder="Auto if empty">
        </div>
      `;
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('addSupplierName').value.trim();
        const code = document.getElementById('addSupplierCode').value.trim();
        if (!name) { showModalMessage('Please enter a name'); return; }
        const result = await callAPI('addSupplier', { method: 'POST', body: { name, code } });
        if (result.success) {
          showModalMessage('✅ Supplier added!', 'success');
          setTimeout(() => { closeAddModal(); loadDropdowns(); }, 1000);
        } else {
          showModalMessage('❌ ' + result.error, 'error');
        }
      };
      break;

    default:
      return;
  }

  fields.innerHTML = html;
  modal.classList.add('show');
  modal.style.display = 'flex';
}

function closeAddModal() {
  const modal = document.getElementById('addModal');
  modal.classList.remove('show');
  modal.style.display = 'none';
}

function showModalMessage(text, type = 'info') {
  const el = document.getElementById('addModalMessage');
  el.textContent = text;
  el.className = 'message ' + type;
  el.style.display = 'block';
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
// FORM SUBMISSIONS (with photo upload)
// ======================================================
async function submitDailyReport(e) {
  e.preventDefault();
  clearMessage('dailyMessage');
  const crew = getSelectedCrew();
  if (crew.length === 0) {
    showMessage('dailyMessage', 'Please select at least one crew member', 'error');
    return;
  }

  // Get photo URLs from hidden field
  const photos = document.getElementById('dailyPhotos').value;

  const data = {
    action: 'submitDailyReport',
    customer: document.getElementById('dailyCustomer').value,
    project: document.getElementById('dailyProject').value,
    workType: document.getElementById('dailyWorkType').value,
    description: document.getElementById('dailyDescription').value,
    materials: getMaterials(),
    crew: crew,
    date: document.getElementById('dailyDate').value,
    startTime: document.getElementById('dailyStartTime').value,
    endTime: document.getElementById('dailyEndTime').value,
    photos: photos,
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
      // Reset form fields (except customer/project)
      document.getElementById('dailyWorkType').value = '';
      document.getElementById('dailyDescription').value = '';
      document.getElementById('dailyIssues').value = '';
      document.getElementById('dailyEmail').value = '';
      document.getElementById('dailyPhotos').value = '';
      document.getElementById('dailyPhotoPreview').innerHTML = '';
      document.querySelectorAll('.crew-checkbox').forEach(cb => cb.checked = false);
      // Reset materials
      document.getElementById('materialContainer').innerHTML = `
        <div class="material-row">
          <select class="material-item-select" style="flex:3;">
            <option value="">Select Item...</option>
          </select>
          <input type="number" class="material-qty" placeholder="Qty" min="0" step="1" style="flex:1;">
          <button type="button" class="remove-btn" onclick="removeMaterial(this)">×</button>
        </div>
      `;
      // Re-populate inventory options in the new row
      if (dropdownData && dropdownData.inventory) {
        const sel = document.querySelector('.material-item-select');
        if (sel) {
          dropdownData.inventory.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.code || item.name;
            opt.textContent = item.name + (item.code ? ' (' + item.code + ')' : '');
            sel.appendChild(opt);
          });
        }
      }
    } else {
      showMessage('dailyMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Daily Report';
    showMessage('dailyMessage', '❌ Error: ' + error.message, 'error');
  }
}

// Similar for other forms – add photo handling. For brevity, we'll keep the existing submit functions
// and just ensure they include the photo URL fields.

// ======================================================
// SERIAL, PETROL, PETTY CASH submit functions (similar to before, but with photo)
// ======================================================
// ... (keep them as before, just ensure they use the hidden photo field)

// ======================================================
// EXPORT & LOOKUP
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
  document.getElementById('dailyForm').addEventListener('submit', submitDailyReport);
  document.getElementById('serialForm').addEventListener('submit', submitSerialEntry);
  document.getElementById('petrolForm').addEventListener('submit', submitPetrol);
  document.getElementById('pettyForm').addEventListener('submit', submitPettyCash);

  // Photo input events
  document.getElementById('dailyPhotoInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'dailyPhotos', 'dailyPhotoPreview');
  });
  document.getElementById('serialPhotoInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'serialPhoto', 'serialPhotoPreview');
  });
  document.getElementById('petrolReceiptInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'petrolReceipt', 'petrolReceiptPreview');
  });
  document.getElementById('pettyReceiptInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'pettyReceipt', 'pettyReceiptPreview');
  });

  // Auto-calc
  document.getElementById('petrolLiters').addEventListener('input', calcPetrolTotal);
  document.getElementById('petrolCostPerLitre').addEventListener('input', calcPetrolTotal);
  document.getElementById('pettyAmountExVAT').addEventListener('input', calcPettyTotal);
  document.getElementById('pettyVAT').addEventListener('input', calcPettyTotal);
});
