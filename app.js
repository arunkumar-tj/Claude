/* === Traceability System Application === */

(function () {
    'use strict';

    var STORAGE_KEY = 'traceability_records';
    var ADMIN_PW_KEY = 'traceability_admin_pw';
    var PRODUCTS_KEY = 'traceability_products';
    var DEFAULT_ADMIN_PW = 'admin123';

    var DEFAULT_PRODUCTS = [
        { id: 'neofly', name: 'Neofly', fields: [] },
        { id: 'neobolt', name: 'Neobolt', fields: [
            { key: 'batteryNo', label: 'Battery Serial No' },
            { key: 'chargerNo', label: 'Battery Charger Serial No' },
            { key: 'motorNo', label: 'Motor Serial No' }
        ]}
    ];

    // ===========================
    // Data Layer
    // ===========================
    function getRecords() {
        try { var d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : []; }
        catch (e) { return []; }
    }
    function saveRecords(records) { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }

    function addRecord(record) {
        var records = getRecords();
        record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        record.createdAt = new Date().toISOString();
        records.push(record);
        saveRecords(records);
        return record;
    }

    function updateRecord(id, updates) {
        var records = getRecords();
        for (var i = 0; i < records.length; i++) {
            if (records[i].id === id) {
                for (var key in updates) {
                    if (updates.hasOwnProperty(key)) records[i][key] = updates[key];
                }
                records[i].updatedAt = new Date().toISOString();
                saveRecords(records);
                return records[i];
            }
        }
        return null;
    }

    function deleteRecord(id) {
        var records = getRecords();
        saveRecords(records.filter(function (r) { return r.id !== id; }));
    }

    function getAdminPassword() { return localStorage.getItem(ADMIN_PW_KEY) || DEFAULT_ADMIN_PW; }
    function setAdminPassword(pw) { localStorage.setItem(ADMIN_PW_KEY, pw); }

    // ===========================
    // Products Data Layer
    // ===========================
    function migrateProduct(p) {
        if (p.fields && p.fields.length > 0 && typeof p.fields[0] === 'string') {
            var L = { batteryNo: 'Battery Serial No', chargerNo: 'Battery Charger Serial No', motorNo: 'Motor Serial No' };
            p.fields = p.fields.map(function (f) { return { key: f, label: L[f] || f }; });
        }
        return p;
    }

    function getProducts() {
        try {
            var d = localStorage.getItem(PRODUCTS_KEY);
            if (d) {
                var products = JSON.parse(d).map(migrateProduct);
                saveProducts(products);
                return products;
            }
        } catch (e) {}
        saveProducts(DEFAULT_PRODUCTS);
        return DEFAULT_PRODUCTS.slice();
    }

    function saveProducts(products) { localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)); }

    function addProductToStore(product) {
        var products = getProducts();
        product.id = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        var base = product.id, c = 1;
        while (products.some(function (p) { return p.id === product.id; })) { product.id = base + '_' + c++; }
        products.push(product);
        saveProducts(products);
        return product;
    }

    function updateProduct(pid, updates) {
        var products = getProducts();
        for (var i = 0; i < products.length; i++) {
            if (products[i].id === pid) {
                for (var k in updates) { if (updates.hasOwnProperty(k)) products[i][k] = updates[k]; }
                saveProducts(products);
                return products[i];
            }
        }
        return null;
    }

    function deleteProduct(pid) {
        saveProducts(getProducts().filter(function (p) { return p.id !== pid; }));
    }

    function getProductById(pid) {
        var products = getProducts();
        for (var i = 0; i < products.length; i++) { if (products[i].id === pid) return products[i]; }
        return null;
    }

    // ===========================
    // Utility
    // ===========================
    function formatDate(isoStr) {
        if (!isoStr) return '-';
        return new Date(isoStr).toLocaleString();
    }
    function dateOnly(isoStr) { return isoStr ? isoStr.slice(0, 10) : ''; }

    function getUniqueInspectors() {
        var set = {};
        getRecords().forEach(function (r) { if (r.inspector) set[r.inspector] = true; });
        return Object.keys(set).sort();
    }

    function escapeCSV(val) {
        val = String(val || '');
        if (/[,"\n]/.test(val)) return '"' + val.replace(/"/g, '""') + '"';
        return val;
    }

    function esc(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function buildDynamicHeaders() {
        var all = [], seen = {};
        getProducts().forEach(function (p) {
            (p.fields || []).forEach(function (f) {
                if (!seen[f.key]) { seen[f.key] = true; all.push(f); }
            });
        });
        return all;
    }

    // ===========================
    // QR Code
    // ===========================
    function generateQR(text, size, callback) {
        var s = size || 80;
        if (typeof QRCode !== 'undefined') {
            QRCode.toDataURL(String(text), { width: s, margin: 1, errorCorrectionLevel: 'M' }, function (err, url) {
                if (err || !url) {
                    var canvas = document.createElement('canvas');
                    canvas.width = s; canvas.height = s;
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, s, s);
                    ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('QR Error', s / 2, s / 2 + 3);
                    if (callback) callback(canvas);
                    return;
                }
                var img = document.createElement('img');
                img.width = s; img.height = s;
                img.src = url;
                if (callback) callback(img);
            });
        } else {
            var canvas = document.createElement('canvas');
            canvas.width = s; canvas.height = s;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('QR N/A', s / 2, s / 2 + 3);
            if (callback) callback(canvas);
        }
    }

    // QR Modal
    var qrModal = document.getElementById('qrModal');
    var qrModalBody = document.getElementById('qrModalBody');
    document.getElementById('qrModalClose').addEventListener('click', function () { qrModal.classList.add('hidden'); });
    qrModal.addEventListener('click', function (e) { if (e.target === qrModal) qrModal.classList.add('hidden'); });

    function showQRModal(record) {
        var product = getProductById(record.type);
        var typeName = product ? product.name : record.type;
        var html = '';
        html += '<div class="qr-detail-row"><span class="qr-detail-label">Product</span><span class="qr-detail-value">' + esc(typeName) + '</span></div>';
        html += '<div class="qr-detail-row"><span class="qr-detail-label">Order No</span><span class="qr-detail-value">' + esc(record.orderNo) + '</span></div>';
        html += '<div class="qr-detail-row"><span class="qr-detail-label">Frame/Chassis No</span><span class="qr-detail-value">' + esc(record.frameNo) + '</span></div>';
        if (product && product.fields) {
            product.fields.forEach(function (f) {
                html += '<div class="qr-detail-row"><span class="qr-detail-label">' + esc(f.label) + '</span><span class="qr-detail-value">' + esc(record[f.key] || '-') + '</span></div>';
            });
        }
        html += '<div class="qr-detail-row"><span class="qr-detail-label">Inspector</span><span class="qr-detail-value">' + esc(record.inspector) + '</span></div>';
        html += '<div class="qr-detail-row"><span class="qr-detail-label">Timestamp</span><span class="qr-detail-value">' + formatDate(record.timestamp) + '</span></div>';
        qrModalBody.innerHTML = html;
        qrModal.classList.remove('hidden');
    }

    // ===========================
    // Navigation
    // ===========================
    var navLinks = document.querySelectorAll('.nav-link');
    var pages = document.querySelectorAll('.page');
    var menuToggle = document.getElementById('menuToggle');
    var mainNav = document.getElementById('mainNav');

    function showPage(pageId) {
        pages.forEach(function (p) { p.classList.remove('active'); });
        navLinks.forEach(function (l) { l.classList.remove('active'); });
        var target = document.getElementById('page-' + pageId);
        if (target) target.classList.add('active');
        navLinks.forEach(function (l) { if (l.getAttribute('data-page') === pageId) l.classList.add('active'); });
        if (mainNav) mainNav.classList.remove('open');

        if (pageId === 'entry') populateEntryProductDropdown();
        if (pageId === 'products') renderProductsList();
        if (pageId === 'records') renderRecords();
        if (pageId === 'reports') renderReport(getRecords());
        if (pageId === 'dashboard') { populateInspectorDropdowns(); refreshDashboard(); }
    }

    navLinks.forEach(function (link) {
        link.addEventListener('click', function (e) { e.preventDefault(); showPage(this.getAttribute('data-page')); });
    });
    if (menuToggle) { menuToggle.addEventListener('click', function () { mainNav.classList.toggle('open'); }); }

    function setDefaultTimestamp(inputId) {
        var input = document.getElementById(inputId);
        if (input) {
            var now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            input.value = now.toISOString().slice(0, 16);
        }
    }

    // ===========================
    // Products Page
    // ===========================
    var pendingFields = [];

    function fieldKeyFromLabel(label) {
        return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function getAllKnownFields() {
        var all = [], seen = {};
        getProducts().forEach(function (p) {
            (p.fields || []).forEach(function (f) {
                if (!seen[f.key]) { seen[f.key] = true; all.push({ key: f.key, label: f.label }); }
            });
        });
        return all;
    }

    function renderPendingFields() {
        var container = document.getElementById('customFieldsList');
        container.innerHTML = '';

        var editId = document.getElementById('edit-product-id').value;
        if (!editId) {
            var knownFields = getAllKnownFields();
            if (knownFields.length > 0) {
                var cbGroup = document.createElement('div');
                cbGroup.className = 'checkbox-group existing-fields-checkboxes';
                var heading = document.createElement('div');
                heading.style.fontSize = '0.8125rem';
                heading.style.color = '#444';
                heading.style.marginBottom = '0.25rem';
                heading.textContent = 'Select from existing fields:';
                cbGroup.appendChild(heading);

                knownFields.forEach(function (f) {
                    var isChecked = pendingFields.some(function (pf) { return pf.key === f.key; });
                    var lbl = document.createElement('label');
                    lbl.className = 'checkbox-label';
                    var cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = isChecked;
                    cb.setAttribute('data-key', f.key);
                    cb.setAttribute('data-label', f.label);
                    cb.addEventListener('change', function () {
                        var key = this.getAttribute('data-key');
                        var label = this.getAttribute('data-label');
                        if (this.checked) {
                            if (!pendingFields.some(function (pf) { return pf.key === key; })) {
                                pendingFields.push({ key: key, label: label });
                            }
                        } else {
                            pendingFields = pendingFields.filter(function (pf) { return pf.key !== key; });
                        }
                        renderCustomFieldItems();
                    });
                    lbl.appendChild(cb);
                    lbl.appendChild(document.createTextNode(f.label));
                    cbGroup.appendChild(lbl);
                });
                container.appendChild(cbGroup);
            }
        }

        var itemsContainer = document.createElement('div');
        itemsContainer.id = 'customFieldItems';
        container.appendChild(itemsContainer);
        renderCustomFieldItems();
    }

    function renderCustomFieldItems() {
        var container = document.getElementById('customFieldItems');
        if (!container) return;
        container.innerHTML = '';
        pendingFields.forEach(function (f, idx) {
            var item = document.createElement('div');
            item.className = 'custom-field-item';
            item.innerHTML = '<span>' + esc(f.label) + '</span><button type="button" class="remove-field-btn" data-idx="' + idx + '">&times;</button>';
            container.appendChild(item);
        });
        container.querySelectorAll('.remove-field-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(this.getAttribute('data-idx'));
                var removed = pendingFields.splice(idx, 1)[0];
                var checkboxes = document.querySelectorAll('.existing-fields-checkboxes input[type="checkbox"]');
                checkboxes.forEach(function (cb) {
                    if (cb.getAttribute('data-key') === removed.key) cb.checked = false;
                });
                renderCustomFieldItems();
            });
        });
    }

    document.getElementById('addFieldBtn').addEventListener('click', function () {
        var input = document.getElementById('new-field-name');
        var label = input.value.trim();
        if (!label) return;
        var key = fieldKeyFromLabel(label);
        if (!key) return;
        if (pendingFields.some(function (f) { return f.key === key; })) { alert('Field already added.'); return; }
        pendingFields.push({ key: key, label: label });
        input.value = '';
        renderPendingFields();
    });

    function resetProductForm() {
        document.getElementById('edit-product-id').value = '';
        document.getElementById('new-product-name').value = '';
        document.getElementById('new-field-name').value = '';
        document.getElementById('productFormTitle').textContent = 'Add New Product';
        document.getElementById('productSubmitBtn').textContent = 'Add Product';
        document.getElementById('cancelProductEdit').classList.add('hidden');
        pendingFields = [];
        renderPendingFields();
    }

    function renderProductsList() {
        var products = getProducts();
        var container = document.getElementById('productsList');
        container.innerHTML = '';
        if (products.length === 0) { container.innerHTML = '<p>No products configured.</p>'; return; }

        products.forEach(function (p) {
            var card = document.createElement('div');
            card.className = 'product-card';
            var fieldNames = p.fields.length > 0 ? p.fields.map(function (f) { return f.label; }).join(', ') : 'No extra fields';
            card.innerHTML =
                '<div class="product-info"><strong>' + esc(p.name) + '</strong>' +
                '<span class="product-fields">Fields: Order No, Frame/Chassis No' + (p.fields.length > 0 ? ', ' + esc(fieldNames) : '') + '</span></div>' +
                '<div class="admin-record-actions">' +
                '<button class="btn btn-secondary btn-sm product-modify-btn" data-pid="' + esc(p.id) + '">Modify</button>' +
                '<button class="btn btn-danger btn-sm product-delete-btn" data-pid="' + esc(p.id) + '">Delete</button></div>';
            container.appendChild(card);
        });

        container.querySelectorAll('.product-delete-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = getProductById(this.getAttribute('data-pid'));
                if (!p || !confirm('Delete product "' + p.name + '"?')) return;
                deleteProduct(p.id);
                renderProductsList();
                populateEntryProductDropdown();
            });
        });

        container.querySelectorAll('.product-modify-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = getProductById(this.getAttribute('data-pid'));
                if (!p) return;
                document.getElementById('edit-product-id').value = p.id;
                document.getElementById('new-product-name').value = p.name;
                document.getElementById('productFormTitle').textContent = 'Modify Product';
                document.getElementById('productSubmitBtn').textContent = 'Save Changes';
                document.getElementById('cancelProductEdit').classList.remove('hidden');
                pendingFields = p.fields.map(function (f) { return { key: f.key, label: f.label }; });
                renderPendingFields();
                document.getElementById('addProductForm').scrollIntoView({ behavior: 'smooth' });
            });
        });
    }

    document.getElementById('cancelProductEdit').addEventListener('click', resetProductForm);

    document.getElementById('addProductForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('new-product-name').value.trim();
        if (!name) return;
        var editId = document.getElementById('edit-product-id').value;
        var conf = document.getElementById('product-confirmation');

        if (editId) {
            updateProduct(editId, { name: name, fields: pendingFields.slice() });
            conf.textContent = 'Product "' + name + '" updated successfully.';
        } else {
            addProductToStore({ name: name, fields: pendingFields.slice() });
            conf.textContent = 'Product "' + name + '" added successfully.';
        }
        conf.className = 'confirmation confirmation-success';
        resetProductForm();
        renderProductsList();
        populateEntryProductDropdown();
        setTimeout(function () { conf.className = 'confirmation hidden'; }, 4000);
    });

    // ===========================
    // Entry Form
    // ===========================
    function populateEntryProductDropdown() {
        var products = getProducts();
        var select = document.getElementById('entry-product');
        var cur = select.value;
        select.innerHTML = '<option value="">Select product</option>';
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.name;
            select.appendChild(opt);
        });
        select.value = cur;
        updateEntryFields();
    }

    function updateEntryFields() {
        var pid = document.getElementById('entry-product').value;
        var product = pid ? getProductById(pid) : null;
        var container = document.getElementById('entryDynamicFields');
        container.innerHTML = '';
        if (!product || !product.fields) return;
        product.fields.forEach(function (f) {
            var div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = '<label for="entry-' + esc(f.key) + '">' + esc(f.label) + '</label>' +
                '<input type="text" id="entry-' + esc(f.key) + '" required placeholder="Scan or enter ' + esc(f.label.toLowerCase()) + '">';
            container.appendChild(div);
        });
    }

    document.getElementById('entry-product').addEventListener('change', updateEntryFields);

    function showEntryMessage(text, type) {
        var conf = document.getElementById('entry-confirmation');
        conf.textContent = text;
        conf.className = 'confirmation ' + (type === 'success' ? 'confirmation-success' : 'confirmation-error');
        setTimeout(function () { conf.className = 'confirmation hidden'; }, 5000);
    }

    function checkDuplicate(record, product) {
        var records = getRecords();
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.orderNo === record.orderNo && r.frameNo === record.frameNo && r.type === record.type)
                return 'Duplicate: Order ' + record.orderNo + ' with Frame ' + record.frameNo + ' already exists.';
            if (record.frameNo && r.frameNo === record.frameNo && r.type === record.type)
                return 'Duplicate Frame/Chassis No: ' + record.frameNo + ' already exists in Order ' + r.orderNo + '.';
            if (product && product.fields) {
                for (var j = 0; j < product.fields.length; j++) {
                    var fk = product.fields[j].key;
                    if (record[fk] && r[fk] && record[fk] === r[fk])
                        return 'Duplicate ' + product.fields[j].label + ': ' + record[fk] + ' already exists in Order ' + r.orderNo + '.';
                }
            }
        }
        return null;
    }

    document.getElementById('entryForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var pid = document.getElementById('entry-product').value;
        var product = getProductById(pid);
        if (!product) { alert('Please select a product.'); return; }

        var record = {
            type: product.id,
            orderNo: document.getElementById('entry-orderNo').value.trim(),
            frameNo: document.getElementById('entry-frameNo').value.trim(),
            inspector: document.getElementById('entry-inspector').value.trim(),
            timestamp: document.getElementById('entry-timestamp').value
        };
        if (product.fields) {
            product.fields.forEach(function (f) {
                var inp = document.getElementById('entry-' + f.key);
                record[f.key] = inp ? inp.value.trim() : '';
            });
        }

        var dup = checkDuplicate(record, product);
        if (dup) { showEntryMessage(dup, 'error'); return; }

        addRecord(record);
        showEntryMessage(product.name + ' entry saved successfully for Order: ' + record.orderNo, 'success');
        this.reset();
        setDefaultTimestamp('entry-timestamp');
        populateEntryProductDropdown();
    });

    // ===========================
    // Records Page
    // ===========================
    var recordsTypeFilter = document.getElementById('records-type-filter');
    var recordsSearch = document.getElementById('records-search');

    function populateRecordsTypeFilter() {
        var products = getProducts();
        var cur = recordsTypeFilter.value;
        recordsTypeFilter.innerHTML = '<option value="all">All Types</option>';
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.name + ' Only';
            recordsTypeFilter.appendChild(opt);
        });
        recordsTypeFilter.value = cur;
    }

    function renderRecords() {
        populateRecordsTypeFilter();
        var records = getRecords();
        var filterType = recordsTypeFilter.value;
        var search = recordsSearch.value.trim().toLowerCase();
        var dynFields = buildDynamicHeaders();

        var filtered = records.filter(function (r) {
            if (filterType !== 'all' && r.type !== filterType) return false;
            if (search) {
                var parts = [r.orderNo, r.frameNo, r.inspector];
                dynFields.forEach(function (f) { parts.push(r[f.key] || ''); });
                if (parts.join(' ').toLowerCase().indexOf(search) === -1) return false;
            }
            return true;
        });

        var thead = document.querySelector('#recordsTable thead tr');
        thead.innerHTML = '<th>Type</th><th>Order No</th><th>Frame/Chassis No</th>';
        dynFields.forEach(function (f) { thead.innerHTML += '<th>' + esc(f.label) + '</th>'; });
        thead.innerHTML += '<th>Inspector</th><th>Timestamp</th><th>QR Code</th>';

        var tbody = document.getElementById('recordsBody');
        var noMsg = document.getElementById('noRecordsMsg');
        tbody.innerHTML = '';

        if (filtered.length === 0) { noMsg.classList.remove('hidden'); return; }
        noMsg.classList.add('hidden');

        filtered.forEach(function (r) {
            var product = getProductById(r.type);
            var typeName = product ? product.name : r.type;
            var tr = document.createElement('tr');
            var html = '<td>' + esc(typeName) + '</td><td>' + esc(r.orderNo) + '</td><td>' + esc(r.frameNo) + '</td>';
            dynFields.forEach(function (f) { html += '<td>' + esc(r[f.key] || '-') + '</td>'; });
            html += '<td>' + esc(r.inspector) + '</td><td>' + formatDate(r.timestamp) + '</td><td class="qr-cell"></td>';
            tr.innerHTML = html;

            var qrCell = tr.querySelector('.qr-cell');
            (function (rec, cell) {
                generateQR(rec.orderNo, 64, function (el) {
                    el.style.cursor = 'pointer';
                    el.title = 'Click to view full details';
                    el.addEventListener('click', function () { showQRModal(rec); });
                    cell.appendChild(el);
                });
            })(r, qrCell);
            tbody.appendChild(tr);
        });
    }

    recordsTypeFilter.addEventListener('change', renderRecords);
    recordsSearch.addEventListener('input', renderRecords);

    // ===========================
    // Reports Page
    // ===========================
    function populateInspectorDropdowns() {
        var inspectors = getUniqueInspectors();
        var sel = document.getElementById('dash-inspector');
        if (!sel) return;
        var cur = sel.value;
        sel.innerHTML = '<option value="">All Inspectors</option>';
        inspectors.forEach(function (n) {
            var opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            sel.appendChild(opt);
        });
        sel.value = cur;
    }

    var currentReportData = [];

    function renderReport(records) {
        var dynFields = buildDynamicHeaders();
        var thead = document.querySelector('#reportTable thead tr');
        thead.innerHTML = '<th>Type</th><th>Order No</th><th>Frame/Chassis No</th>';
        dynFields.forEach(function (f) { thead.innerHTML += '<th>' + esc(f.label) + '</th>'; });
        thead.innerHTML += '<th>Inspector</th><th>Timestamp</th>';

        var tbody = document.getElementById('reportBody');
        var noMsg = document.getElementById('noReportMsg');
        tbody.innerHTML = '';

        if (records.length === 0) { noMsg.classList.remove('hidden'); return; }
        noMsg.classList.add('hidden');

        records.forEach(function (r) {
            var product = getProductById(r.type);
            var typeName = product ? product.name : r.type;
            var tr = document.createElement('tr');
            var html = '<td>' + esc(typeName) + '</td><td>' + esc(r.orderNo) + '</td><td>' + esc(r.frameNo) + '</td>';
            dynFields.forEach(function (f) { html += '<td>' + esc(r[f.key] || '-') + '</td>'; });
            html += '<td>' + esc(r.inspector) + '</td><td>' + formatDate(r.timestamp) + '</td>';
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
        currentReportData = records;
    }

    function applyReportFilters() {
        var search = document.getElementById('rpt-search').value.trim().toLowerCase();
        var dateFrom = document.getElementById('rpt-dateFrom').value;
        var dateTo = document.getElementById('rpt-dateTo').value;
        var records = getRecords();
        var dynFields = buildDynamicHeaders();

        var filtered = records.filter(function (r) {
            if (search) {
                var parts = [r.orderNo, r.frameNo, r.inspector];
                dynFields.forEach(function (f) { parts.push(r[f.key] || ''); });
                if (parts.join(' ').toLowerCase().indexOf(search) === -1) return false;
            }
            if (dateFrom || dateTo) {
                var d = dateOnly(r.timestamp);
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
            }
            return true;
        });
        renderReport(filtered);
    }

    document.getElementById('reportSearchBtn').addEventListener('click', applyReportFilters);
    document.getElementById('rpt-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') applyReportFilters(); });
    document.getElementById('rpt-dateFrom').addEventListener('change', applyReportFilters);
    document.getElementById('rpt-dateTo').addEventListener('change', applyReportFilters);

    document.getElementById('clearFilters').addEventListener('click', function () {
        document.getElementById('rpt-search').value = '';
        document.getElementById('rpt-dateFrom').value = '';
        document.getElementById('rpt-dateTo').value = '';
        renderReport(getRecords());
    });

    // CSV Download
    document.getElementById('downloadCSV').addEventListener('click', function () {
        var data = currentReportData.length > 0 ? currentReportData : getRecords();
        if (data.length === 0) { alert('No data to export.'); return; }
        var dynFields = buildDynamicHeaders();
        var headers = ['Type', 'Order No', 'Frame/Chassis No'];
        dynFields.forEach(function (f) { headers.push(f.label); });
        headers.push('Inspector', 'Timestamp');

        var rows = [headers.map(escapeCSV).join(',')];
        data.forEach(function (r) {
            var product = getProductById(r.type);
            var row = [escapeCSV(product ? product.name : r.type), escapeCSV(r.orderNo), escapeCSV(r.frameNo)];
            dynFields.forEach(function (f) { row.push(escapeCSV(r[f.key] || '')); });
            row.push(escapeCSV(r.inspector), escapeCSV(r.timestamp));
            rows.push(row.join(','));
        });

        var blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'traceability_report_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // ===========================
    // Dashboard with Charts
    // ===========================
    var pieChartInstance = null;
    var barChartInstance = null;
    var CHART_COLORS = ['#cc0000', '#1a7d2f', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d', '#ea580c', '#6366f1'];

    function refreshDashboard() {
        var records = getRecords();
        var products = getProducts();
        var inspFilter = document.getElementById('dash-inspector').value;
        var dateFrom = document.getElementById('dash-dateFrom').value;
        var dateTo = document.getElementById('dash-dateTo').value;

        var filtered = records.filter(function (r) {
            if (inspFilter && r.inspector !== inspFilter) return false;
            var d = dateOnly(r.timestamp);
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });

        // Summary cards
        var productCounts = {};
        products.forEach(function (p) { productCounts[p.id] = 0; });
        var uniqueInsp = {};
        filtered.forEach(function (r) {
            if (productCounts.hasOwnProperty(r.type)) productCounts[r.type]++;
            uniqueInsp[r.inspector] = true;
        });

        var cardsContainer = document.getElementById('dashboardCards');
        cardsContainer.innerHTML = '';
        var cards = [{ value: filtered.length, label: 'Total Inspections' }];
        products.forEach(function (p) { cards.push({ value: productCounts[p.id] || 0, label: p.name + ' Entries' }); });
        cards.push({ value: Object.keys(uniqueInsp).length, label: 'Active Inspectors' });
        cards.forEach(function (c) {
            var div = document.createElement('div');
            div.className = 'dash-card';
            div.innerHTML = '<div class="card-value">' + c.value + '</div><div class="card-label">' + c.label + '</div>';
            cardsContainer.appendChild(div);
        });

        // Pie Chart - Inspector Contribution
        var inspCounts = {};
        filtered.forEach(function (r) { inspCounts[r.inspector] = (inspCounts[r.inspector] || 0) + 1; });
        var pieLabels = Object.keys(inspCounts).sort();
        var pieData = pieLabels.map(function (l) { return inspCounts[l]; });

        if (pieChartInstance) pieChartInstance.destroy();
        var pieCtx = document.getElementById('pieChart').getContext('2d');
        if (pieLabels.length > 0) {
            pieChartInstance = new Chart(pieCtx, {
                type: 'pie',
                data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieLabels.map(function (_, i) { return CHART_COLORS[i % CHART_COLORS.length]; }) }] },
                options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } } } }
            });
        } else {
            pieChartInstance = new Chart(pieCtx, {
                type: 'pie',
                data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }] },
                options: { responsive: true, plugins: { legend: { display: false } } }
            });
        }

        // Bar Chart - Day-wise Production
        var dayCounts = {};
        filtered.forEach(function (r) { var d = dateOnly(r.timestamp); if (d) dayCounts[d] = (dayCounts[d] || 0) + 1; });
        var barLabels = Object.keys(dayCounts).sort();
        var barData = barLabels.map(function (d) { return dayCounts[d]; });

        if (barChartInstance) barChartInstance.destroy();
        var barCtx = document.getElementById('barChart').getContext('2d');
        barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: { labels: barLabels, datasets: [{ label: 'Inspections', data: barData, backgroundColor: '#2563eb', borderRadius: 4 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { maxRotation: 45 } } } }
        });

        // Daily breakdown table
        var dashHead = document.querySelector('#dashboardTable thead tr');
        dashHead.innerHTML = '<th>Inspector</th><th>Date</th>';
        products.forEach(function (p) { dashHead.innerHTML += '<th>' + esc(p.name) + ' Count</th>'; });
        dashHead.innerHTML += '<th>Total Inspected</th>';

        var breakdown = {};
        filtered.forEach(function (r) {
            var d = dateOnly(r.timestamp);
            var key = r.inspector + '|' + d;
            if (!breakdown[key]) {
                breakdown[key] = { inspector: r.inspector, date: d, counts: {}, total: 0 };
                products.forEach(function (p) { breakdown[key].counts[p.id] = 0; });
            }
            if (breakdown[key].counts.hasOwnProperty(r.type)) breakdown[key].counts[r.type]++;
            breakdown[key].total++;
        });

        var bRows = Object.keys(breakdown).map(function (k) { return breakdown[k]; });
        bRows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.inspector.localeCompare(b.inspector); });

        var tbody = document.getElementById('dashboardBody');
        tbody.innerHTML = '';
        bRows.forEach(function (row) {
            var tr = document.createElement('tr');
            var html = '<td>' + esc(row.inspector) + '</td><td>' + esc(row.date) + '</td>';
            products.forEach(function (p) { html += '<td>' + (row.counts[p.id] || 0) + '</td>'; });
            html += '<td>' + row.total + '</td>';
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('refreshDashboard').addEventListener('click', refreshDashboard);

    // ===========================
    // Admin Page
    // ===========================
    document.getElementById('adminLoginBtn').addEventListener('click', function () {
        var pw = document.getElementById('adminPassword').value;
        if (pw === getAdminPassword()) {
            document.getElementById('adminLoginSection').classList.add('hidden');
            document.getElementById('adminPanel').classList.remove('hidden');
            document.getElementById('adminError').classList.add('hidden');
            document.getElementById('adminPassword').value = '';
        } else {
            document.getElementById('adminError').classList.remove('hidden');
        }
    });

    document.getElementById('adminPassword').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('adminLoginBtn').click();
    });

    document.getElementById('adminLogout').addEventListener('click', function () {
        document.getElementById('adminPanel').classList.add('hidden');
        document.getElementById('adminLoginSection').classList.remove('hidden');
        document.getElementById('adminResults').innerHTML = '';
        document.getElementById('editFormContainer').classList.add('hidden');
        document.getElementById('changePasswordSection').classList.add('hidden');
    });

    document.getElementById('changePasswordBtn').addEventListener('click', function () {
        document.getElementById('changePasswordSection').classList.toggle('hidden');
    });

    document.getElementById('saveNewPassword').addEventListener('click', function () {
        var cur = document.getElementById('currentPassword').value;
        var newPw = document.getElementById('newPassword').value;
        var confirmPw = document.getElementById('confirmNewPassword').value;
        var msg = document.getElementById('passwordMsg');

        if (cur !== getAdminPassword()) { msg.textContent = 'Current password is incorrect.'; msg.className = 'error-text'; msg.classList.remove('hidden'); return; }
        if (!newPw || newPw.length < 4) { msg.textContent = 'New password must be at least 4 characters.'; msg.className = 'error-text'; msg.classList.remove('hidden'); return; }
        if (newPw !== confirmPw) { msg.textContent = 'Passwords do not match.'; msg.className = 'error-text'; msg.classList.remove('hidden'); return; }

        setAdminPassword(newPw);
        msg.textContent = 'Password changed successfully.';
        msg.className = 'success-text';
        msg.classList.remove('hidden');
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        setTimeout(function () { msg.classList.add('hidden'); }, 3000);
    });

    // Admin search
    document.getElementById('adminSearchBtn').addEventListener('click', adminSearch);
    document.getElementById('admin-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') adminSearch(); });

    function adminSearch() {
        var term = document.getElementById('admin-search').value.trim().toLowerCase();
        var records = getRecords();
        var container = document.getElementById('adminResults');
        container.innerHTML = '';
        document.getElementById('editFormContainer').classList.add('hidden');

        if (!term) { container.innerHTML = '<p>Enter a search term.</p>'; return; }

        var matches = records.filter(function (r) {
            return r.orderNo.toLowerCase().indexOf(term) !== -1 || r.frameNo.toLowerCase().indexOf(term) !== -1;
        });

        if (matches.length === 0) { container.innerHTML = '<p>No records found.</p>'; return; }

        matches.forEach(function (r) {
            var product = getProductById(r.type);
            var typeName = product ? product.name : r.type;
            var card = document.createElement('div');
            card.className = 'admin-record-card';

            var info = document.createElement('div');
            info.className = 'admin-record-info';
            info.innerHTML = '<strong>' + esc(typeName.toUpperCase()) + '</strong> | Order: ' + esc(r.orderNo) +
                ' | Frame: ' + esc(r.frameNo) + ' | Inspector: ' + esc(r.inspector) + ' | ' + formatDate(r.timestamp);

            var actions = document.createElement('div');
            actions.className = 'admin-record-actions';

            var editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary btn-sm';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', function () { loadEditForm(r); });

            var delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-sm';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', function () {
                if (!confirm('Delete record for Order: ' + r.orderNo + '? This cannot be undone.')) return;
                deleteRecord(r.id);
                adminSearch();
            });

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            card.appendChild(info);
            card.appendChild(actions);
            container.appendChild(card);
        });
    }

    function loadEditForm(record) {
        document.getElementById('editFormContainer').classList.remove('hidden');
        document.getElementById('edit-id').value = record.id;
        document.getElementById('edit-orderNo').value = record.orderNo;
        document.getElementById('edit-frameNo').value = record.frameNo;
        document.getElementById('edit-inspector').value = record.inspector;
        if (record.timestamp) document.getElementById('edit-timestamp').value = record.timestamp;

        var product = getProductById(record.type);
        var container = document.getElementById('editDynamicFields');
        container.innerHTML = '';
        if (product && product.fields) {
            product.fields.forEach(function (f) {
                var div = document.createElement('div');
                div.className = 'form-group';
                div.innerHTML = '<label for="edit-' + esc(f.key) + '">' + esc(f.label) + '</label>' +
                    '<input type="text" id="edit-' + esc(f.key) + '" value="' + esc(record[f.key] || '') + '">';
                container.appendChild(div);
            });
        }
        document.getElementById('editFormContainer').scrollIntoView({ behavior: 'smooth' });
    }

    document.getElementById('editRecordForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var id = document.getElementById('edit-id').value;
        var updates = {
            orderNo: document.getElementById('edit-orderNo').value.trim(),
            frameNo: document.getElementById('edit-frameNo').value.trim(),
            inspector: document.getElementById('edit-inspector').value.trim(),
            timestamp: document.getElementById('edit-timestamp').value
        };

        var record = getRecords().filter(function (r) { return r.id === id; })[0];
        if (record) {
            var product = getProductById(record.type);
            if (product && product.fields) {
                product.fields.forEach(function (f) {
                    var inp = document.getElementById('edit-' + f.key);
                    updates[f.key] = inp ? inp.value.trim() : '';
                });
            }
        }

        var result = updateRecord(id, updates);
        if (result) {
            alert('Record updated successfully.');
            document.getElementById('editFormContainer').classList.add('hidden');
            adminSearch();
        } else {
            alert('Error: Record not found.');
        }
    });

    document.getElementById('cancelEdit').addEventListener('click', function () {
        document.getElementById('editFormContainer').classList.add('hidden');
    });

    // ===========================
    // Init
    // ===========================
    setDefaultTimestamp('entry-timestamp');
    populateEntryProductDropdown();

})();
