const DB_NAME = 'TokoKuDB';
const DB_VERSION = 2;

const DB = {
    db: null,
    init() {
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject(e.target.error);
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                const stores = ['customers', 'partners', 'suppliers', 'products', 'transactions'];
                stores.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); });
            };
        });
    },
    getAll(store) {
        if (!this.db) return Promise.resolve([]);
        return new Promise((res, rej) => {
            const tx = this.db.transaction(store, 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    },
    add(store, data) {
        if (!this.db) return Promise.resolve(null);
        return new Promise((res, rej) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).add(data);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    },
    put(store, data) {
        if (!this.db) return Promise.resolve(null);
        return new Promise((res, rej) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).put(data);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    },
    delete(store, id) {
        if (!this.db) return Promise.resolve();
        return new Promise((res, rej) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).delete(Number(id));
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
        });
    },
    get(store, id) {
        if (!this.db) return Promise.resolve(null);
        return new Promise((res, rej) => {
            const tx = this.db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(Number(id));
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    }
};

let tables = {};

async function initApp() {
    try {
        await DB.init();
        setupEventListeners();
        setupScanner();
        await refreshAllData();
        applySavedTheme();
    } catch (e) {
        console.error("App Init Error:", e);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'Kritis: Inisialisasi Gagal',
                text: `Sistem gagal memuat database. Error: ${e.message}`,
                footer: 'Coba bersihkan cache browser atau restart aplikasi.'
            });
        }
    }
}

function setupEventListeners() {
    const formConfigs = {
        'customerForm': 'customers',
        'partnerForm': 'partners',
        'supplierForm': 'suppliers',
        'productForm': 'products'
    };

    Object.entries(formConfigs).forEach(([formId, store]) => {
        const formEl = document.getElementById(formId);
        if (formEl) {
            formEl.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                const id = data.id;
                delete data.id;

                if (id) await DB.put(store, { ...data, id: Number(id) });
                else await DB.add(store, data);

                Swal.fire('Berhasil', 'Data telah disimpan', 'success');
                const modalEl = e.target.closest('.modal');
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (modalInstance) modalInstance.hide();
                e.target.reset();
                await refreshAllData();
            };
        }
    });

    const purForm = document.getElementById('purchaseForm');
    if (purForm) {
        purForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            data.total = Number(data.qty) * Number(data.price);
            await DB.add('transactions', data);
            const products = await DB.getAll('products');
            const product = products.find(p => p.sku.trim().toLowerCase() === data.sku.trim().toLowerCase());
            if (product) {
                product.stock = Number(product.stock) + Number(data.qty);
                await DB.put('products', product);
            } else {
                Swal.fire('Error', 'Produk tidak ditemukan berdasarkan SKU, stok tidak terupdate', 'error');
            }
            Swal.fire('Berhasil', 'Pembelian dicatat dan stok terupdate', 'success');
            const modalEl = purForm.closest('.modal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
            purForm.reset();
            await refreshAllData();
        };
    }
}

async function refreshAllData() {
    const data = {
        customers: await DB.getAll('customers'),
        partners: await DB.getAll('partners'),
        suppliers: await DB.getAll('suppliers'),
        products: await DB.getAll('products'),
        transactions: await DB.getAll('transactions')
    };
    updateStats(data);
    renderTable('customerTable', data.customers);
    renderTable('partnerTable', data.partners);
    renderTable('supplierTable', data.suppliers);
    renderTable('productTable', data.products);
    renderTable('purchaseTable', data.transactions);
}

function updateStats(data) {
    const mapping = {
        'stat-customers': data.customers.length,
        'stat-partners': data.partners.length,
        'stat-suppliers': data.suppliers.length,
        'stat-products': data.products.length
    };
    for (let id in mapping) {
        const el = document.getElementById(id);
        if (el) el.innerText = mapping[id];
    }
}

function sanitize(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;'
    };
    const reg = /[&<>"'/]/ig;
    return text.replace(reg, (match) => map[match]);
}

// function renderTable(tableId, data) {
//     const el = document.getElementById(tableId);
//     if (!el) return;
//     if (tables[tableId]) {
//         tables[tableId].destroy();
//     }
//     const tbody = $(`#${tableId} tbody`).empty();
//     data.forEach(item => {
//         let row = '<tr>';
//         const values = Object.values(item);
//         for (let i = 1; i < values.length; i++) {
//             row += `<td>${sanitize(values[i])}</td>`;
//         }
//         row += `<td>
//             <button class="btn btn-sm btn-warning" onclick="editItem('${tableId}', ${item.id})"><i class="bi bi-pencil"></i></button>
//             <button class="btn btn-sm btn-danger" onclick="deleteItem('${tableId}', ${item.id})"><i class="bi bi-trash"></i></button>
//         </td></tr>`;
//         tbody.append(row);
//     });
//     tables[tableId] = $(`#${tableId}`).DataTable({ 
//         responsive: true,
//         language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json' }
//     });
// }
function renderTable(tableId, data) {
    const el = document.getElementById(tableId);
    if (!el) return;
    if (tables[tableId]) {
        tables[tableId].destroy();
    }
    const tbody = $(`#${tableId} tbody`).empty();

    const storeMap = {
        'customerTable': ['name', 'phone', 'email', 'address'],
        'partnerTable': ['name', 'contact', 'address'],
        'supplierTable': ['name', 'contact', 'phone', 'email', 'address'],
        'productTable': ['sku', 'name', 'stock', 'price'],
        'purchaseTable': ['sku', 'qty', 'price', 'total']
    };

    const fields = storeMap[tableId];

    data.forEach(item => {
        let row = '<tr>';
        if (fields) {
            fields.forEach(field => {
                row += `<td>${sanitize(item[field] || '')}</td>`;
            });
        } else {
            const values = Object.values(item);
            for (let i = 1; i < values.length; i++) {
                row += `<td>${sanitize(values[i])}</td>`;
            }
        }
        row += `<td>
            <button class="btn btn-sm btn-warning" onclick="editItem('${tableId}', ${item.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteItem('${tableId}', ${item.id})"><i class="bi bi-trash"></i></button>
        </td></tr>`;
        tbody.append(row);
    });
    tables[tableId] = $(`#${tableId}`).DataTable({ 
        responsive: true,
        deferRender: true,
        language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json' }
    });
}

