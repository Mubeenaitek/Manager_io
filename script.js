// ======================================================
// CONFIGURATION - REPLACE WITH YOUR ACTUAL URL
// ======================================================
const API_BASE = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

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
// SEARCHABLE DROPDOWN HELPERS
// ======================================================

/**
 * Populate a searchable dropdown with options.
 * @param {string} searchInputId - ID of the search input field
 * @param {string} listId - ID of the dropdown list container
 * @param {Array} options - Array of objects with {value, label}
 * @param {string} hiddenSelectId - (optional) ID of hidden select to store value
 */
function populateSearchDropdown(searchInputId, listId, options, hiddenSelectId = null) {
  const input = document.getElementById(searchInputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  // Store options as data attribute
  input.dataset.options = JSON.stringify(options);

  // Populate list
  renderDropdownList(listId, options);

  // Show all options on focus if not typing
  input.addEventListener('focus', function() {
    const opts = JSON.parse(this.dataset.options || '[]');
    renderDropdownList(listId, opts);
    list.classList.add('show');
  });

  input.addEventListener('blur', function() {
    // Delay to allow click on list item
    setTimeout(() => { list.classList.remove('show'); }, 200);
  });

  input.addEventListener('input', function() {
    const search = this.value.toLowerCase().trim();
    const opts = JSON.parse(this.dataset.options || '[]');
    const filtered = opts.filter(opt => opt.label.toLowerCase().includes(search));
    renderDropdownList(listId, filtered);
    if (filtered.length > 0) {
      list.classList.add('show');
    } else {
      list.classList.remove('show');
    }
    // Clear hidden select value if any
    if (hiddenSelectId) {
      document.getElementById(hiddenSelectId).value = '';
    }
  });

  // Also handle click on list items
  list.addEventListener('click', function(e) {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const value = item.dataset.value;
    const label = item.textContent.trim();
    input.value = label;
    if (hiddenSelectId) {
      document.getElementById(hiddenSelectId).value = value;
    }
    // Trigger change event
    input.dispatchEvent(new Event('change'));
    list.classList.remove('show');
  });
}

function renderDropdownList(listId, options) {
  const list = document.getElementById(listId);
  if (!list) return;
  if (options.length === 0) {
    list.innerHTML = '<div class="dropdown-item" style="color:#999;">No results</div>';
    return;
  }
  list.innerHTML = options.map(opt =>
    `<div class="dropdown-item" data-value="${opt.value}">${opt.label}</div>`
  ).join('');
}

/**
 * Get the selected value from a searchable dropdown.
 */
function getSearchDropdownValue(searchInputId, hiddenSelectId = null) {
  const input = document.getElementById(searchInputId);
  if (!input) return '';
  // If we have a hidden select, use its value
  if (hiddenSelectId) {
    const select = document.getElementById(hiddenSelectId);
    if (select) return select.value;
  }
  // Otherwise try to find matching option
  const opts = JSON.parse(input.dataset.options || '[]');
  const found = opts.find(opt => opt.label === input.value.trim());
  return found ? found.value : input.value.trim();
}

// ======================================================
// LOAD DROPDOWNS
// ======================================================
async function loadDropdowns() {
  try {
    const data = await callAPI('getDropdownData');
    if (data.success) {
      dropdownData = data;
      populateAllDropdowns(data);
      showMessage('dailyMessage', '✅ Data refreshed', 'success');
    } else {
      showMessage('dailyMessage', 'Error loading data: ' + data.error, 'error');
    }
  } catch (e) {
    showMessage('dailyMessage', 'Network error: ' + e.message, 'error');
  }
}

function populateAllDropdowns(data) {
  // Helper to create options array for searchable dropdowns
  const toOptions = (items, labelKey, valueKey) =>
    items.map(item => ({ value: item[valueKey], label: item[labelKey] }));

  // --- Customers ---
  const customerOpts = toOptions(data.customers, 'name', 'code');
  populateSearchDropdown('dailyCustomerSearch', 'dailyCustomerList', customerOpts, 'dailyCustomer');
  populateSearchDropdown('serialCustomerSearch', 'serialCustomerList', customerOpts, 'serialCustomer');

  // --- Projects ---
  const projectOpts = toOptions(data.projects, 'name', 'name');
  populateSearchDropdown('dailyProjectSearch', 'dailyProjectList', projectOpts, 'dailyProject');
  populateSearchDropdown('serialProjectSearch', 'serialProjectList', projectOpts, 'serialProject');
  populateSearchDropdown('pettyProjectSearch', 'pettyProjectList', projectOpts, 'pettyProject');

  // --- Inventory (for serial item) ---
  const inventoryOpts = toOptions(data.inventory, 'name', 'code');
  populateSearchDropdown('serialItemSearch', 'serialItemList', inventoryOpts, 'serialItem');

  // --- Crew ---
  const crewOpts = toOptions(data.crew, 'name', 'name');
  populateSearchDropdown('serialCrewSearch', 'serialCrewList', crewOpts, 'serialCrew');
  populateSearchDropdown('petrolCrewSearch', 'petrolCrewList', crewOpts, 'petrolCrew');
  populateSearchDropdown('pettyPaidBySearch', 'pettyPaidByList', crewOpts, 'pettyPaidBy');

  // --- Suppliers ---
  const supplierOpts = toOptions(data.suppliers || [], 'name', 'code');
  populateSearchDropdown('pettySupplierSearch', 'pettySupplierList', supplierOpts, 'pettySupplier');

  // --- Crew Checkboxes (with search) ---
  populateCrewCheckboxes(data.crew);

  // --- Material rows (inventory) ---
  // The material rows are dynamic; we'll set up a function to populate them later.
  // We'll also need to re-populate material rows when new ones are added.
  populateMaterialRows(data.inventory);

  // Also store inventory for later use in addMaterialRow
  window._inventoryData = data.inventory;
}

function populateCrewCheckboxes(crew) {
  const container = document.getElementById('crewCheckboxes');
  if (!container) return;
  container.innerHTML = '';
  crew.forEach(c => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = c.name;
    cb.className = 'crew-checkbox';
    label.appendChild(cb);
    label.appendChild(document.createTextNode(c.name + ' (' + c.role + ')'));
    container.appendChild(label);
  });

  // Attach search filter for crew
  const searchInput = document.getElementById('crewSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const query = this.value.toLowerCase().trim();
      container.querySelectorAll('label').forEach(label => {
        const text = label.textContent.toLowerCase();
        label.classList.toggle('hidden', !text.includes(query));
      });
    });
  }
}

