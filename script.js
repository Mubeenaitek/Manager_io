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
// NOTE (found during Serial-tab testing, not yet fixed): Google Apps
// Script's web app exec URL occasionally causes a POST request to be
// duplicated at the network/redirect layer - one copy lands correctly in
// doPost() and writes the row, another lands in doGet() (which has no
// matching case) and returns "Unknown action" back to the browser. The
// dangerous part: the ORIGINAL write can still have succeeded even though
// the user sees an error, so auto-retrying here is NOT safe - it can create
// duplicate rows (reproduced this exact duplicate during testing). The
// correct fix is a server-side idempotency key (Code.gs checks for an
// already-used client-generated request ID before inserting), not a
// client-side retry. Left as a known issue pending that fix rather than
// papering over it with a retry that could make duplicates worse.
async function callAPI(action, data = {}) {
  const method = data.method || 'GET';
  let url = API_BASE + '?action=' + encodeURIComponent(action);
  // Any extra keys besides method/body are treated as GET query params
  // (e.g. {serial: 'X'} or {project: 'Y'}) - generic so new GET-style
  // actions (like getProjectTasks) don't need special-casing here.
  Object.keys(data).forEach(key => {
    if (key === 'method' || key === 'body') return;
    if (data[key] === undefined || data[key] === null || data[key] === '') return;
    url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
  });

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

/**
 * Clear a searchable dropdown's text and its paired hidden select value.
 */
function resetSearchDropdown(searchInputId, hiddenSelectId = null) {
  const input = document.getElementById(searchInputId);
  if (input) input.value = '';
  if (hiddenSelectId) {
    const select = document.getElementById(hiddenSelectId);
    if (select) select.value = '';
  }
}

/**
 * Update a searchable dropdown's option pool without re-binding its
 * focus/blur/input/click listeners (populateSearchDropdown does that, and
 * calling it repeatedly - e.g. on every customer selection - would stack up
 * duplicate listeners over a session). The existing listeners already read
 * options fresh from input.dataset.options on every interaction, so just
 * refreshing that attribute (and the currently visible list) is enough.
 */
function setDropdownOptions(searchInputId, listId, options) {
  const input = document.getElementById(searchInputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  input.dataset.options = JSON.stringify(options);
  renderDropdownList(listId, options);
}

// ======================================================
// CUSTOMER -> PROJECT FILTERING
// ======================================================
/**
 * Project names in the sheet are prefixed with the owning customer's Code
 * (e.g. "AMBF Hafeera Factory...", "ABBK- Video Monitoring...", "GTMK CCTV
 * POWER ISSUE"), so matching the selected customer's code against that
 * prefix filters the Project dropdown down to just their projects - no
 * backend or sheet changes needed. The next character after the code must
 * be blank, a space, or a dash (not another letter/digit), so a code like
 * "AMBF" doesn't also match a different customer's "AMBF_F..." projects.
 */
function projectBelongsToCustomerCode(label, code) {
  if (!code) return true;
  const upperLabel = label.trim().toUpperCase();
  const upperCode = code.trim().toUpperCase();
  if (!upperLabel.startsWith(upperCode)) return false;
  const nextChar = upperLabel.charAt(upperCode.length);
  return nextChar === '' || nextChar === ' ' || nextChar === '-';
}

/**
 * Recomputes the filtered project list for a customer code and applies it,
 * WITHOUT touching whatever project value is currently selected. Used to
 * silently re-apply an already-active filter after a background dropdown
 * refresh (e.g. triggered by an unrelated "+ Add" modal elsewhere on the
 * form) so it doesn't wipe out a project the user already picked.
 */
function applyCustomerProjectFilter(code, searchInputId, listId) {
  const all = window._allProjectOptions || [];
  let filtered = code ? all.filter(opt => projectBelongsToCustomerCode(opt.label, code)) : all;
  // Never leave the user with zero options - if nothing matches (a project
  // that doesn't follow the naming convention, or a customer with no code),
  // fall back to showing every project instead of blocking them.
  if (filtered.length === 0) filtered = all;
  setDropdownOptions(searchInputId, listId, filtered);
}

/**
 * Called when the customer selection actually changes. The previously
 * selected project may not belong to the new customer, so it's cleared
 * before the filtered list is applied.
 */
function filterProjectDropdownByCustomerCode(code, searchInputId, listId, hiddenSelectId) {
  resetSearchDropdown(searchInputId, hiddenSelectId);
  applyCustomerProjectFilter(code, searchInputId, listId);
}

// ======================================================
// LOAD DROPDOWNS
// ======================================================
// getDropdownData is by far the heaviest call the app makes (it reads
// Customers, Projects - 1900+ rows, Crew, Suppliers, Cars and Inventory in
// one go), and Google's Apps Script web app hosting is intermittently
// flaky at delivering a response that large: the function itself always
// completes successfully server-side (confirmed in the Apps Script
// Executions log - no errors, 1-6s each), but every so often the client
// gets back an HTML "couldn't open file" page from Drive instead of JSON,
// which fails response.json() parsing. This is a delivery hiccup, not a
// data or logic bug, and simply retrying succeeds. So: retry a few times
// with a short backoff before surfacing an error to the user.
async function loadDropdowns(attempt = 1) {
  const MAX_ATTEMPTS = 4;
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
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      return loadDropdowns(attempt + 1);
    }
    showMessage('dailyMessage', 'Network error loading dropdowns after ' + MAX_ATTEMPTS + ' attempts: ' + e.message + ' — tap the refresh button to try again.', 'error');
  }
}