const globalFunctions = {
    exportData: async function() {
        try {
            const stores = ['customers', 'partners', 'suppliers', 'products', 'transactions'];
            let overallData = {};
            
            for (const store of stores) {
                const data = await DB.getAll(store);
                if (data.length > 0) {
                    overallData[store] = data;
                }
            }

            if (Object.keys(overallData).length === 0) {
                Swal.fire('Info', 'Tidak ada data untuk diexport', 'info');
                return;
            }

            const blob = new Blob([JSON.stringify(overallData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokoku_backup_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Swal.fire('Berhasil', 'Data berhasil diexport ke JSON', 'success');
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Gagal mengexport data', 'error');
        }
    },

    importData: async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                const stores = Object.keys(importedData);
                
                for (const store of stores) {
                    const items = importedData[store];
                    for (const item of items) {
                        await DB.put(store, item);
                    }
                }
                
                await refreshAllData();
                Swal.fire('Berhasil', 'Data berhasil diimport!', 'success');
                event.target.value = ''; // reset input
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Format file tidak valid atau data korup', 'error');
            }
        };
        reader.readAsText(file);
    },

    showSection: function(id, el) {
        const titles = {
            'dashboard': 'Dashboard',
            'customers': 'Pelanggan',
            'partners': 'Mitra',
            'suppliers': 'Pemasok',
            'products': 'Stok Barang',
            'purchases': 'Pembelian Stok'
        };
        $('.section').removeClass('active');
        $(`#${id}`).addClass('active');
        $('.nav-link').removeClass('active');
        $(el).addClass('active');
        $('#page-title').text(titles[id] || id.charAt(0).toUpperCase() + id.slice(1));
    },
    toggleSidebar: function() { $('#sidebar').toggleClass('collapsed'); },
};

globalFunctions.openModal = function(id) { 
    console.log("Attempting to open modal:", id);
    const modalEl = document.getElementById(id);
    if (!modalEl) {
        console.error(`Modal with id ${id} not found.`);
        return;
    }
    
    try {
        const existingModal = bootstrap.Modal.getInstance(modalEl);
        if (existingModal) {
            existingModal.hide();
        }
        const modal = new bootstrap.Modal(modalEl);
        const form = modalEl.querySelector('form');
        if (form && typeof form.reset === 'function') {
            form.reset();
        } else if (form) {
            $(form).trigger('reset');
        }
        const idInput = modalEl.querySelector('input[name="id"]');
        if (idInput) idInput.value = '';
        modal.show(); 
    } catch (err) {
        console.error("Error showing modal:", err);
    }
}

globalFunctions.editItem = async function(tableId, id) {
    const storeMap = { 'customerTable': 'customers', 'partnerTable': 'partners', 'supplierTable': 'suppliers', 'productTable': 'products' };
    const store = storeMap[tableId];
    const item = await DB.get(store, id);
    if (!item) return;
    const modalId = tableId.replace('Table', 'Modal');
    globalFunctions.openModal(modalId);
    const form = document.getElementById(`${modalId === 'customerModal' ? 'customerForm' : modalId === 'partnerModal' ? 'partnerForm' : modalId === 'supplierModal' ? 'supplierForm' : 'productForm'}`);
    Object.entries(item).forEach(([key, val]) => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) input.value = val;
    });
};

globalFunctions.deleteItem = async function(tableId, id) {
    const storeMap = { 'customerTable': 'customers', 'partnerTable': 'partners', 'supplierTable': 'suppliers', 'productTable': 'products', 'purchaseTable': 'transactions' };
    const store = storeMap[tableId];
    const result = await Swal.fire({
        title: 'Hapus Data?', text: "Data yang dihapus tidak bisa dikembalikan!", 
        icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Hapus!'
    });
    if (result.isConfirmed) {
        await DB.delete(store, id);
        Swal.fire('Terhapus!', 'Data berhasil dihapus', 'success');
        await refreshAllData();
    }
};

// Object.assign(window, globalFunctions);
// if (typeof window !== 'undefined') {
//     Object.assign(window, globalFunctions);
// }

// document.addEventListener('DOMContentLoaded', initApp);
if (typeof window !== 'undefined') {
    Object.assign(window, globalFunctions);
    
    if (window.cordova) {
        document.addEventListener('deviceready', initApp, false);
    } else {
        document.addEventListener('DOMContentLoaded', initApp);
    }
}

function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}

function applySavedTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', saved);
}

function setupScanner() {
    const scanner = new Html5QrcodeScanner("scannerReader", { fps: 10, qrbox: 250 });
    scanner.render((text) => {
        document.getElementById('skuSearch').value = text;
        searchProductBySKU();
    });
}

async function searchProductBySKU() {
    const sku = document.getElementById('skuSearch').value;
    if (!sku) return;
    const products = await DB.getAll('products');
    const product = products.find(p => p.sku === sku);
    if (product) {
        Swal.fire('Produk Ditemukan', `Nama: ${product.name}<br>Stok: ${product.stock}`, 'info');
    } else {
        Swal.fire('Tidak Ditemukan', 'Produk dengan SKU tersebut tidak ada', 'error');
    }
}