function populateMaterialRows(inventory) {
  const rows = document.querySelectorAll('.material-row');
  rows.forEach(row => {
    const searchInput = row.querySelector('.material-search');
    const listDiv = row.querySelector('.material-list');
    const hiddenSelect = row.querySelector('.material-item-select');
    if (searchInput && listDiv) {
      const opts = inventory.map(item => ({ value: item.code, label: item.name + (item.code ? ' (' + item.code + ')' : '') }));
      // Store options on the search input
      searchInput.dataset.options = JSON.stringify(opts);
      // Render list on focus
      searchInput.addEventListener('focus', function() {
        const optsParsed = JSON.parse(this.dataset.options || '[]');
        renderDropdownList(listDiv.id || '', optsParsed);
        listDiv.classList.add('show');
      });
      searchInput.addEventListener('blur', function() {
        setTimeout(() => { listDiv.classList.remove('show'); }, 200);
      });
      searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        const optsParsed = JSON.parse(this.dataset.options || '[]');
        const filtered = optsParsed.filter(opt => opt.label.toLowerCase().includes(query));
        renderDropdownList(listDiv.id || '', filtered);
        if (filtered.length > 0) {
          listDiv.classList.add('show');
        } else {
          listDiv.classList.remove('show');
        }
        if (hiddenSelect) hiddenSelect.value = '';
      });
      listDiv.addEventListener('click', function(e) {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        const value = item.dataset.value;
        const label = item.textContent.trim();
        searchInput.value = label;
        if (hiddenSelect) hiddenSelect.value = value;
        listDiv.classList.remove('show');
      });
    }
  });
}