function populateAllDropdowns(data) {
  // Helper to create a searchable label that includes the code, so users
  // can find a record by typing either its name or its code.
  // Falls back to the record's name when it has no code (many customer/
  // supplier rows in the sheet don't have one) - otherwise the submitted
  // value would be an empty string and silently fail required-field
  // validation, blocking submission with no visible reason why. The
  // backend's UUID lookups already try code-then-name, so sending the
  // name here is safe.
  const toOptions = (items, valueKey) =>
    items.map(item => ({
      value: item[valueKey] || item.name,
      label: item.name + (item.code ? ' (' + item.code + ')' : '')
    }));

  // --- Customers ---
  const customerOpts = toOptions(data.customers, 'code');
  populateSearchDropdown('dailyCustomerSearch', 'dailyCustomerList', customerOpts, 'dailyCustomer');
  populateSearchDropdown('serialCustomerSearch', 'serialCustomerList', customerOpts, 'serialCustomer');
  populateSearchDropdown('tasksCustomerSearch', 'tasksCustomerList', customerOpts, 'tasksCustomer');
  // Ask Manager.io chat filter - reuses the same options, no "+" add button.
  populateSearchDropdown('chatCustomerSearch', 'chatCustomerList', customerOpts, 'chatCustomer');

  // --- Projects ---
  const projectOpts = data.projects.map(p => ({ value: p.name, label: p.name }));
  window._allProjectOptions = projectOpts;
  populateSearchDropdown('dailyProjectSearch', 'dailyProjectList', projectOpts, 'dailyProject');
  populateSearchDropdown('serialProjectSearch', 'serialProjectList', projectOpts, 'serialProject');
  populateSearchDropdown('serialGRProjectSearch', 'serialGRProjectList', projectOpts, 'serialGRProject');
  populateSearchDropdown('tasksProjectSearch', 'tasksProjectList', projectOpts, 'tasksProject');
  populateSearchDropdown('pettyProjectSearch', 'pettyProjectList', projectOpts, 'pettyProject');
  populateSearchDropdown('chatProjectSearch', 'chatProjectList', projectOpts, 'chatProject');

  // The refresh above just reset the Project dropdowns back to every
  // project. If a customer is still selected (e.g. this refresh was
  // triggered by an unrelated "+ Add" modal mid-form), silently re-apply
  // their active Customer -> Project filter without touching any project
  // they'd already picked.
  const dailyCustomerVal = document.getElementById('dailyCustomerSearch') ? getSearchDropdownValue('dailyCustomerSearch', 'dailyCustomer') : '';
  if (dailyCustomerVal) applyCustomerProjectFilter(dailyCustomerVal, 'dailyProjectSearch', 'dailyProjectList');
  const serialCustomerVal = document.getElementById('serialCustomerSearch') ? getSearchDropdownValue('serialCustomerSearch', 'serialCustomer') : '';
  if (serialCustomerVal) applyCustomerProjectFilter(serialCustomerVal, 'serialProjectSearch', 'serialProjectList');

  // --- Inventory (for serial item) ---
  const inventoryOpts = data.inventory.map(i => ({
    value: i.code || i.name,
    label: i.name + (i.code ? ' (' + i.code + ')' : '')
  }));
  // serialItemSearch/serialItem removed - replaced by per-item-block dropdowns, see refreshSerialItemDropdowns()

  // --- Crew ---
  const crewOpts = data.crew.map(c => ({ value: c.name, label: c.name + (c.role ? ' - ' + c.role : '') }));
  populateSearchDropdown('petrolCrewSearch', 'petrolCrewList', crewOpts, 'petrolCrew');
  populateSearchDropdown('pettyPaidBySearch', 'pettyPaidByList', crewOpts, 'pettyPaidBy');
  populateSearchDropdown('serialPersonSearch', 'serialPersonList', crewOpts, 'serialPerson');

  // --- Suppliers ---
  const supplierOpts = toOptions(data.suppliers || [], 'code');
  window._allSuppliers = data.suppliers || [];
  populateSearchDropdown('pettySupplierSearch', 'pettySupplierList', supplierOpts, 'pettySupplier');
  populateSearchDropdown('chatSupplierSearch', 'chatSupplierList', supplierOpts, 'chatSupplier');
  populateSearchDropdown('serialSupplierSearch', 'serialSupplierList', supplierOpts, 'serialSupplier');

  // --- Cars ---
  const carOpts = (data.cars || []).map(c => ({
    value: c.plateNo,
    label: c.plateNo + (c.makeModel ? ' (' + c.makeModel + ')' : '')
  }));
  populateSearchDropdown('petrolCarSearch', 'petrolCarList', carOpts, 'petrolCar');
  populateSearchDropdown('pettyCarSearch', 'pettyCarList', carOpts, 'pettyCar');
  populateSearchDropdown('chatCarSearch', 'chatCarList', carOpts, 'chatCar');

  // --- Crew Checkboxes (with search) ---
  // Daily tab's "Who Worked?" and Serial tab's "Crew On Site" both need to
  // support selecting multiple staff, so both use the same checkbox pattern.
  populateCrewCheckboxes(data.crew, 'crewCheckboxes', 'crewSearch');
  // serialCrewCheckboxes removed - Serial tab now uses a single Person dropdown (serialPerson), see above

  // --- Material rows (inventory) ---
  populateMaterialRows(data.inventory);

  // Also store inventory/customers for later use in dynamically added rows
  window._inventoryData = data.inventory;
  refreshSerialItemDropdowns(data.inventory);

  // Bahrain fuel prices barely change for long stretches, so pre-fill
  // Cost/Litre with whatever was used last instead of leaving it blank.
  // Only fills it in if the field is currently empty, so it never
  // clobbers a value the user is mid-way through typing/reviewing.
  const costField = document.getElementById('petrolCostPerLitre');
  if (costField && !costField.value && data.lastFuelCostPerLitre) {
    costField.value = Number(data.lastFuelCostPerLitre).toFixed(3);
  }
}

function populateCrewCheckboxes(crew, containerId = 'crewCheckboxes', searchInputId = 'crewSearch') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Preserve any selections already made (e.g. a refresh triggered mid-form)
  // so re-populating the list doesn't silently uncheck the user's picks.
  const previouslyChecked = new Set(
    Array.from(container.querySelectorAll('.crew-checkbox:checked')).map(cb => cb.value)
  );

  container.innerHTML = '';
  crew.forEach(c => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = c.name;
    cb.className = 'crew-checkbox';
    if (previouslyChecked.has(c.name)) cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(c.name + ' (' + c.role + ')'));
    container.appendChild(label);
  });

  // Attach search filter for crew
  const searchInput = document.getElementById(searchInputId);
  if (searchInput && !searchInput.dataset.filterBound) {
    searchInput.dataset.filterBound = 'true';
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
function getSelectedCrew(containerId = 'crewCheckboxes') {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const checkboxes = container.querySelectorAll('.crew-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function clearSelectedCrew(containerId = 'crewCheckboxes') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.crew-checkbox:checked').forEach(cb => cb.checked = false);
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

/**
 * Downscales and recompresses an image file before sending it to the AI
 * scan endpoint - full-resolution phone photos (often 3-4000px, several MB)
 * made scanSerialImage() slow for no benefit, since a label/barcode is
 * legible at much lower resolution. Returns base64 (no data: prefix) JPEG,
 * capped at maxDim on the long edge. Falls back to the original file's
 * base64 if canvas processing fails for any reason (e.g. an unsupported
 * image format), so a scan never simply breaks because of this.
 */
function compressImageForScan(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const commaIdx = dataUrl.indexOf(',');
        resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        fileToBase64(file).then(resolve);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fileToBase64(file).then(resolve);
    };
    img.src = url;
  });
}

/**
 * Compresses then sends a photo to the AI scan endpoint. Always used
 * instead of calling scanSerialImage directly with a raw fileToBase64()
 * payload - full-size phone photos made every AI scan noticeably slow.
 */
async function scanImageWithAI(file) {
  const base64 = await compressImageForScan(file);
  return callAPI('scanSerialImage', { method: 'POST', body: { image: base64 } });
}

