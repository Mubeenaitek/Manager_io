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
  const method = data.method || 'GET';
  let url = API_BASE + '?action=' + encodeURIComponent(action);
  if (data.serial) url += '&serial=' + encodeURIComponent(data.serial);

  const options = { method };
  if (method === 'POST') {
    // IMPORTANT: Do NOT set Content-Type: application/json here.
    // Google Apps Script web apps don't implement doOptions(), so a
    // "real" JSON content type triggers a CORS preflight that always
    // fails. text/plain is a CORS-safelisted content type (no preflight),
    // and Code.gs already does JSON.parse(e.postData.contents) regardless
    // of the declared content type, so this is safe.
    options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
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
    // Search matches against the visible label (name + code) AND the
    // underlying value (code), so typing a customer/item code works too.
    const filtered = opts.filter(opt =>
      opt.label.toLowerCase().includes(search) ||
      String(opt.value || '').toLowerCase().includes(search)
    );
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
    if (select && select.value) return select.value;
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
  // Helper to create a searchable label that includes the code, so users
  // can find a record by typing either its name or its code.
  const toOptions = (items, valueKey) =>
    items.map(item => ({
      value: item[valueKey],
      label: item.name + (item.code ? ' (' + item.code + ')' : '')
    }));

  // --- Customers ---
  const customerOpts = toOptions(data.customers, 'code');
  populateSearchDropdown('dailyCustomerSearch', 'dailyCustomerList', customerOpts, 'dailyCustomer');
  populateSearchDropdown('serialCustomerSearch', 'serialCustomerList', customerOpts, 'serialCustomer');

  // --- Projects ---
  const projectOpts = data.projects.map(p => ({ value: p.name, label: p.name }));
  populateSearchDropdown('dailyProjectSearch', 'dailyProjectList', projectOpts, 'dailyProject');
  populateSearchDropdown('serialProjectSearch', 'serialProjectList', projectOpts, 'serialProject');
  populateSearchDropdown('pettyProjectSearch', 'pettyProjectList', projectOpts, 'pettyProject');

  // --- Inventory (for serial item) ---
  const inventoryOpts = data.inventory.map(i => ({
    value: i.code || i.name,
    label: i.name + (i.code ? ' (' + i.code + ')' : '')
  }));
  populateSearchDropdown('serialItemSearch', 'serialItemList', inventoryOpts, 'serialItem');

  // --- Crew ---
  const crewOpts = data.crew.map(c => ({ value: c.name, label: c.name + (c.role ? ' - ' + c.role : '') }));
  populateSearchDropdown('serialCrewSearch', 'serialCrewList', crewOpts, 'serialCrew');
  populateSearchDropdown('petrolCrewSearch', 'petrolCrewList', crewOpts, 'petrolCrew');
  populateSearchDropdown('pettyPaidBySearch', 'pettyPaidByList', crewOpts, 'pettyPaidBy');

  // --- Suppliers ---
  const supplierOpts = toOptions(data.suppliers || [], 'code');
  populateSearchDropdown('pettySupplierSearch', 'pettySupplierList', supplierOpts, 'pettySupplier');

  // --- Crew Checkboxes (with search) ---
  populateCrewCheckboxes(data.crew);

  // --- Material rows (inventory) ---
  populateMaterialRows(data.inventory);

  // Also store inventory/customers for later use in dynamically added rows
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
  rows.forEach((row, idx) => {
    const searchInput = row.querySelector('.material-search');
    const listDiv = row.querySelector('.material-list');
    const hiddenSelect = row.querySelector('.material-item-select');
    if (searchInput && listDiv) {
      // The static first row in index.html previously had no id on its
      // dropdown-list div, so renderDropdownList('', ...) was a no-op and
      // search results never rendered. Guarantee an id here defensively.
      if (!listDiv.id) listDiv.id = 'matList_static_' + idx;
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
    <button type="button" class="btn-add-small" onclick="openAddModal('inventory', this)">+</button>
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
// PHOTO UPLOAD
// ======================================================
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(fileInput, hiddenFieldId, previewContainerId) {
  const files = Array.from(fileInput.files || []);
  if (files.length === 0) return;

  const hiddenField = document.getElementById(hiddenFieldId);
  const preview = document.getElementById(previewContainerId);
  if (!hiddenField || !preview) return;

  // Single-file inputs (serial/petrol/petty receipts) replace any previous
  // selection instead of accumulating.
  let urls = hiddenField.value ? hiddenField.value.split(',').filter(Boolean) : [];
  if (!fileInput.multiple) {
    urls = [];
    preview.innerHTML = '';
  }

  for (const file of files) {
    const img = document.createElement('img');
    img.className = 'photo-preview';
    img.src = URL.createObjectURL(file);
    img.style.opacity = '0.5';
    preview.appendChild(img);

    try {
      const base64 = await fileToBase64(file);
      const result = await callAPI('uploadPhoto', { method: 'POST', body: { base64, fileName: file.name } });
      if (result.success) {
        urls.push(result.fileUrl);
        hiddenField.value = urls.join(',');
        img.style.opacity = '1';
      } else {
        img.style.opacity = '1';
        img.style.border = '2px solid #d93025';
        img.title = 'Upload failed: ' + result.error;
      }
    } catch (err) {
      img.style.opacity = '1';
      img.style.border = '2px solid #d93025';
      img.title = 'Upload failed: ' + err.message;
    }
  }

  fileInput.value = '';
}

// ======================================================
// ADD MODAL
// ======================================================
const ADD_MODAL_CONFIG = {
  customer: {
    title: 'Add Customer',
    action: 'addCustomer',
    fields: [
      { id: 'name', label: 'Customer Name', type: 'text', required: true },
      { id: 'code', label: 'Code (optional)', type: 'text', required: false }
    ]
  },
  project: {
    title: 'Add Project',
    action: 'addProject',
    fields: [
      { id: 'name', label: 'Project Name', type: 'text', required: true }
    ]
  },
  inventory: {
    title: 'Add Inventory Item',
    action: 'addInventoryItem',
    fields: [
      { id: 'code', label: 'Item Code', type: 'text', required: true },
      { id: 'name', label: 'Item Name', type: 'text', required: true },
      { id: 'unit', label: 'Unit (e.g. Nos)', type: 'text', required: false }
    ]
  },
  crew: {
    title: 'Add Crew Member',
    action: 'addCrew',
    fields: [
      { id: 'name', label: 'Name', type: 'text', required: true },
      { id: 'role', label: 'Role', type: 'text', required: false },
      { id: 'hourlyRate', label: 'Hourly Rate (BHD)', type: 'number', required: false }
    ]
  },
  supplier: {
    title: 'Add Supplier',
    action: 'addSupplier',
    fields: [
      { id: 'name', label: 'Supplier Name', type: 'text', required: true },
      { id: 'code', label: 'Code (optional)', type: 'text', required: false }
    ]
  }
};
let currentAddType = null;
let currentAddTargets = null;

/**
 * Figure out which field the "+" button that opened the modal belongs to,
 * so that once the new record is created we can drop it straight into that
 * field instead of making the user search for it again.
 *
 * - Fixed fields carry data-target-search / data-target-hidden attributes.
 * - The Daily tab's crew "+ Add Crew Member" button carries
 *   data-target-type="checkbox" and points at the checkbox container.
 * - Material row "+" buttons (for adding inventory items) have neither -
 *   they're resolved by walking up to the enclosing .material-row.
 */
function resolveAddTargets(sourceEl) {
  if (!sourceEl) return null;

  if (sourceEl.dataset && sourceEl.dataset.targetType === 'checkbox') {
    return { kind: 'checkbox', containerId: sourceEl.dataset.targetSearch };
  }

  if (sourceEl.dataset && sourceEl.dataset.targetSearch) {
    return {
      kind: 'search',
      searchInput: document.getElementById(sourceEl.dataset.targetSearch),
      hiddenSelect: sourceEl.dataset.targetHidden ? document.getElementById(sourceEl.dataset.targetHidden) : null
    };
  }

  const row = sourceEl.closest ? sourceEl.closest('.material-row') : null;
  if (row) {
    return {
      kind: 'search',
      searchInput: row.querySelector('.material-search'),
      hiddenSelect: row.querySelector('.material-item-select')
    };
  }

  return null;
}

/**
 * After a successful add + dropdown refresh, locate the freshly created
 * record in the reloaded data and select it into whichever field triggered
 * the modal (or check its checkbox, for crew added from the Daily tab).
 */
function selectNewlyAddedRecord(type, submittedData) {
  if (!currentAddTargets || !dropdownData) return;

  let list = [];
  if (type === 'customer') list = dropdownData.customers || [];
  else if (type === 'project') list = dropdownData.projects || [];
  else if (type === 'inventory') list = dropdownData.inventory || [];
  else if (type === 'crew') list = dropdownData.crew || [];
  else if (type === 'supplier') list = dropdownData.suppliers || [];

  const record = list.find(r => r.name === submittedData.name);
  if (!record) return;

  if (currentAddTargets.kind === 'checkbox') {
    const container = document.getElementById(currentAddTargets.containerId);
    if (!container) return;
    const cb = Array.from(container.querySelectorAll('.crew-checkbox')).find(c => c.value === record.name);
    if (cb) cb.checked = true;
    return;
  }

  const { searchInput, hiddenSelect } = currentAddTargets;
  if (!searchInput) return;

  let value, label;
  if (type === 'project') {
    value = record.name;
    label = record.name;
  } else if (type === 'crew') {
    value = record.name;
    label = record.name + (record.role ? ' - ' + record.role : '');
  } else {
    // customer / supplier / inventory all carry a code alongside the name
    value = record.code || record.name;
    label = record.name + (record.code ? ' (' + record.code + ')' : '');
  }

  searchInput.value = label;
  if (hiddenSelect) hiddenSelect.value = value;
  searchInput.dispatchEvent(new Event('change'));
}

function openAddModal(type, sourceEl) {
  const cfg = ADD_MODAL_CONFIG[type];
  if (!cfg) return;
  currentAddType = type;
  currentAddTargets = resolveAddTargets(sourceEl);

  document.getElementById('modalTitle').textContent = cfg.title;
  const container = document.getElementById('modalFields');
  container.innerHTML = cfg.fields.map(f => `
    <div class="form-group">
      <label>${f.label}${f.required ? ' <span class="required">*</span>' : ''}</label>
      <input type="${f.type}" id="modal_${f.id}" ${f.required ? 'required' : ''}>
    </div>
  `).join('');

  const msg = document.getElementById('addModalMessage');
  msg.style.display = 'none';
  msg.textContent = '';

  document.getElementById('addModal').style.display = 'flex';
  const firstInput = container.querySelector('input');
  if (firstInput) firstInput.focus();
}

function closeAddModal() {
  document.getElementById('addModal').style.display = 'none';
  currentAddType = null;
  currentAddTargets = null;
}

function showModalMessage(text, type = 'info') {
  const el = document.getElementById('addModalMessage');
  if (!el) return;
  el.textContent = text;
  el.className = 'message ' + type;
  el.style.display = 'block';
}

async function handleAddFormSubmit(e) {
  e.preventDefault();
  if (!currentAddType) return;
  const cfg = ADD_MODAL_CONFIG[currentAddType];

  const data = { action: cfg.action };
  for (const f of cfg.fields) {
    const el = document.getElementById('modal_' + f.id);
    const val = el ? el.value.trim() : '';
    if (f.required && !val) {
      showModalMessage('Please fill: ' + f.label, 'error');
      return;
    }
    data[f.id] = val;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const result = await callAPI(cfg.action, { method: 'POST', body: data });
    if (result.success) {
      showModalMessage('✅ Added successfully', 'success');
      await loadDropdowns();
      selectNewlyAddedRecord(currentAddType, data);
      setTimeout(closeAddModal, 800);
    } else {
      showModalMessage('❌ ' + result.error, 'error');
    }
  } catch (err) {
    showModalMessage('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
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

async function submitSerialEntry(e) {
  e.preventDefault();
  clearMessage('serialMessage');
  const data = {
    action: 'submitSerialEntry',
    customer: getSearchDropdownValue('serialCustomerSearch', 'serialCustomer'),
    project: getSearchDropdownValue('serialProjectSearch', 'serialProject'),
    date: document.getElementById('serialDate').value,
    item: getSearchDropdownValue('serialItemSearch', 'serialItem'),
    serialNumber: document.getElementById('serialNumber').value.trim(),
    quantity: document.getElementById('serialQty').value || 1,
    crewOnSite: getSearchDropdownValue('serialCrewSearch', 'serialCrew'),
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
      document.getElementById('serialNumber').value = '';
      document.getElementById('serialQty').value = 1;
      document.getElementById('serialNotes').value = '';
      document.getElementById('serialPhoto').value = '';
      document.getElementById('serialPhotoPreview').innerHTML = '';
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
      document.getElementById('petrolReceiptPreview').innerHTML = '';
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
      document.getElementById('pettyDescription').value = '';
      document.getElementById('pettyAmountExVAT').value = '';
      document.getElementById('pettyVAT').value = '';
      document.getElementById('pettyTotalAmount').value = '';
      document.getElementById('pettyNotes').value = '';
      document.getElementById('pettyReceipt').value = '';
      document.getElementById('pettyReceiptPreview').innerHTML = '';
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
// EXPORT & LOOKUP
// ======================================================
async function generateBillableTime() {
  clearMessage('exportMessage');
  document.getElementById('exportResult').style.display = 'none';
  try {
    const result = await callAPI('generateBillableTimeCSV');
    if (result.success) {
      showMessage('exportMessage', '✅ ' + result.message, 'success');
      document.getElementById('exportCount').textContent = result.recordCount;
      const link = document.getElementById('exportFileLink');
      link.href = result.fileUrl;
      document.getElementById('exportResult').style.display = 'block';
    } else {
      showMessage('exportMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    showMessage('exportMessage', '❌ Error: ' + error.message, 'error');
  }
}

async function lookupSerial() {
  const serial = document.getElementById('lookupSerial').value.trim();
  const resultEl = document.getElementById('lookupResult');
  if (!serial) {
    resultEl.textContent = 'Enter a serial number';
    resultEl.className = 'message error';
    resultEl.style.display = 'block';
    return;
  }
  try {
    const result = await callAPI('getSerialTracking', { serial });
    if (result.success) {
      if (result.records.length === 0) {
        resultEl.textContent = 'No records found for ' + serial;
        resultEl.className = 'message info';
      } else {
        resultEl.innerHTML = result.records.map(r => `
          <div style="border-bottom:1px solid #e0e0e0; padding:8px 0;">
            <strong>${r['Column 1']}</strong> — ${r['Column 2']}<br>
            Customer: ${r['Column 3']} | Project: ${r['Column 4']}<br>
            Date: ${r['Column 5']} | Crew: ${r['Column 6']}<br>
            Notes: ${r['Column 7'] || '—'}
          </div>
        `).join('');
        resultEl.className = 'message success';
      }
      resultEl.style.display = 'block';
    } else {
      resultEl.textContent = '❌ ' + result.error;
      resultEl.className = 'message error';
      resultEl.style.display = 'block';
    }
  } catch (error) {
    resultEl.textContent = '❌ ' + error.message;
    resultEl.className = 'message error';
    resultEl.style.display = 'block';
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
  document.getElementById('addForm').addEventListener('submit', handleAddFormSubmit);

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