// ======================================================
// MATERIALS - Add row with searchable inventory
// ======================================================
function addMaterialRow() {
  const container = document.getElementById('materialContainer');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'material-row';
  const inventory = window._inventoryData || [];
  const opts = inventory.map(item => ({ value: item.code, label: item.name + (item.code ? ' (' + item.code + ')' : '') }));
  const listId = 'matList_' + Date.now();
  div.innerHTML = `
    <div style="flex:3; position:relative;">
      <input type="text" class="material-search" placeholder="Search item..." style="width:100%;">
      <select class="material-item-select" style="display:none;"></select>
      <div class="material-list dropdown-list" id="${listId}"></div>
    </div>
    <input type="number" class="material-qty" placeholder="Qty" min="0" step="1" style="flex:1;">
    <button type="button" class="remove-btn" onclick="removeMaterial(this)">×</button>
  `;
  container.appendChild(div);

  // Now set up the search for this new row
  const searchInput = div.querySelector('.material-search');
  const listDiv = div.querySelector('.material-list');
  const hiddenSelect = div.querySelector('.material-item-select');
  if (searchInput && listDiv) {
    searchInput.dataset.options = JSON.stringify(opts);
    searchInput.addEventListener('focus', function() {
      const optsParsed = JSON.parse(this.dataset.options || '[]');
      renderDropdownList(listId, optsParsed);
      listDiv.classList.add('show');
    });
    searchInput.addEventListener('blur', function() {
      setTimeout(() => { listDiv.classList.remove('show'); }, 200);
    });
    searchInput.addEventListener('input', function() {
      const query = this.value.toLowerCase().trim();
      const optsParsed = JSON.parse(this.dataset.options || '[]');
      const filtered = optsParsed.filter(opt => opt.label.toLowerCase().includes(query));
      renderDropdownList(listId, filtered);
      if (filtered.length > 0) {
        listDiv.classList.add('show');
      } else {
        listDiv.classList.remove('show');
      }
      if (hiddenSelect) hiddenSelect.value = '';
    });
    listDiv.addEventListener('click', function(e) {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      const value = item.dataset.value;
      const label = item.textContent.trim();
      searchInput.value = label;
      if (hiddenSelect) hiddenSelect.value = value;
      listDiv.classList.remove('show');
    });
  }
}

function removeMaterial(btn) {
  const row = btn.parentElement;
  const container = document.getElementById('materialContainer');
  if (container && container.children.length > 1) row.remove();
}

function getMaterials() {
  const rows = document.querySelectorAll('.material-row');
  const materials = [];
  rows.forEach(row => {
    const searchInput = row.querySelector('.material-search');
    const qtyInput = row.querySelector('.material-qty');
    const item = searchInput ? searchInput.value.trim() : '';
    const qty = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
    if (item) materials.push({ item, qty });
  });
  return materials;
}