async function handlePhotoUpload(fileInput, hiddenFieldId, previewContainerId, extractType = null, statusElId = null) {
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
        // AI auto-extract is only wired for single-file receipt inputs
        // (Petrol/Petty Cash), never for the multi-photo Daily tab.
        if (extractType && !fileInput.multiple) {
          extractReceiptAndFill(base64, extractType, statusElId);
        }
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
// AI RECEIPT EXTRACTION (Qwen VL, via Code.gs 'extractReceipt')
// ======================================================
/**
 * Sends a receipt photo (already-uploaded base64) to the backend for
 * AI extraction, then auto-fills the relevant form fields for the user
 * to review before submitting. Never auto-submits the form.
 */
async function extractReceiptAndFill(base64, type, statusElId) {
  if (statusElId) showMessage(statusElId, '🔎 Reading receipt...', 'info');
  try {
    const result = await callAPI('extractReceipt', { method: 'POST', body: { base64, type } });
    if (!result.success) {
      if (statusElId) showMessage(statusElId, '⚠️ Could not auto-read receipt: ' + result.error, 'error');
      return;
    }
    const d = result.data || {};

    if (type === 'petrol') {
      if (d.date) document.getElementById('petrolDate').value = d.date;
      if (d.liters !== null && d.liters !== undefined) document.getElementById('petrolLiters').value = d.liters;
      if (d.totalAmount !== null && d.totalAmount !== undefined) document.getElementById('petrolAmount').value = d.totalAmount;
      if (typeof calcPetrolTotal === 'function') calcPetrolTotal();
      if (statusElId) showMessage(statusElId, '✅ Auto-filled from receipt — please review before submitting', 'success');
    } else if (type === 'pettyCash') {
      if (d.date) document.getElementById('pettyDate').value = d.date;
      if (d.category) {
        const catSelect = document.getElementById('pettyCategory');
        const match = Array.from(catSelect.options).find(o => o.value === d.category);
        if (match) {
          catSelect.value = d.category;
          catSelect.dispatchEvent(new Event('change'));
        }
      }
      if (d.description) document.getElementById('pettyDescription').value = d.description;
      if (d.amountExcludingVAT !== null && d.amountExcludingVAT !== undefined) document.getElementById('pettyAmountExVAT').value = d.amountExcludingVAT;
      if (d.vatAmount !== null && d.vatAmount !== undefined) document.getElementById('pettyVAT').value = d.vatAmount;
      if (d.totalAmount !== null && d.totalAmount !== undefined) document.getElementById('pettyTotalAmount').value = d.totalAmount;
      if (typeof calcPettyTotal === 'function') calcPettyTotal();

      // Best-effort match of the extracted supplier name against the
      // existing Suppliers dropdown; falls back to just filling the text
      // (unmatched, so the hidden select stays empty and the user can
      // pick the right one or add it via the + button).
      if (d.supplier) {
        const input = document.getElementById('pettySupplierSearch');
        const opts = JSON.parse(input.dataset.options || '[]');
        const lower = d.supplier.toLowerCase().trim();
        const match = opts.find(o => {
          const name = o.label.split(' (')[0].toLowerCase().trim();
          return name === lower || name.includes(lower) || lower.includes(name);
        });
        if (match) {
          input.value = match.label;
          document.getElementById('pettySupplier').value = match.value;
        } else {
          input.value = d.supplier;
          document.getElementById('pettySupplier').value = '';
        }
      }

      // VAT number: prefer whatever's printed on the receipt itself. If the
      // receipt didn't have one but we matched a known supplier above, fall
      // back to that supplier's VAT number on file.
      if (d.supplierVATNumber) {
        document.getElementById('pettySupplierVAT').value = d.supplierVATNumber;
      } else if (d.supplier) {
        const matchedValue = document.getElementById('pettySupplier').value;
        if (matchedValue) document.getElementById('pettySupplierVAT').value = findSupplierVAT(matchedValue);
      }
      if (statusElId) showMessage(statusElId, '✅ Auto-filled from receipt — please review before submitting', 'success');
    }
  } catch (err) {
    if (statusElId) showMessage(statusElId, '⚠️ Auto-read failed: ' + err.message, 'error');
  }
}

// ======================================================
// SUPPLIER VAT AUTOFILL
// ======================================================
/**
 * Looks up a supplier's VAT registration number (from the Suppliers sheet)
 * by the code/name value the supplier dropdown carries. Used to auto-fill
 * the Petty Cash "Supplier VAT Number" field the moment a supplier is
 * picked, so the user only has to type it manually for suppliers that
 * don't have a VAT number on file yet (or aren't in the Suppliers sheet
 * at all).
 */
function findSupplierVAT(value) {
  if (!value) return '';
  const list = window._allSuppliers || [];
  const match = list.find(s => s.code === value || s.name === value);
  return match ? (match.vat || '') : '';
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
      { id: 'code', label: 'Code (optional - auto-generated if left blank)', type: 'text', required: false }
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
      { id: 'name', label: 'Item Name', type: 'text', required: true },
      { id: 'code', label: 'Item Code (optional - auto-generated if left blank)', type: 'text', required: false },
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
      { id: 'code', label: 'Code (optional - auto-generated if left blank)', type: 'text', required: false },
      { id: 'vat', label: 'VAT Number (optional)', type: 'text', required: false }
    ]
  },
  car: {
    title: 'Add Car',
    action: 'addCar',
    fields: [
      { id: 'plateNo', label: 'Plate No.', type: 'text', required: true },
      { id: 'makeModel', label: 'Make/Model', type: 'text', required: false },
      { id: 'assignedCrew', label: 'Assigned Crew', type: 'text', required: false },
      { id: 'registrationExpiry', label: 'Registration Expiry', type: 'date', required: false },
      { id: 'insuranceExpiry', label: 'Insurance Expiry', type: 'date', required: false }
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
  else if (type === 'car') list = dropdownData.cars || [];

  // Cars are keyed by plate number, not name - everything else uses name.
  const record = type === 'car'
    ? list.find(r => r.plateNo === submittedData.plateNo)
    : list.find(r => r.name === submittedData.name);
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
  } else if (type === 'car') {
    value = record.plateNo;
    label = record.plateNo + (record.makeModel ? ' (' + record.makeModel + ')' : '');
  } else {
    // customer / supplier / inventory all carry a code alongside the name
    value = record.code || record.name;
    label = record.name + (record.code ? ' (' + record.code + ')' : '');
  }

  searchInput.value = label;
  if (hiddenSelect) hiddenSelect.value = value;
  searchInput.dispatchEvent(new Event('change'));

  // Newly-added suppliers carry whatever VAT number was typed into the
  // modal straight onto the Petty Cash VAT field, same as picking an
  // existing supplier does (see the pettySupplierSearch change listener).
  if (type === 'supplier') {
    const vatField = document.getElementById('pettySupplierVAT');
    if (vatField) vatField.value = record.vat || '';
  }
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
      // When the Code field was left blank, the backend auto-generates one -
      // surface it so the user knows what got assigned.
      const codeNote = result.code && !data.code ? (' — code: ' + result.code) : '';
      showModalMessage('✅ Added successfully' + codeNote, 'success');
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

// Reverse of calcPetrolTotal: most refills are either a full tank or a
// round BHD amount, so typing straight into Total Amount back-calculates
// Liters from the current Cost/Litre. Setting .value here (rather than
// dispatching an 'input' event) intentionally does NOT re-trigger
// calcPetrolTotal, so there's no calculation feedback loop.
function calcPetrolLitersFromAmount() {
  const amount = parseFloat(document.getElementById('petrolAmount').value) || 0;
  const cost = parseFloat(document.getElementById('petrolCostPerLitre').value) || 0;
  if (amount && cost) {
    document.getElementById('petrolLiters').value = (amount / cost).toFixed(3);
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
  const crew = getSelectedCrew('crewCheckboxes');
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
      // Fully reset the form for the next entry.
      resetSearchDropdown('dailyCustomerSearch', 'dailyCustomer');
      resetSearchDropdown('dailyProjectSearch', 'dailyProject');
      filterProjectDropdownByCustomerCode('', 'dailyProjectSearch', 'dailyProjectList', 'dailyProject');
      document.getElementById('dailyWorkType').value = '';
      document.getElementById('dailyDescription').value = '';
      document.getElementById('dailyIssues').value = '';
      document.getElementById('dailyEmail').value = '';
      document.getElementById('dailyPhotos').value = '';
      document.getElementById('dailyPhotoPreview').innerHTML = '';
      clearSelectedCrew('crewCheckboxes');
      // Reset materials
      document.getElementById('materialContainer').innerHTML = '';
      addMaterialRow(); // Add one empty row
      // Reset date/time back to defaults (today / now)
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('dailyDate').value = today;
      document.getElementById('dailyStartTime').value = new Date().toTimeString().slice(0, 5);
      document.getElementById('dailyEndTime').value = '';
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
    crewOnSite: getSelectedCrew('serialCrewCheckboxes').join(', '),
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
      // Fully reset the form for the next entry.
      resetSearchDropdown('serialCustomerSearch', 'serialCustomer');
      resetSearchDropdown('serialProjectSearch', 'serialProject');
      filterProjectDropdownByCustomerCode('', 'serialProjectSearch', 'serialProjectList', 'serialProject');
      resetSearchDropdown('serialItemSearch', 'serialItem');
      document.getElementById('serialNumber').value = '';
      document.getElementById('serialQty').value = 1;
      clearSelectedCrew('serialCrewCheckboxes');
      document.getElementById('serialNotes').value = '';
      document.getElementById('serialPhoto').value = '';
      document.getElementById('serialPhotoPreview').innerHTML = '';
      document.getElementById('serialDate').value = new Date().toISOString().split('T')[0];
    } else {
      showMessage('serialMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit Serial Entry';
    showMessage('serialMessage', '❌ Error: ' + error.message, 'error');
  }
}

// ======================================================
// SERIAL TAB v2 - Goods Received / Delivery Note, multi-item, AI scanning
// ======================================================

/**
 * Toggles the Supplier (Goods Received) vs Customer+Project (Delivery
 * Note) sections and keeps native "required" validation in sync with
 * whichever section is actually visible, so the browser doesn't block
 * submission on a hidden field.
 */
function handleSerialTransactionTypeChange() {
  const type = document.getElementById('serialTransactionType').value;
  const isGoodsReceived = type === 'Goods Received';
  const isDeliveryNote = type === 'Delivery Note';

  document.getElementById('serialSupplierSection').style.display = isGoodsReceived ? 'grid' : 'none';
  document.getElementById('serialCustomerSection').style.display = isDeliveryNote ? 'grid' : 'none';

  document.getElementById('serialSupplierSearch').required = isGoodsReceived;
  document.getElementById('serialCustomerSearch').required = isDeliveryNote;
  document.getElementById('serialProjectSearch').required = isDeliveryNote;
}

/**
 * Client-side barcode/QR decode straight off a photo, before falling back
 * to the AI vision scan. Tries the browser's native BarcodeDetector first
 * (fast, no network call); if that's unavailable or finds nothing, falls
 * back to the ZXing library (covers iOS Safari, which has no
 * BarcodeDetector). Returns null (not an error) if no barcode is found by
 * either - a plain printed serial with no barcode is expected to fall
 * through to the AI scan instead.
 */
function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

async function decodeBarcodeFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    if (window.BarcodeDetector) {
      try {
        const detector = new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'codabar', 'itf', 'pdf417', 'data_matrix', 'aztec']
        });
        const img = await loadImageElement(url);
        const barcodes = await detector.detect(img);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) return barcodes[0].rawValue;
      } catch (err) {
        // Native detector present but failed (unsupported format on this
        // device, etc.) - fall through to the ZXing fallback below.
      }
    }
    if (window.ZXing) {
      try {
        const reader = new ZXing.BrowserMultiFormatReader();
        const result = await reader.decodeFromImageUrl(url);
        if (result && typeof result.getText === 'function') return result.getText();
      } catch (err) {
        // No barcode found by ZXing either - not an error, just means the
        // photo doesn't contain a decodable barcode/QR (e.g. a plain
        // printed serial number).
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Matches a scanned/typed Part Number to an inventory item. The Inventory
 * sheet has no dedicated "part number" column, so this matches against
 * ItemCode first (in practice often the same as the manufacturer part/
 * model number), then falls back to a substring match against the item
 * name. Returns null (leaving the Item dropdown blank but still
 * manually-searchable, per spec) when nothing matches.
 */
function matchInventoryItemByPartNumber(partNumber) {
  const inventory = window._inventoryData || [];
  const target = String(partNumber || '').trim().toLowerCase();
  if (!target) return null;
  return inventory.find(i => String(i.code || '').trim().toLowerCase() === target)
    || inventory.find(i => String(i.name || '').toLowerCase().includes(target))
    || null;
}

/**
 * Same as matchInventoryItemByPartNumber, but tries the Model Number first
 * when present (a scanned label's MODEL NO is often a cleaner match to the
 * inventory ItemCode than its Part Number), falling back to Part Number.
 */
function matchInventoryItemByModelOrPart(modelNumber, partNumber) {
  return matchInventoryItemByPartNumber(modelNumber) || matchInventoryItemByPartNumber(partNumber);
}

// --- Repeatable item blocks ---

function initSerialItemDropdown(blockEl, inventory) {
  const searchInput = blockEl.querySelector('.serial-item-search');
  const listDiv = blockEl.querySelector('.serial-item-list');
  const hiddenSelect = blockEl.querySelector('.serial-item-hidden');
  if (!searchInput || !listDiv) return;

  const opts = inventory.map(item => ({
    value: item.code || item.name,
    label: item.name + (item.code ? ' (' + item.code + ')' : '')
  }));
  searchInput.dataset.options = JSON.stringify(opts);

  // Options are refreshed above every call (e.g. after a dropdown reload),
  // but listeners should only ever be attached once per block.
  if (searchInput.dataset.bound) return;
  searchInput.dataset.bound = 'true';

  searchInput.addEventListener('focus', function() {
    const optsParsed = JSON.parse(this.dataset.options || '[]');
    renderDropdownList(listDiv.id, optsParsed);
    listDiv.classList.add('show');
  });
  searchInput.addEventListener('blur', function() {
    setTimeout(() => { listDiv.classList.remove('show'); }, 200);
  });
  searchInput.addEventListener('input', function() {
    const query = this.value.toLowerCase().trim();
    const optsParsed = JSON.parse(this.dataset.options || '[]');
    const filtered = optsParsed.filter(opt => opt.label.toLowerCase().includes(query));
    renderDropdownList(listDiv.id, filtered);
    listDiv.classList.toggle('show', filtered.length > 0);
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

function refreshSerialItemDropdowns(inventory) {
  document.querySelectorAll('#serialItemsContainer .serial-item-block').forEach(block => initSerialItemDropdown(block, inventory));
}

function renumberSerialItemBlocks() {
  document.querySelectorAll('#serialItemsContainer .serial-item-block .serial-item-title span').forEach((span, idx) => {
    span.textContent = 'Item ' + (idx + 1);
  });
}

let serialItemBlockCounter = 0;

function addSerialItemBlock() {
  const container = document.getElementById('serialItemsContainer');
  if (!container) return;
  serialItemBlockCounter++;
  const uid = 'si_' + Date.now() + '_' + serialItemBlockCounter;

  const div = document.createElement('div');
  div.className = 'serial-item-block';
  div.innerHTML = `
    <div class="serial-item-title">
      <span>Item</span>
      <button type="button" class="remove-btn" onclick="removeSerialItemBlock(this)">×</button>
    </div>
    <div class="serial-field-row">
      <input type="text" class="serial-item-serial" placeholder="Serial number - type or scan">
      <button type="button" class="scan-btn" title="Scan barcode/QR/label with camera or gallery" onclick="this.nextElementSibling.click()">📷</button>
      <input type="file" class="serial-item-scan-input" accept="image/*" capture="environment" style="display:none;">
    </div>
    <div class="scan-status"></div>
    <div class="serial-field-row">
      <input type="text" class="serial-item-partnumber" placeholder="Part Number">
      <input type="text" class="serial-item-modelnumber" placeholder="Model Number">
    </div>
    <div class="serial-field-row">
      <input type="text" class="serial-item-brand" placeholder="Brand">
    </div>
    <div style="position:relative;">
      <input type="text" class="serial-item-search search-input" placeholder="Search inventory item (optional)..." style="width:100%;">
      <select class="serial-item-hidden" style="display:none;"></select>
      <div class="serial-item-list dropdown-list" id="silist_${uid}"></div>
    </div>
  `;
  container.appendChild(div);

  div.querySelector('.serial-item-scan-input').addEventListener('change', function() {
    handleSerialItemScan(this, div);
  });

  initSerialItemDropdown(div, window._inventoryData || []);
  renumberSerialItemBlocks();
}

function removeSerialItemBlock(btn) {
  const container = document.getElementById('serialItemsContainer');
  const block = btn.closest('.serial-item-block');
  if (container && block && container.children.length > 1) {
    block.remove();
    renumberSerialItemBlocks();
  }
}

/**
 * Per-item scan: barcode/QR decode first (fills Serial immediately if
 * found), then always also runs the AI vision scan (Part Number and Brand
 * can only come from reading the label's text, and AI is the fallback for
 * Serial when no barcode was found). Never displays the photo itself -
 * only the extracted text - per spec. Also attempts to auto-match the
 * scanned Part Number against inventory once done.
 */
async function handleSerialItemScan(fileInput, blockEl) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const statusEl = blockEl.querySelector('.scan-status');
  const serialInput = blockEl.querySelector('.serial-item-serial');
  const partInput = blockEl.querySelector('.serial-item-partnumber');
  const modelInput = blockEl.querySelector('.serial-item-modelnumber');
  const brandInput = blockEl.querySelector('.serial-item-brand');
  const itemSearch = blockEl.querySelector('.serial-item-search');
  const itemHidden = blockEl.querySelector('.serial-item-hidden');

  const setStatus = (text, cls) => { if (statusEl) { statusEl.textContent = text; statusEl.className = 'scan-status ' + cls; } };
  setStatus('🔎 Scanning...', 'scanning');

  // Barcode decode and the AI vision scan don't depend on each other, so
  // run them in parallel instead of one after another - this was the main
  // source of the scan feeling slow (each step could take a couple of
  // seconds on its own).
  const [barcodeOutcome, aiOutcome] = await Promise.allSettled([
    decodeBarcodeFromFile(file),
    scanImageWithAI(file)
  ]);

  const barcodeValue = barcodeOutcome.status === 'fulfilled' ? barcodeOutcome.value : null;
  if (barcodeValue && serialInput) serialInput.value = barcodeValue;

  if (aiOutcome.status === 'fulfilled') {
    const result = aiOutcome.value;
    if (result.success) {
      if (!barcodeValue && result.serialNumber && serialInput) serialInput.value = result.serialNumber;
      if (result.partNumber && partInput) partInput.value = result.partNumber;
      if (result.modelNumber && modelInput) modelInput.value = result.modelNumber;
      if (result.brand && brandInput) brandInput.value = result.brand;

      if (serialInput && serialInput.value) {
        setStatus('✅ Scanned: ' + serialInput.value, 'scan-success');
      } else {
        setStatus('⚠️ Could not read a serial number - please type it in', 'scan-error');
      }

      if ((result.modelNumber || result.partNumber) && itemSearch && itemHidden) {
        const match = matchInventoryItemByModelOrPart(result.modelNumber, result.partNumber);
        if (match) {
          itemSearch.value = match.name + (match.code ? ' (' + match.code + ')' : '');
          itemHidden.value = match.code || match.name;
        }
        // No match: leave the Item dropdown blank but still manually
        // searchable, per spec.
      }
    } else if (barcodeValue) {
      setStatus('✅ Barcode: ' + barcodeValue + ' (AI read failed: ' + result.error + ')', 'scan-success');
    } else {
      setStatus('⚠️ AI scan failed: ' + result.error, 'scan-error');
    }
  } else if (barcodeValue) {
    setStatus('✅ Barcode: ' + barcodeValue + ' (AI read unavailable: ' + aiOutcome.reason.message + ')', 'scan-success');
  } else {
    setStatus('⚠️ Scan failed: ' + aiOutcome.reason.message, 'scan-error');
  }

  fileInput.value = '';
}

function getSerialItemsData() {
  const blocks = document.querySelectorAll('#serialItemsContainer .serial-item-block');
  const items = [];
  blocks.forEach(block => {
    const serialNumber = block.querySelector('.serial-item-serial').value.trim();
    const partNumber = block.querySelector('.serial-item-partnumber').value.trim();
    const modelNumberEl = block.querySelector('.serial-item-modelnumber');
    const modelNumber = modelNumberEl ? modelNumberEl.value.trim() : '';
    const brand = block.querySelector('.serial-item-brand').value.trim();
    const itemHidden = block.querySelector('.serial-item-hidden');
    const itemSearch = block.querySelector('.serial-item-search');
    const item = (itemHidden && itemHidden.value) ? itemHidden.value : (itemSearch ? itemSearch.value.trim() : '');
    if (serialNumber) items.push({ serialNumber, partNumber, modelNumber, brand, item });
  });
  return items;
}

async function submitSerialForm(e) {
  e.preventDefault();
  clearMessage('serialMessage');

  const transactionType = document.getElementById('serialTransactionType').value;
  const isGoodsReceived = transactionType === 'Goods Received';
  const items = getSerialItemsData();

  const data = {
    action: 'submitSerialBatch',
    transactionType: transactionType,
    date: document.getElementById('serialDate').value,
    items: items,
    responsiblePerson: getSearchDropdownValue('serialPersonSearch', 'serialPerson'),
    notes: document.getElementById('serialNotes').value
  };

  if (isGoodsReceived) {
    data.supplier = getSearchDropdownValue('serialSupplierSearch', 'serialSupplier');
    data.project = getSearchDropdownValue('serialGRProjectSearch', 'serialGRProject'); // optional
  } else {
    data.customer = getSearchDropdownValue('serialCustomerSearch', 'serialCustomer');
    data.project = getSearchDropdownValue('serialProjectSearch', 'serialProject');
  }

  if (!transactionType) { showMessage('serialMessage', 'Please select a transaction type', 'error'); return; }
  if (isGoodsReceived && !data.supplier) { showMessage('serialMessage', 'Please select a supplier', 'error'); return; }
  if (!isGoodsReceived && (!data.customer || !data.project)) { showMessage('serialMessage', 'Please select a customer and project', 'error'); return; }
  if (!data.date) { showMessage('serialMessage', 'Please select a date', 'error'); return; }
  if (items.length === 0) { showMessage('serialMessage', 'Add at least one item with a serial number', 'error'); return; }
  if (!data.responsiblePerson) { showMessage('serialMessage', 'Please select the responsible person', 'error'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const result = await callAPI('submitSerialBatch', { method: 'POST', body: data });
    btn.disabled = false;
    btn.textContent = 'Submit';
    if (result.success) {
      showMessage('serialMessage', '✅ ' + result.message, 'success');
      // Fully reset the form for the next entry.
      document.getElementById('serialTransactionType').value = '';
      handleSerialTransactionTypeChange();
      resetSearchDropdown('serialSupplierSearch', 'serialSupplier');
      resetSearchDropdown('serialGRProjectSearch', 'serialGRProject');
      resetSearchDropdown('serialCustomerSearch', 'serialCustomer');
      resetSearchDropdown('serialProjectSearch', 'serialProject');
      filterProjectDropdownByCustomerCode('', 'serialProjectSearch', 'serialProjectList', 'serialProject');
      resetSearchDropdown('serialPersonSearch', 'serialPerson');
      document.getElementById('serialNotes').value = '';
      document.getElementById('serialDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('serialItemsContainer').innerHTML = '';
      addSerialItemBlock();
    } else {
      showMessage('serialMessage', '❌ ' + result.error, 'error');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Submit';
    showMessage('serialMessage', '❌ Error: ' + error.message, 'error');
  }
}

// --- Lookup Serial: manual typing, or camera/gallery scan ---

async function handleLookupScan(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const statusEl = document.getElementById('lookupScanStatus');
  const lookupInput = document.getElementById('lookupSerial');
  const setStatus = (text, cls) => { statusEl.textContent = text; statusEl.className = 'message ' + cls; statusEl.style.display = 'block'; };
  setStatus('🔎 Scanning...', 'info');

  const [barcodeOutcome, aiOutcome] = await Promise.allSettled([
    decodeBarcodeFromFile(file),
    scanImageWithAI(file)
  ]);

  const barcodeValue = barcodeOutcome.status === 'fulfilled' ? barcodeOutcome.value : null;
  if (barcodeValue) lookupInput.value = barcodeValue;

  if (aiOutcome.status === 'fulfilled') {
    const result = aiOutcome.value;
    if (result.success && !barcodeValue && result.serialNumber) lookupInput.value = result.serialNumber;
    if (lookupInput.value) {
      setStatus('✅ Detected: ' + lookupInput.value + ' — tap Search', 'success');
    } else {
      setStatus('⚠️ ' + (result.error || 'Could not read a serial number from that photo - please type it in'), 'error');
    }
  } else if (barcodeValue) {
    setStatus('✅ Detected: ' + barcodeValue + ' — tap Search', 'success');
  } else {
    setStatus('⚠️ ' + aiOutcome.reason.message, 'error');
  }
  fileInput.value = '';
}

async function submitPetrol(e) {
  e.preventDefault();
  clearMessage('petrolMessage');
  const data = {
    action: 'submitPetrol',
    crewMember: getSearchDropdownValue('petrolCrewSearch', 'petrolCrew'),
    car: getSearchDropdownValue('petrolCarSearch', 'petrolCar'),
    date: document.getElementById('petrolDate').value,
    odometer: document.getElementById('petrolOdometer').value,
    liters: document.getElementById('petrolLiters').value,
    costPerLitre: document.getElementById('petrolCostPerLitre').value,
    totalAmount: document.getElementById('petrolAmount').value,
    paymentMethod: document.getElementById('petrolPaymentMethod').value,
    receiptPhoto: document.getElementById('petrolReceipt').value,
    email: document.getElementById('petrolEmail').value
  };

  if (!data.crewMember || !data.car || !data.date || !data.totalAmount) {
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
      // Fully reset the form for the next entry.
      resetSearchDropdown('petrolCrewSearch', 'petrolCrew');
      resetSearchDropdown('petrolCarSearch', 'petrolCar');
      document.getElementById('petrolOdometer').value = '';
      document.getElementById('petrolLiters').value = '';
      // Cost/Litre is intentionally NOT cleared here - it's "remembered"
      // across entries since Bahrain fuel prices rarely change, so the
      // next fill-up starts pre-filled with the price just used.
      document.getElementById('petrolAmount').value = '';
      document.getElementById('petrolPaymentMethod').value = 'Cash';
      document.getElementById('petrolReceipt').value = '';
      document.getElementById('petrolReceiptPreview').innerHTML = '';
      clearMessage('petrolExtractStatus');
      document.getElementById('petrolEmail').value = '';
      document.getElementById('petrolDate').value = new Date().toISOString().split('T')[0];
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
  const isCarMaintenance = document.getElementById('pettyCategory').value === 'Car Maintenance';

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
    supplierVAT: document.getElementById('pettySupplierVAT').value,
    receiptPhoto: document.getElementById('pettyReceipt').value,
    notes: document.getElementById('pettyNotes').value,
    email: document.getElementById('pettyEmail').value,
    car: isCarMaintenance ? getSearchDropdownValue('pettyCarSearch', 'pettyCar') : '',
    odometer: isCarMaintenance ? document.getElementById('pettyOdometer').value : ''
  };

  if (!data.date || !data.category || !data.description || !data.totalAmount) {
    showMessage('pettyMessage', 'Please fill all required fields', 'error');
    return;
  }

  if (isCarMaintenance && !data.car) {
    showMessage('pettyMessage', 'Please select a car for Car Maintenance expenses', 'error');
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
      // Fully reset the form for the next entry.
      document.getElementById('pettyCategory').value = '';
      document.getElementById('pettyDescription').value = '';
      resetSearchDropdown('pettyProjectSearch', 'pettyProject');
      document.getElementById('pettyAmountExVAT').value = '';
      document.getElementById('pettyVAT').value = '';
      document.getElementById('pettyTotalAmount').value = '';
      resetSearchDropdown('pettyPaidBySearch', 'pettyPaidBy');
      document.getElementById('pettyPaymentMethod').value = 'Cash';
      resetSearchDropdown('pettySupplierSearch', 'pettySupplier');
      document.getElementById('pettySupplierVAT').value = '';
      resetSearchDropdown('pettyCarSearch', 'pettyCar');
      document.getElementById('pettyOdometer').value = '';
      document.getElementById('pettyCarGroup').style.display = 'none';
      document.getElementById('pettyOdometerGroup').style.display = 'none';
      document.getElementById('pettyNotes').value = '';
      document.getElementById('pettyReceipt').value = '';
      document.getElementById('pettyReceiptPreview').innerHTML = '';
      clearMessage('pettyExtractStatus');
      document.getElementById('pettyEmail').value = '';
      document.getElementById('pettyDate').value = new Date().toISOString().split('T')[0];
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
            Type: ${r['Column 12'] || '—'} | Customer: ${r['Column 3'] || '—'} | Supplier: ${r['Column 13'] || '—'}<br>
            Project: ${r['Column 4'] || '—'} | Part #: ${r['Column 14'] || '—'} | Brand: ${r['Column 15'] || '—'}<br>
            Date: ${r['Column 5']} | Person: ${r['Column 16'] || r['Column 6'] || '—'}<br>
            Notes: ${r['Column 7'] || '—'}
          </div>
        `).join('');
        resultEl.className = 'message success';
      }
      resultEl.style.display = 'block';
      // Whether or not records were found, let the user ask a follow-up
      // question about this serial - a "no records" answer is still a
      // useful (and honest) response from askAboutSerial().
      window._lastLookedUpSerial = serial;
      document.getElementById('serialAskAIBlock').style.display = 'block';
      document.getElementById('serialAskAIAnswer').style.display = 'none';
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

async function askAboutSerial() {
  const serial = window._lastLookedUpSerial || document.getElementById('lookupSerial').value.trim();
  const question = document.getElementById('serialAskAIQuestion').value.trim();
  const answerEl = document.getElementById('serialAskAIAnswer');
  if (!serial) {
    answerEl.textContent = 'Look up a serial number first';
    answerEl.className = 'message error';
    answerEl.style.display = 'block';
    return;
  }
  if (!question) {
    answerEl.textContent = 'Type a question first';
    answerEl.className = 'message error';
    answerEl.style.display = 'block';
    return;
  }
  answerEl.textContent = '🤔 Thinking...';
  answerEl.className = 'message info';
  answerEl.style.display = 'block';
  try {
    const result = await callAPI('askAboutSerial', { method: 'POST', body: { serial, question } });
    if (result.success) {
      answerEl.textContent = result.answer;
      answerEl.className = 'message success';
    } else {
      answerEl.textContent = '❌ ' + result.error;
      answerEl.className = 'message error';
    }
  } catch (error) {
    answerEl.textContent = '❌ ' + error.message;
    answerEl.className = 'message error';
  }
  answerEl.style.display = 'block';
}

// ======================================================
// PROJECT TASKS — TECHNICIAN SCOPE CHECKLIST (Tasks tab)
// ======================================================
// Drill-down state: which System/Task/Subtask the technician has tapped
// into, so the breadcrumb and "back" behaviour know where they are. Reset
// every time a different project is loaded.
let taskTreeData = null;
let taskDrillPath = []; // e.g. ['System name', 'Task name'] while drilling down

// Guards against a real race: the searchable-dropdown input fires a native
// browser 'change' event on blur (with whatever raw text was typed) a beat
// BEFORE the dropdown-item click handler sets the real value and dispatches
// its own synthetic 'change'. That means loadProjectTasks can be called
// twice in quick succession - once with a bogus half-typed project name,
// once with the real one - and since these are two independent async
// fetches, the bogus call's response can arrive AFTER the real one and
// silently overwrite good data with "no scope of work found". This counter
// makes loadProjectTasks ignore any response that isn't from the most
// recent call.
let taskLoadRequestId = 0;

const TASK_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed'];
const TASK_STATUS_CLASS = {
  'Not Started': 'task-status-notstarted',
  'In Progress': 'task-status-inprogress',
  'On Hold': 'task-status-onhold',
  'Completed': 'task-status-completed'
};

async function loadProjectTasks(project) {
  const container = document.getElementById('taskTreeContainer');
  const msgEl = document.getElementById('taskTreeMessage');
  clearMessage('taskTreeMessage');
  container.innerHTML = '<p style="color:#8e8e93;">Loading scope of work…</p>';
  taskDrillPath = [];
  const requestId = ++taskLoadRequestId;
  try {
    const result = await callAPI('getProjectTasks', { project });
    // A newer call has since started (see taskLoadRequestId comment above) -
    // this response is stale, drop it so it can't clobber the current view.
    if (requestId !== taskLoadRequestId) return;
    if (!result.success) {
      showMessage('taskTreeMessage', '❌ ' + result.error, 'error');
      container.innerHTML = '';
      return;
    }
    taskTreeData = result.systems || [];
    if (taskTreeData.length === 0) {
      container.innerHTML = '<p style="color:#8e8e93;">No scope of work has been set up for this project yet.</p>';
      document.getElementById('taskBreadcrumb').style.display = 'none';
      return;
    }
    renderTaskLevel();
  } catch (err) {
    if (requestId !== taskLoadRequestId) return;
    showMessage('taskTreeMessage', '❌ ' + err.message, 'error');
    container.innerHTML = '';
  }
}

// Finds the node array at the current drill-down path: [] -> systems,
// [system] -> that system's tasks, [system, task] -> that task's subtasks,
// [system, task, subtask] -> that subtask's sub-subtasks.
function getCurrentTaskLevel() {
  let level = taskTreeData;
  let node = null;
  for (const name of taskDrillPath) {
    node = level.find(n => n.name === name);
    if (!node) return { items: [], node: null };
    if (node.tasks) level = node.tasks;
    else if (node.subtasks) level = node.subtasks;
    else if (node.subSubtasks) level = node.subSubtasks;
    else level = [];
  }
  return { items: level, node };
}

function renderTaskBreadcrumb() {
  const el = document.getElementById('taskBreadcrumb');
  if (taskDrillPath.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const crumbs = ['<span class="crumb-link" data-depth="0">Systems</span>']
    .concat(taskDrillPath.map((name, i) => `<span class="crumb-link" data-depth="${i + 1}">${name}</span>`));
  el.innerHTML = crumbs.join('<span class="crumb-sep"> › </span>');
  el.querySelectorAll('.crumb-link').forEach(elCrumb => {
    elCrumb.addEventListener('click', function() {
      const depth = parseInt(this.dataset.depth, 10);
      taskDrillPath = taskDrillPath.slice(0, depth);
      renderTaskLevel();
    });
  });
}

function statusPillHtml(status) {
  return `<span class="task-status-pill ${TASK_STATUS_CLASS[status] || ''}">${status}</span>`;
}

function renderTaskLevel() {
  renderTaskBreadcrumb();
  const container = document.getElementById('taskTreeContainer');
  const { items, node } = getCurrentTaskLevel();

  // Leaf node (has its own leaf object with a taskKey) - show the status
  // buttons + notes box instead of another list of cards.
  if (node && node.leaf && node.leaf.taskKey) {
    container.innerHTML = renderTaskLeafHtml(node);
    wireTaskLeafEvents(node);
    return;
  }

  if (items.length === 0) {
    container.innerHTML = '<p style="color:#8e8e93;">Nothing here.</p>';
    return;
  }

  container.innerHTML = items.map((item, idx) => {
    const isLeaf = item.leaf && item.leaf.taskKey;
    const sub = item.dueDate ? `Due ${item.dueDate}` : '';
    return `
      <div class="task-card ${item.complete ? 'task-card-complete' : ''}" data-idx="${idx}">
        <div class="task-card-main">
          <div class="task-card-name">${item.name}</div>
          ${sub ? `<div class="task-card-sub">${sub}</div>` : ''}
        </div>
        ${statusPillHtml(item.status)}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', function() {
      const idx = parseInt(this.dataset.idx, 10);
      taskDrillPath.push(items[idx].name);
      renderTaskLevel();
    });
  });
}

function renderTaskLeafHtml(node) {
  const leaf = node.leaf;
  const statusButtons = TASK_STATUSES.map(s => `
    <button type="button" class="task-status-btn ${TASK_STATUS_CLASS[s]} ${leaf.status === s ? 'active' : ''}" data-status="${s}">${s}</button>
  `).join('');
  return `
    <div class="task-leaf">
      <div class="task-leaf-name">${node.name}</div>
      ${leaf.assignedTechnician ? `<div class="task-card-sub">Assigned: ${leaf.assignedTechnician}</div>` : ''}
      ${leaf.dueDate ? `<div class="task-card-sub">Due: ${leaf.dueDate}</div>` : ''}
      <div class="task-status-buttons">${statusButtons}</div>
      <div class="form-group" style="margin-top:14px;">
        <label>Notes / issues on this task</label>
        <textarea id="taskLeafNotes" placeholder="Anything the project manager should know...">${leaf.notes || ''}</textarea>
      </div>
      <button type="button" class="btn" id="taskLeafSaveBtn">Save Notes</button>
      <div id="taskLeafMessage" class="message"></div>
    </div>
  `;
}

function wireTaskLeafEvents(node) {
  const leaf = node.leaf;
  document.querySelectorAll('.task-status-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const status = this.dataset.status;
      document.querySelectorAll('.task-status-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      await saveTaskLeafUpdate(leaf, { status });
    });
  });
  document.getElementById('taskLeafSaveBtn').addEventListener('click', async function() {
    const notes = document.getElementById('taskLeafNotes').value;
    await saveTaskLeafUpdate(leaf, { notes });
  });
}

async function saveTaskLeafUpdate(leaf, changes) {
  showMessage('taskLeafMessage', '⏳ Saving...', 'info');
  try {
    const result = await callAPI('updateTaskStatus', {
      method: 'POST',
      body: { taskKey: leaf.taskKey, status: changes.status || leaf.status, notes: changes.notes !== undefined ? changes.notes : leaf.notes }
    });
    if (result.success) {
      if (changes.status) leaf.status = changes.status;
      if (changes.notes !== undefined) leaf.notes = changes.notes;
      showMessage('taskLeafMessage', '✅ Saved', 'success');
    } else {
      showMessage('taskLeafMessage', '❌ ' + result.error, 'error');
    }
  } catch (err) {
    showMessage('taskLeafMessage', '❌ ' + err.message, 'error');
  }
}

// ======================================================
// ASK MANAGER.IO — AI DATA CHAT (Admin tab)
// ======================================================
// Filters are set via dropdowns BEFORE asking a question (smart pre-filter
// approach) and stay "sticky" across follow-up questions in the same
// session, so the user can ask several things about the same slice of data
// without re-picking filters each time. chatHistory is capped at the last
// 10 turns and sent to the backend so follow-ups like "and last month?"
// have context.
let chatHistory = [];

function getChatFilters() {
  return {
    dateFrom: document.getElementById('chatDateFrom').value || '',
    dateTo: document.getElementById('chatDateTo').value || '',
    category: document.getElementById('chatCategory').value || '',
    project: getSearchDropdownValue('chatProjectSearch', 'chatProject'),
    supplier: getSearchDropdownValue('chatSupplierSearch', 'chatSupplier'),
    customer: getSearchDropdownValue('chatCustomerSearch', 'chatCustomer'),
    car: getSearchDropdownValue('chatCarSearch', 'chatCar')
  };
}

function clearChatFilters() {
  document.getElementById('chatDateFrom').value = '';
  document.getElementById('chatDateTo').value = '';
  document.getElementById('chatCategory').value = '';
  resetSearchDropdown('chatProjectSearch', 'chatProject');
  resetSearchDropdown('chatSupplierSearch', 'chatSupplier');
  resetSearchDropdown('chatCustomerSearch', 'chatCustomer');
  resetSearchDropdown('chatCarSearch', 'chatCar');
}

function appendChatBubble(role, text) {
  const thread = document.getElementById('chatThread');
  if (!thread) return null;
  const bubble = document.createElement('div');
  const isUser = role === 'user';
  bubble.style.maxWidth = '85%';
  bubble.style.padding = '10px 14px';
  bubble.style.borderRadius = '14px';
  bubble.style.whiteSpace = 'pre-wrap';
  bubble.style.lineHeight = '1.4';
  bubble.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
  bubble.style.background = isUser ? 'rgba(0,113,227,0.12)' : 'rgba(118,118,128,0.12)';
  bubble.style.color = '#1d1d1f';
  bubble.textContent = text;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
  return bubble;
}

async function askManagerChat() {
  const input = document.getElementById('chatQuestionInput');
  const question = input.value.trim();
  if (!question) return;

  appendChatBubble('user', question);
  input.value = '';
  input.disabled = true;
  const thinkingBubble = appendChatBubble('assistant', '🤔 Thinking...');

  const filters = getChatFilters();

  try {
    const result = await callAPI('chatWithData', { method: 'POST', body: { question, filters, history: chatHistory } });
    if (result.success) {
      thinkingBubble.textContent = result.answer;
      chatHistory.push({ role: 'user', text: question });
      chatHistory.push({ role: 'assistant', text: result.answer });
      if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
    } else {
      thinkingBubble.textContent = '❌ ' + result.error;
    }
  } catch (err) {
    thinkingBubble.textContent = '❌ Error: ' + err.message;
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// ======================================================
// INIT
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
  loadDropdowns();

  const today = new Date().toISOString().split('T')[0];
  // The Ask Manager.io chat filters (chatDateFrom/chatDateTo) are meant to
  // start EMPTY - they're optional filters, not data-entry fields, and
  // pre-filling them to today would silently scope every fresh question to
  // "today only" until the user noticed and cleared them.
  document.querySelectorAll('input[type="date"]').forEach(el => {
    if (!el.value && el.id !== 'chatDateFrom' && el.id !== 'chatDateTo') el.value = today;
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
  document.getElementById('serialForm').addEventListener('submit', submitSerialForm);
  document.getElementById('petrolForm').addEventListener('submit', submitPetrol);
  document.getElementById('pettyForm').addEventListener('submit', submitPettyCash);
  document.getElementById('addForm').addEventListener('submit', handleAddFormSubmit);

  // Photo input events
  document.getElementById('dailyPhotoInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'dailyPhotos', 'dailyPhotoPreview');
  });
  document.getElementById('petrolReceiptInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'petrolReceipt', 'petrolReceiptPreview', 'petrol', 'petrolExtractStatus');
  });
  document.getElementById('pettyReceiptInput').addEventListener('change', function() {
    handlePhotoUpload(this, 'pettyReceipt', 'pettyReceiptPreview', 'pettyCash', 'pettyExtractStatus');
  });

  // Serial tab: transaction type toggle (Goods Received <-> Delivery Note)
  document.getElementById('serialTransactionType').addEventListener('change', handleSerialTransactionTypeChange);
  handleSerialTransactionTypeChange(); // sync required-ness on initial load

  // Serial tab: seed one empty item block so there's always at least one
  // to fill in.
  addSerialItemBlock();

  // Serial tab: Lookup Serial camera/gallery scan button
  document.getElementById('lookupScanInput').addEventListener('change', function() {
    handleLookupScan(this);
  });

  // Auto-calc
  document.getElementById('petrolLiters').addEventListener('input', calcPetrolTotal);
  document.getElementById('petrolCostPerLitre').addEventListener('input', calcPetrolTotal);
  document.getElementById('petrolAmount').addEventListener('input', calcPetrolLitersFromAmount);
  document.getElementById('pettyAmountExVAT').addEventListener('input', calcPettyTotal);
  document.getElementById('pettyVAT').addEventListener('input', calcPettyTotal);

  // Customer -> Project filtering: once a customer is picked on the Daily
  // Reports or Serial Entries tab, narrow the Project dropdown down to just
  // that customer's projects (see filterProjectDropdownByCustomerCode).
  document.getElementById('dailyCustomerSearch').addEventListener('change', function() {
    const code = getSearchDropdownValue('dailyCustomerSearch', 'dailyCustomer');
    filterProjectDropdownByCustomerCode(code, 'dailyProjectSearch', 'dailyProjectList', 'dailyProject');
  });
  document.getElementById('serialCustomerSearch').addEventListener('change', function() {
    const code = getSearchDropdownValue('serialCustomerSearch', 'serialCustomer');
    filterProjectDropdownByCustomerCode(code, 'serialProjectSearch', 'serialProjectList', 'serialProject');
  });
  document.getElementById('tasksCustomerSearch').addEventListener('change', function() {
    const code = getSearchDropdownValue('tasksCustomerSearch', 'tasksCustomer');
    filterProjectDropdownByCustomerCode(code, 'tasksProjectSearch', 'tasksProjectList', 'tasksProject');
  });

  // Project Tasks tab: once a project is picked (directly, or via the
  // dropdown-list click - see populateSearchDropdown's item click handler,
  // which also fires 'change' on the search input), load and render its
  // scope-of-work tree.
  document.getElementById('tasksProjectSearch').addEventListener('change', function() {
    const project = getSearchDropdownValue('tasksProjectSearch', 'tasksProject');
    if (project) loadProjectTasks(project);
  });

  // Petty Cash: picking a supplier auto-fills its VAT number (if on file)
  // into the VAT field below - still freely editable afterwards, e.g. for
  // suppliers without a VAT number yet or a one-off correction.
  document.getElementById('pettySupplierSearch').addEventListener('change', function() {
    const value = getSearchDropdownValue('pettySupplierSearch', 'pettySupplier');
    document.getElementById('pettySupplierVAT').value = findSupplierVAT(value);
  });

  // Petty Cash: only show the Car / Odometer fields when "Car Maintenance"
  // is selected - every other category has no car to attach the expense to.
  document.getElementById('pettyCategory').addEventListener('change', function() {
    const isCarMaintenance = this.value === 'Car Maintenance';
    document.getElementById('pettyCarGroup').style.display = isCarMaintenance ? 'block' : 'none';
    document.getElementById('pettyOdometerGroup').style.display = isCarMaintenance ? 'block' : 'none';
    if (!isCarMaintenance) {
      resetSearchDropdown('pettyCarSearch', 'pettyCar');
      document.getElementById('pettyOdometer').value = '';
    }
  });
});
