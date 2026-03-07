/* === Traceability System Application === */

(function () {
    'use strict';

    // --- Storage Keys ---
    var STORAGE_KEY = 'traceability_records';
    var ADMIN_PW_KEY = 'traceability_admin_pw';
    var PRODUCTS_KEY = 'traceability_products';
    var DEFAULT_ADMIN_PW = 'admin123';

    var DEFAULT_PRODUCTS = [
        { id: 'neofly', name: 'Neofly', fields: [] },
        { id: 'neobolt', name: 'Neobolt', fields: ['batteryNo', 'chargerNo', 'motorNo'] }
    ];

    // --- Data Layer ---
    function getRecords() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function saveRecords(records) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

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
                    if (updates.hasOwnProperty(key)) {
                        records[i][key] = updates[key];
                    }
                }
                records[i].updatedAt = new Date().toISOString();
                saveRecords(records);
                return records[i];
            }
        }
        return null;
    }

    function getAdminPassword() {
        return localStorage.getItem(ADMIN_PW_KEY) || DEFAULT_ADMIN_PW;
    }

    function setAdminPassword(pw) {
        localStorage.setItem(ADMIN_PW_KEY, pw);
    }

    // --- Products Data Layer ---
    function getProducts() {
        try {
            var data = localStorage.getItem(PRODUCTS_KEY);
            if (data) return JSON.parse(data);
        } catch (e) { /* fall through */ }
        saveProducts(DEFAULT_PRODUCTS);
        return DEFAULT_PRODUCTS.slice();
    }

    function saveProducts(products) {
        localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
    }

    function addProduct(product) {
        var products = getProducts();
        product.id = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        // Avoid duplicate IDs
        var baseId = product.id;
        var counter = 1;
        while (products.some(function (p) { return p.id === product.id; })) {
            product.id = baseId + '_' + counter++;
        }
        products.push(product);
        saveProducts(products);
        return product;
    }

    function deleteProduct(productId) {
        var products = getProducts();
        products = products.filter(function (p) { return p.id !== productId; });
        saveProducts(products);
    }

    function getProductById(productId) {
        var products = getProducts();
        for (var i = 0; i < products.length; i++) {
            if (products[i].id === productId) return products[i];
        }
        return null;
    }

    // --- Utility ---
    function formatDate(isoStr) {
        if (!isoStr) return '-';
        var d = new Date(isoStr);
        return d.toLocaleString();
    }

    function dateOnly(isoStr) {
        if (!isoStr) return '';
        return isoStr.slice(0, 10);
    }

    function getUniqueInspectors() {
        var records = getRecords();
        var set = {};
        records.forEach(function (r) {
            if (r.inspector) set[r.inspector] = true;
        });
        return Object.keys(set).sort();
    }

    function escapeCSV(val) {
        val = String(val || '');
        if (val.indexOf(',') !== -1 || val.indexOf('"') !== -1 || val.indexOf('\n') !== -1) {
            return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
    }

    function esc(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- QR Code Generation ---
    function generateQRCodeCanvas(text, size) {
        var canvas = document.createElement('canvas');
        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, text, { width: size || 80, margin: 1 }, function (err) {
                if (err) canvas.title = 'QR Error';
            });
        } else {
            canvas.width = size || 80;
            canvas.height = size || 80;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#eee';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#999';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('QR N/A', canvas.width / 2, canvas.height / 2 + 3);
        }
        return canvas;
    }

    function buildQRText(record) {
        var parts = [
            'Type:' + record.type,
            'Order:' + record.orderNo,
            'Frame:' + record.frameNo
        ];
        if (record.batteryNo) parts.push('Battery:' + record.batteryNo);
        if (record.chargerNo) parts.push('Charger:' + record.chargerNo);
        if (record.motorNo) parts.push('Motor:' + record.motorNo);
        parts.push('Inspector:' + record.inspector);
        parts.push('Time:' + record.timestamp);
        return parts.join('|');
    }

    // --- Navigation ---
    var navLinks = document.querySelectorAll('.nav-link');
    var pages = document.querySelectorAll('.page');
    var menuToggle = document.getElementById('menuToggle');
    var mainNav = document.getElementById('mainNav');

    function showPage(pageId) {
        pages.forEach(function (p) { p.classList.remove('active'); });
        navLinks.forEach(function (l) { l.classList.remove('active'); });
        var target = document.getElementById('page-' + pageId);
        if (target) target.classList.add('active');
        navLinks.forEach(function (l) {
            if (l.getAttribute('data-page') === pageId) l.classList.add('active');
        });
        if (mainNav) mainNav.classList.remove('open');

        // Refresh data on page show
        if (pageId === 'entry') populateEntryProductDropdown();
        if (pageId === 'products') renderProductsList();
        if (pageId === 'records') renderRecords();
        if (pageId === 'reports') renderReport(getRecords());
        if (pageId === 'dashboard') { populateInspectorDropdowns(); refreshDashboard(); }
    }

    navLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            showPage(this.getAttribute('data-page'));
        });
    });

    if (menuToggle) {
        menuToggle.addEventListener('click', function () {
            mainNav.classList.toggle('open');
        });
    }

    // --- Set default timestamp ---
    function setDefaultTimestamp(inputId) {
        var input = document.getElementById(inputId);
        if (input) {
            var now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            input.value = now.toISOString().slice(0, 16);
        }
    }

    // --- Products Page ---
    var FIELD_LABELS = {
        batteryNo: 'Battery Serial No',
        chargerNo: 'Battery Charger Serial No',
        motorNo: 'Motor Serial No'
    };

    function renderProductsList() {
        var products = getProducts();
        var container = document.getElementById('productsList');
        container.innerHTML = '';

        if (products.length === 0) {
            container.innerHTML = '<p>No products configured.</p>';
            return;
        }

        products.forEach(function (p) {
            var card = document.createElement('div');
            card.className = 'product-card';
            var fields = p.fields.length > 0
                ? p.fields.map(function (f) { return FIELD_LABELS[f] || f; }).join(', ')
                : 'No extra fields';
            card.innerHTML =
                '<div class="product-info">' +
                    '<strong>' + esc(p.name) + '</strong>' +
                    '<span class="product-fields">Fields: Order No, Frame/Chassis No' + (p.fields.length > 0 ? ', ' + esc(fields) : '') + '</span>' +
                '</div>' +
                '<button class="btn btn-danger btn-sm product-delete-btn" data-product-id="' + esc(p.id) + '">Delete</button>';
            container.appendChild(card);
        });

        // Bind delete buttons
        container.querySelectorAll('.product-delete-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var pid = this.getAttribute('data-product-id');
                var product = getProductById(pid);
                if (!product) return;
                if (!confirm('Delete product "' + product.name + '"? Existing records of this type will remain but you won\'t be able to create new entries for it.')) return;
                deleteProduct(pid);
                renderProductsList();
                populateEntryProductDropdown();
            });
        });
    }

    var addProductForm = document.getElementById('addProductForm');
    addProductForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('new-product-name').value.trim();
        if (!name) return;

        var fields = [];
        ['batteryNo', 'chargerNo', 'motorNo'].forEach(function (f) {
            if (document.getElementById('field-' + f).checked) fields.push(f);
        });

        addProduct({ name: name, fields: fields });

        var conf = document.getElementById('product-confirmation');
        conf.textContent = 'Product "' + name + '" added successfully.';
        conf.className = 'confirmation confirmation-success';
        addProductForm.reset();
        renderProductsList();
        populateEntryProductDropdown();
        setTimeout(function () { conf.className = 'confirmation hidden'; }, 4000);
    });

    // --- Unified Entry Form ---
    function populateEntryProductDropdown() {
        var products = getProducts();
        var select = document.getElementById('entry-product');
        var currentVal = select.value;
        select.innerHTML = '<option value="">Select product</option>';
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });
        select.value = currentVal;
        updateEntryFieldVisibility();
    }

    function updateEntryFieldVisibility() {
        var productId = document.getElementById('entry-product').value;
        var product = productId ? getProductById(productId) : null;
        var extraFields = document.querySelectorAll('.entry-extra-field');

        extraFields.forEach(function (el) {
            var fieldName = el.getAttribute('data-field');
            var visible = product && product.fields.indexOf(fieldName) !== -1;
            el.style.display = visible ? 'block' : 'none';
            var input = el.querySelector('input');
            if (input) {
                if (visible) {
                    input.setAttribute('required', 'required');
                } else {
                    input.removeAttribute('required');
                    input.value = '';
                }
            }
        });
    }

    document.getElementById('entry-product').addEventListener('change', updateEntryFieldVisibility);

    function showEntryMessage(text, type) {
        var conf = document.getElementById('entry-confirmation');
        conf.textContent = text;
        conf.className = 'confirmation ' + (type === 'success' ? 'confirmation-success' : 'confirmation-error');
        setTimeout(function () { conf.className = 'confirmation hidden'; }, 5000);
    }

    function checkDuplicate(record) {
        var records = getRecords();
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.orderNo === record.orderNo && r.frameNo === record.frameNo && r.type === record.type) {
                return 'Duplicate entry: Order ' + record.orderNo + ' with Frame ' + record.frameNo + ' already exists.';
            }
            if (record.frameNo && r.frameNo === record.frameNo && r.type === record.type) {
                return 'Duplicate Frame/Chassis No: ' + record.frameNo + ' already exists in Order ' + r.orderNo + '.';
            }
            if (record.batteryNo && r.batteryNo === record.batteryNo) {
                return 'Duplicate Battery No: ' + record.batteryNo + ' already exists in Order ' + r.orderNo + '.';
            }
            if (record.chargerNo && r.chargerNo === record.chargerNo) {
                return 'Duplicate Charger No: ' + record.chargerNo + ' already exists in Order ' + r.orderNo + '.';
            }
            if (record.motorNo && r.motorNo === record.motorNo) {
                return 'Duplicate Motor No: ' + record.motorNo + ' already exists in Order ' + r.orderNo + '.';
            }
        }
        return null;
    }

    var entryForm = document.getElementById('entryForm');
    entryForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var productId = document.getElementById('entry-product').value;
        var product = getProductById(productId);
        if (!product) { alert('Please select a product.'); return; }

        var record = {
            type: product.id,
            orderNo: document.getElementById('entry-orderNo').value.trim(),
            frameNo: document.getElementById('entry-frameNo').value.trim(),
            batteryNo: product.fields.indexOf('batteryNo') !== -1 ? document.getElementById('entry-batteryNo').value.trim() : '',
            chargerNo: product.fields.indexOf('chargerNo') !== -1 ? document.getElementById('entry-chargerNo').value.trim() : '',
            motorNo: product.fields.indexOf('motorNo') !== -1 ? document.getElementById('entry-motorNo').value.trim() : '',
            inspector: document.getElementById('entry-inspector').value.trim(),
            timestamp: document.getElementById('entry-timestamp').value
        };

        var dupMsg = checkDuplicate(record);
        if (dupMsg) {
            showEntryMessage(dupMsg, 'error');
            return;
        }

        addRecord(record);
        showEntryMessage(product.name + ' entry saved successfully for Order: ' + record.orderNo, 'success');
        entryForm.reset();
        setDefaultTimestamp('entry-timestamp');
        populateEntryProductDropdown();
    });

    // --- Records Page ---
    var recordsTypeFilter = document.getElementById('records-type-filter');
    var recordsSearch = document.getElementById('records-search');

    function populateRecordsTypeFilter() {
        var products = getProducts();
        var currentVal = recordsTypeFilter.value;
        recordsTypeFilter.innerHTML = '<option value="all">All Types</option>';
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name + ' Only';
            recordsTypeFilter.appendChild(opt);
        });
        recordsTypeFilter.value = currentVal;
    }

    function renderRecords() {
        populateRecordsTypeFilter();
        var records = getRecords();
        var filterType = recordsTypeFilter.value;
        var searchTerm = recordsSearch.value.trim().toLowerCase();

        var filtered = records.filter(function (r) {
            if (filterType !== 'all' && r.type !== filterType) return false;
            if (searchTerm) {
                var haystack = [r.orderNo, r.frameNo, r.batteryNo, r.chargerNo, r.motorNo, r.inspector].join(' ').toLowerCase();
                if (haystack.indexOf(searchTerm) === -1) return false;
            }
            return true;
        });

        var tbody = document.getElementById('recordsBody');
        var noMsg = document.getElementById('noRecordsMsg');
        tbody.innerHTML = '';

        if (filtered.length === 0) {
            noMsg.classList.remove('hidden');
            return;
        }
        noMsg.classList.add('hidden');

        filtered.forEach(function (r) {
            var product = getProductById(r.type);
            var displayType = product ? product.name : r.type;
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + esc(displayType) + '</td>' +
                '<td>' + esc(r.orderNo) + '</td>' +
                '<td>' + esc(r.frameNo) + '</td>' +
                '<td>' + esc(r.batteryNo || '-') + '</td>' +
                '<td>' + esc(r.chargerNo || '-') + '</td>' +
                '<td>' + esc(r.motorNo || '-') + '</td>' +
                '<td>' + esc(r.inspector) + '</td>' +
                '<td>' + formatDate(r.timestamp) + '</td>' +
                '<td class="qr-cell"></td>';
            var qrCell = tr.querySelector('.qr-cell');
            var qrCanvas = generateQRCodeCanvas(buildQRText(r), 64);
            qrCell.appendChild(qrCanvas);
            tbody.appendChild(tr);
        });
    }

    recordsTypeFilter.addEventListener('change', renderRecords);
    recordsSearch.addEventListener('input', renderRecords);

    // --- Reports Page ---
    function populateInspectorDropdowns() {
        var inspectors = getUniqueInspectors();
        var dashSelect = document.getElementById('dash-inspector');

        if (dashSelect) {
            var currentVal = dashSelect.value;
            dashSelect.innerHTML = '<option value="">All Inspectors</option>';
            inspectors.forEach(function (name) {
                var opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                dashSelect.appendChild(opt);
            });
            dashSelect.value = currentVal;
        }
    }

    function renderReport(records) {
        var tbody = document.getElementById('reportBody');
        var noMsg = document.getElementById('noReportMsg');
        tbody.innerHTML = '';

        if (records.length === 0) {
            noMsg.classList.remove('hidden');
            return;
        }
        noMsg.classList.add('hidden');

        records.forEach(function (r) {
            var product = getProductById(r.type);
            var displayType = product ? product.name : r.type;
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + esc(displayType) + '</td>' +
                '<td>' + esc(r.orderNo) + '</td>' +
                '<td>' + esc(r.frameNo) + '</td>' +
                '<td>' + esc(r.batteryNo || '-') + '</td>' +
                '<td>' + esc(r.chargerNo || '-') + '</td>' +
                '<td>' + esc(r.motorNo || '-') + '</td>' +
                '<td>' + esc(r.inspector) + '</td>' +
                '<td>' + formatDate(r.timestamp) + '</td>';
            tbody.appendChild(tr);
        });

        // Store for CSV export
        currentReportData = records;
    }

    var currentReportData = [];

    function applyReportFilters() {
        var searchTerm = document.getElementById('rpt-search').value.trim().toLowerCase();
        var dateFrom = document.getElementById('rpt-dateFrom').value;
        var dateTo = document.getElementById('rpt-dateTo').value;
        var records = getRecords();

        var filtered = records.filter(function (r) {
            if (searchTerm) {
                var haystack = [r.orderNo, r.frameNo, r.batteryNo, r.chargerNo, r.motorNo, r.inspector].join(' ').toLowerCase();
                if (haystack.indexOf(searchTerm) === -1) return false;
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
    document.getElementById('rpt-search').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') applyReportFilters();
    });
    document.getElementById('rpt-dateFrom').addEventListener('change', applyReportFilters);
    document.getElementById('rpt-dateTo').addEventListener('change', applyReportFilters);

    document.getElementById('clearFilters').addEventListener('click', function () {
        document.getElementById('rpt-search').value = '';
        document.getElementById('rpt-dateFrom').value = '';
        document.getElementById('rpt-dateTo').value = '';
        renderReport(getRecords());
    });

    // --- CSV Download ---
    document.getElementById('downloadCSV').addEventListener('click', function () {
        var data = currentReportData.length > 0 ? currentReportData : getRecords();
        if (data.length === 0) { alert('No data to export.'); return; }

        var headers = ['Type', 'Order No', 'Frame/Chassis No', 'Battery No', 'Charger No', 'Motor No', 'Inspector', 'Timestamp'];
        var rows = [headers.map(escapeCSV).join(',')];

        data.forEach(function (r) {
            var product = getProductById(r.type);
            var displayType = product ? product.name : r.type;
            rows.push([
                escapeCSV(displayType),
                escapeCSV(r.orderNo),
                escapeCSV(r.frameNo),
                escapeCSV(r.batteryNo),
                escapeCSV(r.chargerNo),
                escapeCSV(r.motorNo),
                escapeCSV(r.inspector),
                escapeCSV(r.timestamp)
            ].join(','));
        });

        var csvContent = rows.join('\n');
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'traceability_report_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // --- Dashboard ---
    function refreshDashboard() {
        var records = getRecords();
        var products = getProducts();
        var inspectorFilter = document.getElementById('dash-inspector').value;
        var dateFrom = document.getElementById('dash-dateFrom').value;
        var dateTo = document.getElementById('dash-dateTo').value;

        var filtered = records.filter(function (r) {
            if (inspectorFilter && r.inspector !== inspectorFilter) return false;
            var d = dateOnly(r.timestamp);
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });

        // Summary cards - dynamically based on products
        var totalRecords = filtered.length;
        var productCounts = {};
        products.forEach(function (p) { productCounts[p.id] = 0; });
        filtered.forEach(function (r) {
            if (productCounts.hasOwnProperty(r.type)) productCounts[r.type]++;
            else productCounts[r.type] = (productCounts[r.type] || 0) + 1;
        });
        var uniqueInspectors = {};
        filtered.forEach(function (r) { uniqueInspectors[r.inspector] = true; });
        var inspectorCount = Object.keys(uniqueInspectors).length;

        var cardsContainer = document.getElementById('dashboardCards');
        cardsContainer.innerHTML = '';

        var cards = [{ value: totalRecords, label: 'Total Inspections' }];
        products.forEach(function (p) {
            cards.push({ value: productCounts[p.id] || 0, label: p.name + ' Entries' });
        });
        cards.push({ value: inspectorCount, label: 'Active Inspectors' });

        cards.forEach(function (c) {
            var div = document.createElement('div');
            div.className = 'dash-card';
            div.innerHTML = '<div class="card-value">' + c.value + '</div><div class="card-label">' + c.label + '</div>';
            cardsContainer.appendChild(div);
        });

        // Daily breakdown table - dynamic columns
        var dashTableHead = document.querySelector('#dashboardTable thead tr');
        dashTableHead.innerHTML = '<th>Inspector</th><th>Date</th>';
        products.forEach(function (p) {
            dashTableHead.innerHTML += '<th>' + esc(p.name) + ' Count</th>';
        });
        dashTableHead.innerHTML += '<th>Total Inspected</th>';

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

        var rows = Object.keys(breakdown).map(function (k) { return breakdown[k]; });
        rows.sort(function (a, b) {
            if (a.date < b.date) return 1;
            if (a.date > b.date) return -1;
            return a.inspector.localeCompare(b.inspector);
        });

        var tbody = document.getElementById('dashboardBody');
        tbody.innerHTML = '';

        rows.forEach(function (row) {
            var tr = document.createElement('tr');
            var html = '<td>' + esc(row.inspector) + '</td><td>' + esc(row.date) + '</td>';
            products.forEach(function (p) {
                html += '<td>' + (row.counts[p.id] || 0) + '</td>';
            });
            html += '<td>' + row.total + '</td>';
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('refreshDashboard').addEventListener('click', refreshDashboard);

    // --- Admin Page ---
    var adminAuthenticated = false;

    document.getElementById('adminLoginBtn').addEventListener('click', function () {
        var pw = document.getElementById('adminPassword').value;
        if (pw === getAdminPassword()) {
            adminAuthenticated = true;
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
        adminAuthenticated = false;
        document.getElementById('adminPanel').classList.add('hidden');
        document.getElementById('adminLoginSection').classList.remove('hidden');
        document.getElementById('adminResults').innerHTML = '';
        document.getElementById('editFormContainer').classList.add('hidden');
        document.getElementById('changePasswordSection').classList.add('hidden');
    });

    // Change password
    document.getElementById('changePasswordBtn').addEventListener('click', function () {
        var section = document.getElementById('changePasswordSection');
        section.classList.toggle('hidden');
    });

    document.getElementById('saveNewPassword').addEventListener('click', function () {
        var current = document.getElementById('currentPassword').value;
        var newPw = document.getElementById('newPassword').value;
        var confirm = document.getElementById('confirmNewPassword').value;
        var msg = document.getElementById('passwordMsg');

        if (current !== getAdminPassword()) {
            msg.textContent = 'Current password is incorrect.';
            msg.className = 'error-text';
            msg.classList.remove('hidden');
            return;
        }
        if (!newPw || newPw.length < 4) {
            msg.textContent = 'New password must be at least 4 characters.';
            msg.className = 'error-text';
            msg.classList.remove('hidden');
            return;
        }
        if (newPw !== confirm) {
            msg.textContent = 'Passwords do not match.';
            msg.className = 'error-text';
            msg.classList.remove('hidden');
            return;
        }

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
    document.getElementById('admin-search').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') adminSearch();
    });

    function adminSearch() {
        var term = document.getElementById('admin-search').value.trim().toLowerCase();
        var records = getRecords();
        var container = document.getElementById('adminResults');
        container.innerHTML = '';
        document.getElementById('editFormContainer').classList.add('hidden');

        if (!term) { container.innerHTML = '<p>Enter a search term.</p>'; return; }

        var matches = records.filter(function (r) {
            return r.orderNo.toLowerCase().indexOf(term) !== -1 ||
                   r.frameNo.toLowerCase().indexOf(term) !== -1;
        });

        if (matches.length === 0) {
            container.innerHTML = '<p>No records found.</p>';
            return;
        }

        matches.forEach(function (r) {
            var product = getProductById(r.type);
            var displayType = product ? product.name : r.type;
            var card = document.createElement('div');
            card.className = 'admin-record-card';
            var info = document.createElement('div');
            info.className = 'admin-record-info';
            info.innerHTML = '<strong>' + esc(displayType.toUpperCase()) + '</strong> | Order: ' + esc(r.orderNo) +
                ' | Frame: ' + esc(r.frameNo) + ' | Inspector: ' + esc(r.inspector) +
                ' | ' + formatDate(r.timestamp);
            var btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = 'Edit';
            btn.addEventListener('click', function () { loadEditForm(r); });
            card.appendChild(info);
            card.appendChild(btn);
            container.appendChild(card);
        });
    }

    function loadEditForm(record) {
        document.getElementById('editFormContainer').classList.remove('hidden');
        document.getElementById('edit-id').value = record.id;
        document.getElementById('edit-orderNo').value = record.orderNo;
        document.getElementById('edit-frameNo').value = record.frameNo;
        document.getElementById('edit-batteryNo').value = record.batteryNo || '';
        document.getElementById('edit-chargerNo').value = record.chargerNo || '';
        document.getElementById('edit-motorNo').value = record.motorNo || '';
        document.getElementById('edit-inspector').value = record.inspector;

        // Format timestamp for datetime-local input
        if (record.timestamp) {
            document.getElementById('edit-timestamp').value = record.timestamp;
        }

        // Show/hide extra fields based on product config
        var product = getProductById(record.type);
        var neoboltFields = document.querySelectorAll('.edit-neobolt-field');
        neoboltFields.forEach(function (el) {
            var fieldName = el.getAttribute('data-field');
            if (fieldName && product) {
                el.style.display = product.fields.indexOf(fieldName) !== -1 ? 'block' : 'none';
            } else {
                // Fallback: show for neobolt type
                el.style.display = record.type === 'neobolt' ? 'block' : 'none';
            }
        });

        document.getElementById('editFormContainer').scrollIntoView({ behavior: 'smooth' });
    }

    document.getElementById('editRecordForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var id = document.getElementById('edit-id').value;
        var updates = {
            orderNo: document.getElementById('edit-orderNo').value.trim(),
            frameNo: document.getElementById('edit-frameNo').value.trim(),
            batteryNo: document.getElementById('edit-batteryNo').value.trim(),
            chargerNo: document.getElementById('edit-chargerNo').value.trim(),
            motorNo: document.getElementById('edit-motorNo').value.trim(),
            inspector: document.getElementById('edit-inspector').value.trim(),
            timestamp: document.getElementById('edit-timestamp').value
        };

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

    // --- Init ---
    setDefaultTimestamp('entry-timestamp');
    populateEntryProductDropdown();

})();