// ======================================================
// CREW CHECKBOX GETTER
// ======================================================
function getSelectedCrew() {
  const checkboxes = document.querySelectorAll('.crew-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// ======================================================
// PHOTO UPLOAD (same as before)
// ======================================================
async function handlePhotoUpload(fileInput, hiddenFieldId, previewContainerId) {
  // ... (keep existing implementation)
}

function fileToBase64(file) {
  // ... (keep existing implementation)
}

// ======================================================
// ADD MODAL (same as before)
// ======================================================
function openAddModal(type) {
  // ... (keep existing implementation)
}

function closeAddModal() {
  // ... (keep existing implementation)
}

function showModalMessage(text, type = 'info') {
  // ... (keep existing implementation)
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

  // Get values from searchable dropdowns
  const customer = getSearchDropdownValue('dailyCustomerSearch', 'dailyCustomer');
  const project = getSearchDropdownValue('dailyProjectSearch', 'dailyProject');
  const photos = document.getElementById('dailyPhotos').value;

  const data = {
    action: 'submitDailyReport',
    customer: customer,
    project: project,
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
      // Reset fields (keep customer/project)
      document.getElementById('dailyWorkType').value = '';
      document.getElementById('dailyDescription').value = '';
      document.getElementById('dailyIssues').value = '';
      document.getElementById('dailyEmail').value = '';
      document.getElementById('dailyPhotos').value = '';
      document.getElementById('dailyPhotoPreview').innerHTML = '';
      document.querySelectorAll('.crew-checkbox').forEach(cb => cb.checked = false);
      // Reset materials
      document.getElementById('materialContainer').innerHTML = '';
      addMaterialRow(); // Add one empty row
    } else {
      showMessage('dailyMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Daily Report';
    showMessage('dailyMessage', '❌ Error: ' + error.message, 'error');
  }
}

// Similar for serial, petrol, petty – use getSearchDropdownValue for relevant fields.
// I'll provide a condensed version; you can adapt.

// For serial:
async function submitSerialEntry(e) {
  e.preventDefault();
  clearMessage('serialMessage');
  const data = {
    action: 'submitSerialEntry',
    customer: getSearchDropdownValue('serialCustomerSearch', 'serialCustomer'),
    project: getSearchDropdownValue('serialProjectSearch', 'serialProject'),
    date: document.getElementById('serialDate').value,
    item: getSearchDropdownValue('serialItemSearch', 'serialItem'),
    serialNumber: document.getElementById('serialNumber').value,
    quantity: document.getElementById('serialQty').value || 1,
    crewOnSite: getSearchDropdownValue('serialCrewSearch', 'serialCrew'),
    photo: document.getElementById('serialPhoto').value,
    notes: document.getElementById('serialNotes').value
  };
  // ... validation and submit (same pattern)
}

// For petrol:
async function submitPetrol(e) {
  e.preventDefault();
  clearMessage('petrolMessage');
  const data = {
    action: 'submitPetrol',
    crewMember: getSearchDropdownValue('petrolCrewSearch', 'petrolCrew'),
    date: document.getElementById('petrolDate').value,
    odometer: document.getElementById('petrolOdometer').value,
    liters: document.getElementById('petrolLiters').value,
    costPerLitre: document.getElementById('petrolCostPerLitre').value,
    totalAmount: document.getElementById('petrolAmount').value,
    paymentMethod: document.getElementById('petrolPaymentMethod').value,
    receiptPhoto: document.getElementById('petrolReceipt').value,
    email: document.getElementById('petrolEmail').value
  };
  // ... validation and submit
}

// For petty cash:
async function submitPettyCash(e) {
  e.preventDefault();
  clearMessage('pettyMessage');
  const data = {
    action: 'submitPettyCash',
    date: document.getElementById('pettyDate').value,
    category: document.getElementById('pettyCategory').value,
    description: document.getElementById('pettyDescription').value,
    project: getSearchDropdownValue('pettyProjectSearch', 'pettyProject'),
    amountExcludingVAT: document.getElementById('pettyAmountExVAT').value,
    vatAmount: document.getElementById('pettyVAT').value,
    totalAmount: document.getElementById('pettyTotalAmount').value,
    paidBy: getSearchDropdownValue('pettyPaidBySearch', 'pettyPaidBy'),
    paymentMethod: document.getElementById('pettyPaymentMethod').value,
    supplier: getSearchDropdownValue('pettySupplierSearch', 'pettySupplier'),
    receiptPhoto: document.getElementById('pettyReceipt').value,
    notes: document.getElementById('pettyNotes').value,
    email: document.getElementById('pettyEmail').value
  };
  // ... validation and submit
}

// ======================================================
// EXPORT & LOOKUP
// ======================================================
async function generateBillableTime() {
  // ... keep as before
}

async function lookupSerial() {
  // ... keep as before
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
