/* === Traceability System Application === */

(function () {
    'use strict';

    // --- Storage Keys ---
    var STORAGE_KEY = 'traceability_records';
    var ADMIN_PW_KEY = 'traceability_admin_pw';
    var DEFAULT_ADMIN_PW = 'admin123';

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
        if (record.type === 'neobolt') {
            parts.push('Battery:' + record.batteryNo);
            parts.push('Charger:' + record.chargerNo);
            parts.push('Motor:' + record.motorNo);
        }
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
        if (pageId === 'records') renderRecords();
        if (pageId === 'reports') { populateInspectorDropdowns(); renderReport(getRecords()); }
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

    // --- Neofly Form ---
    var neoflyForm = document.getElementById('neoflyForm');
    neoflyForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var record = {
            type: 'neofly',
            orderNo: document.getElementById('nf-orderNo').value.trim(),
            frameNo: document.getElementById('nf-frameNo').value.trim(),
            batteryNo: '',
            chargerNo: '',
            motorNo: '',
            inspector: document.getElementById('nf-inspector').value.trim(),
            timestamp: document.getElementById('nf-timestamp').value
        };
        addRecord(record);
        var conf = document.getElementById('neofly-confirmation');
        conf.textContent = 'Neofly entry saved successfully for Order: ' + record.orderNo;
        conf.classList.remove('hidden');
        neoflyForm.reset();
        setDefaultTimestamp('nf-timestamp');
        setTimeout(function () { conf.classList.add('hidden'); }, 4000);
    });

    // --- Neobolt Form ---
    var neoboltForm = document.getElementById('neoboltForm');
    neoboltForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var record = {
            type: 'neobolt',
            orderNo: document.getElementById('nb-orderNo').value.trim(),
            frameNo: document.getElementById('nb-frameNo').value.trim(),
            batteryNo: document.getElementById('nb-batteryNo').value.trim(),
            chargerNo: document.getElementById('nb-chargerNo').value.trim(),
            motorNo: document.getElementById('nb-motorNo').value.trim(),
            inspector: document.getElementById('nb-inspector').value.trim(),
            timestamp: document.getElementById('nb-timestamp').value
        };
        addRecord(record);
        var conf = document.getElementById('neobolt-confirmation');
        conf.textContent = 'Neobolt entry saved successfully for Order: ' + record.orderNo;
        conf.classList.remove('hidden');
        neoboltForm.reset();
        setDefaultTimestamp('nb-timestamp');
        setTimeout(function () { conf.classList.add('hidden'); }, 4000);
    });

    // --- Records Page ---
    var recordsTypeFilter = document.getElementById('records-type-filter');
    var recordsSearch = document.getElementById('records-search');

    function renderRecords() {
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
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + esc(r.type) + '</td>' +
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

    function esc(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    recordsTypeFilter.addEventListener('change', renderRecords);
    recordsSearch.addEventListener('input', renderRecords);

    // --- Reports Page ---
    function populateInspectorDropdowns() {
        var inspectors = getUniqueInspectors();
        var rptSelect = document.getElementById('rpt-inspector');
        var dashSelect = document.getElementById('dash-inspector');

        [rptSelect, dashSelect].forEach(function (sel) {
            if (!sel) return;
            var currentVal = sel.value;
            sel.innerHTML = '<option value="">All Inspectors</option>';
            inspectors.forEach(function (name) {
                var opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
            sel.value = currentVal;
        });
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
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + esc(r.type) + '</td>' +
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

    document.getElementById('filterByOrder').addEventListener('click', function () {
        var from = document.getElementById('rpt-orderFrom').value.trim().toLowerCase();
        var to = document.getElementById('rpt-orderTo').value.trim().toLowerCase();
        var records = getRecords();
        if (!from && !to) { renderReport(records); return; }

        var filtered = records.filter(function (r) {
            var order = r.orderNo.toLowerCase();
            if (from && order < from) return false;
            if (to && order > to) return false;
            return true;
        });
        renderReport(filtered);
    });

    document.getElementById('filterByDate').addEventListener('click', function () {
        var from = document.getElementById('rpt-dateFrom').value;
        var to = document.getElementById('rpt-dateTo').value;
        var records = getRecords();
        if (!from && !to) { renderReport(records); return; }

        var filtered = records.filter(function (r) {
            var d = dateOnly(r.timestamp);
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });
        renderReport(filtered);
    });

    document.getElementById('filterByPerson').addEventListener('click', function () {
        var person = document.getElementById('rpt-inspector').value;
        var records = getRecords();
        if (!person) { renderReport(records); return; }

        var filtered = records.filter(function (r) {
            return r.inspector === person;
        });
        renderReport(filtered);
    });

    document.getElementById('clearFilters').addEventListener('click', function () {
        document.getElementById('rpt-orderFrom').value = '';
        document.getElementById('rpt-orderTo').value = '';
        document.getElementById('rpt-dateFrom').value = '';
        document.getElementById('rpt-dateTo').value = '';
        document.getElementById('rpt-inspector').value = '';
        renderReport(getRecords());
    });

    // --- CSV Download ---
    document.getElementById('downloadCSV').addEventListener('click', function () {
        var data = currentReportData.length > 0 ? currentReportData : getRecords();
        if (data.length === 0) { alert('No data to export.'); return; }

        var headers = ['Type', 'Order No', 'Frame/Chassis No', 'Battery No', 'Charger No', 'Motor No', 'Inspector', 'Timestamp'];
        var rows = [headers.map(escapeCSV).join(',')];

        data.forEach(function (r) {
            rows.push([
                escapeCSV(r.type),
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

        // Summary cards
        var totalRecords = filtered.length;
        var neoflyCount = filtered.filter(function (r) { return r.type === 'neofly'; }).length;
        var neoboltCount = filtered.filter(function (r) { return r.type === 'neobolt'; }).length;
        var uniqueInspectors = {};
        filtered.forEach(function (r) { uniqueInspectors[r.inspector] = true; });
        var inspectorCount = Object.keys(uniqueInspectors).length;

        var cardsContainer = document.getElementById('dashboardCards');
        cardsContainer.innerHTML = '';

        var cards = [
            { value: totalRecords, label: 'Total Inspections' },
            { value: neoflyCount, label: 'Neofly Entries' },
            { value: neoboltCount, label: 'Neobolt Entries' },
            { value: inspectorCount, label: 'Active Inspectors' }
        ];

        cards.forEach(function (c) {
            var div = document.createElement('div');
            div.className = 'dash-card';
            div.innerHTML = '<div class="card-value">' + c.value + '</div><div class="card-label">' + c.label + '</div>';
            cardsContainer.appendChild(div);
        });

        // Daily breakdown table
        var breakdown = {};
        filtered.forEach(function (r) {
            var d = dateOnly(r.timestamp);
            var key = r.inspector + '|' + d;
            if (!breakdown[key]) {
                breakdown[key] = { inspector: r.inspector, date: d, neofly: 0, neobolt: 0 };
            }
            if (r.type === 'neofly') breakdown[key].neofly++;
            if (r.type === 'neobolt') breakdown[key].neobolt++;
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
            tr.innerHTML =
                '<td>' + esc(row.inspector) + '</td>' +
                '<td>' + esc(row.date) + '</td>' +
                '<td>' + row.neofly + '</td>' +
                '<td>' + row.neobolt + '</td>' +
                '<td>' + (row.neofly + row.neobolt) + '</td>';
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
            var card = document.createElement('div');
            card.className = 'admin-record-card';
            var info = document.createElement('div');
            info.className = 'admin-record-info';
            info.innerHTML = '<strong>' + esc(r.type.toUpperCase()) + '</strong> | Order: ' + esc(r.orderNo) +
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

        // Show/hide neobolt fields
        var neoboltFields = document.querySelectorAll('.edit-neobolt-field');
        neoboltFields.forEach(function (el) {
            el.style.display = record.type === 'neobolt' ? 'block' : 'none';
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
    setDefaultTimestamp('nf-timestamp');
    setDefaultTimestamp('nb-timestamp');

})();
