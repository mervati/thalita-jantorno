/* =============================================
   ESTADO
   ============================================= */
let allOrders = [];
let allEvents = [];
let selectedFiles = [];
let currentOrderId = null;
let adminEventsBound = false;

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', async () => {
    db.auth.onAuthStateChange((event, session) => {
        if (session) showDashboard();
        else showLogin();
    });

    const { data: { session } } = await db.auth.getSession();
    if (!session) showLogin();
});

/* =============================================
   AUTH
   ============================================= */
function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
}

async function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    await loadDashboard();
    if (!adminEventsBound) {
        bindAdminEvents();
        adminEventsBound = true;
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    errorEl.style.display = 'none';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Entrando...';
    btn.disabled = true;

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        errorEl.textContent = 'E-mail ou senha incorretos.';
        errorEl.style.display = '';
        btn.textContent = 'Entrar';
        btn.disabled = false;
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await db.auth.signOut();
});

/* =============================================
   CARREGAR DASHBOARD
   ============================================= */
async function loadDashboard() {
    await Promise.all([
        loadAdminEvents(),
        loadAdminPackages(),
        loadAdminOrders()
    ]);
    renderStats();
    renderRecentOrders();
}

async function loadAdminEvents() {
    const { data } = await db.from('events').select('*').order('created_at', { ascending: false });
    allEvents = data || [];
    renderEventsList();
    populateEventSelects();
}

async function loadAdminPackages() {
    const { data } = await db.from('packages').select('*').order('quantity');
    renderPackagesList(data || []);
}

async function loadAdminOrders(statusFilter = '') {
    let q = db.from('orders').select('*').order('created_at', { ascending: false });
    if (statusFilter) q = q.eq('status', statusFilter);

    const { data } = await q;
    allOrders = data || [];
}

/* =============================================
   STATS
   ============================================= */
function renderStats() {
    document.getElementById('statTotal').textContent = allOrders.length;
    document.getElementById('statPending').textContent = allOrders.filter(o => o.status === 'pending').length;
    document.getElementById('statDone').textContent = allOrders.filter(o => o.status === 'delivered').length;
    const revenue = allOrders.reduce((s, o) => s + (o.total || 0), 0);
    document.getElementById('statRevenue').textContent = formatPrice(revenue);
}

/* =============================================
   EVENTS
   ============================================= */
function renderEventsList() {
    const el = document.getElementById('eventsList');
    if (!allEvents.length) { el.innerHTML = '<p class="loading-text">Nenhum evento cadastrado.</p>'; return; }

    el.innerHTML = allEvents.map(ev => `
        <div class="list-item">
            <div class="list-item-main">
                <div class="list-item-name">${ev.name}</div>
                <div class="list-item-meta">${ev.date ? formatDate(ev.date) : 'Sem data'} ${ev.description ? '· ' + ev.description : ''}</div>
            </div>
            <div class="list-item-actions">
                <button class="btn-danger-sm" onclick="deleteEvent('${ev.id}')">Excluir</button>
            </div>
        </div>
    `).join('');
}

function populateEventSelects() {
    const selects = [
        document.getElementById('uploadEvent'),
        document.getElementById('photoFilterEvent')
    ];
    selects.forEach(sel => {
        const defaultOpt = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(defaultOpt);
        allEvents.forEach(ev => {
            const opt = document.createElement('option');
            opt.value = ev.id;
            opt.textContent = ev.name;
            sel.appendChild(opt);
        });
    });
}

document.getElementById('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('eventName').value.trim();
    const date = document.getElementById('eventDate').value || null;
    const desc = document.getElementById('eventDesc').value.trim() || null;
    if (!name) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Criando...';

    const { error } = await db.from('events').insert({ name, date, description: desc, active: true });

    btn.disabled = false; btn.textContent = 'Criar Evento';

    if (!error) {
        e.target.reset();
        await loadAdminEvents();
    }
});

async function deleteEvent(id) {
    if (!confirm('Excluir este evento e todas as suas fotos?')) return;
    await db.from('events').delete().eq('id', id);
    await loadAdminEvents();
    await renderAdminPhotos();
}

/* =============================================
   PACKAGES
   ============================================= */
function renderPackagesList(packages) {
    const el = document.getElementById('packagesList');
    if (!packages.length) { el.innerHTML = '<p class="loading-text">Nenhum pacote cadastrado.</p>'; return; }

    el.innerHTML = packages.map(pkg => `
        <div class="list-item">
            <div class="list-item-main">
                <div class="list-item-name">${pkg.name}</div>
                <div class="list-item-meta">${pkg.quantity} fotos · ${formatPrice(pkg.price)}${pkg.description ? ' · ' + pkg.description : ''}</div>
            </div>
            <div class="list-item-actions">
                <button class="btn-danger-sm" onclick="deletePackage('${pkg.id}')">Excluir</button>
            </div>
        </div>
    `).join('');
}

document.getElementById('packageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('pkgName').value.trim();
    const quantity = parseInt(document.getElementById('pkgQty').value);
    const price = parseFloat(document.getElementById('pkgPrice').value);
    const description = document.getElementById('pkgDesc').value.trim() || null;

    if (!name || !quantity || !price) return;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Criando...';

    const { error } = await db.from('packages').insert({ name, quantity, price, description, active: true });

    btn.disabled = false; btn.textContent = 'Criar Pacote';

    if (!error) {
        e.target.reset();
        await loadAdminPackages();
    }
});

async function deletePackage(id) {
    if (!confirm('Excluir este pacote?')) return;
    await db.from('packages').delete().eq('id', id);
    await loadAdminPackages();
}

/* =============================================
   FOTOS — UPLOAD
   ============================================= */
const uploadZone = document.getElementById('uploadZone');
const uploadFilesInput = document.getElementById('uploadFiles');

uploadZone.addEventListener('click', () => uploadFilesInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFileSelection(e.dataTransfer.files);
});
uploadFilesInput.addEventListener('change', e => handleFileSelection(e.target.files));

function handleFileSelection(files) {
    selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;

    const preview = document.getElementById('uploadPreview');
    preview.style.display = 'flex';
    preview.innerHTML = selectedFiles.map((f, i) => `
        <div class="upload-preview-item">
            <img src="${URL.createObjectURL(f)}" alt="${f.name}">
        </div>
    `).join('');

    document.getElementById('uploadBtn').disabled = false;
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const eventId = document.getElementById('uploadEvent').value;
    const price = parseFloat(document.getElementById('uploadPrice').value);

    if (!eventId || !price || !selectedFiles.length) return;

    const btn = document.getElementById('uploadBtn');
    const progressWrap = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');

    btn.disabled = true;
    progressWrap.style.display = '';

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const pct = Math.round(((i) / selectedFiles.length) * 100);
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `Enviando ${i + 1} de ${selectedFiles.length}...`;

        const ext = file.name.split('.').pop().toLowerCase();
        const path = `${eventId}/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await db.storage.from('photos').upload(path, file, { upsert: false });
        if (uploadError) { console.error(uploadError); continue; }

        const { data: urlData } = db.storage.from('photos').getPublicUrl(path);

        await db.from('photos').insert({
            event_id: eventId,
            storage_path: path,
            url: urlData.publicUrl,
            price: price,
            active: true
        });
    }

    progressBar.style.width = '100%';
    progressText.textContent = `Upload concluído! ${selectedFiles.length} foto(s) enviada(s).`;

    setTimeout(async () => {
        progressWrap.style.display = 'none';
        document.getElementById('uploadPreview').style.display = 'none';
        document.getElementById('uploadForm').reset();
        selectedFiles = [];
        btn.disabled = true;
        await renderAdminPhotos();
    }, 2000);
});

async function renderAdminPhotos(eventId = '') {
    const el = document.getElementById('photosList');
    el.innerHTML = '<p class="loading-text">Carregando...</p>';

    let q = db.from('photos').select('*, events(name)').eq('active', true).order('created_at');
    if (eventId) q = q.eq('event_id', eventId);

    const { data } = await q;
    const photos = data || [];

    if (!photos.length) { el.innerHTML = '<p class="loading-text">Nenhuma foto encontrada.</p>'; return; }

    el.innerHTML = photos.map((p, i) => `
        <div class="photo-admin-card">
            <img src="${p.url}" alt="Foto ${i+1}" loading="lazy">
            <div class="photo-admin-overlay">
                <div class="photo-admin-num">Foto #${i+1}</div>
                <div class="photo-admin-price">${formatPrice(p.price)}</div>
                <button class="photo-delete-btn" onclick="deletePhoto('${p.id}', '${p.storage_path}')">Excluir</button>
            </div>
        </div>
    `).join('');
}

async function deletePhoto(id, storagePath) {
    if (!confirm('Excluir esta foto?')) return;
    await db.from('photos').delete().eq('id', id);
    if (storagePath) await db.storage.from('photos').remove([storagePath]);
    await renderAdminPhotos(document.getElementById('photoFilterEvent').value);
}

/* =============================================
   ORDERS
   ============================================= */
function renderRecentOrders() {
    const el = document.getElementById('recentOrders');
    const recent = allOrders.slice(0, 5);
    if (!recent.length) { el.innerHTML = '<p class="loading-text">Nenhum pedido ainda.</p>'; return; }
    el.innerHTML = buildOrdersTable(recent);
}

function renderOrdersTable() {
    const el = document.getElementById('ordersTableWrap');
    const query = document.getElementById('ordersSearch')?.value.trim().toLowerCase() || '';
    const filtered = filterOrders(query);
    if (!filtered.length) { el.innerHTML = '<p class="loading-text">Nenhum pedido encontrado.</p>'; return; }
    el.innerHTML = buildOrdersTable(filtered);
}

function filterOrders(query) {
    if (!query) return allOrders;
    return allOrders.filter(o =>
        o.customer_name?.toLowerCase().includes(query) ||
        o.customer_phone?.includes(query) ||
        String(o.order_number || '').includes(query)
    );
}

function buildOrdersTable(orders) {
    return `
        <table class="orders-table">
            <thead>
                <tr>
                    <th>Pedido</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>WhatsApp</th>
                    <th>Fotos</th>
                    <th>Total</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map(o => `
                    <tr onclick="openOrderModal('${o.id}')">
                        <td><strong>#${String(o.order_number || 0).padStart(4,'0')}</strong></td>
                        <td>${formatDateTime(o.created_at)}</td>
                        <td>${o.customer_name}</td>
                        <td>${o.customer_phone}</td>
                        <td>${(o.photo_ids || []).length} foto(s)</td>
                        <td>${formatPrice(o.total)}</td>
                        <td><span class="status-badge status-${o.status}">${statusLabel(o.status)}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function statusLabel(s) {
    return { pending: 'Pendente', confirmed: 'Confirmado', delivered: 'Entregue' }[s] || s;
}

/* =============================================
   ORDER MODAL
   ============================================= */
async function openOrderModal(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    currentOrderId = orderId;

    const photoIds = order.photo_ids || [];
    let photos = [];
    if (photoIds.length) {
        const { data } = await db.from('photos').select('*').in('id', photoIds);
        photos = data || [];
    }

    const body = document.getElementById('orderModalBody');
    body.innerHTML = `
        <div class="order-detail-grid">
            <div class="order-detail-field">
                <label>Cliente</label><span>${order.customer_name}</span>
            </div>
            <div class="order-detail-field">
                <label>WhatsApp</label><span>${order.customer_phone}</span>
            </div>
            <div class="order-detail-field">
                <label>E-mail</label><span>${order.customer_email || '—'}</span>
            </div>
            <div class="order-detail-field">
                <label>Data</label><span>${formatDateTime(order.created_at)}</span>
            </div>
            <div class="order-detail-field">
                <label>Total</label><span>${formatPrice(order.total)}</span>
            </div>
            <div class="order-detail-field">
                <label>Status</label><span class="status-badge status-${order.status}">${statusLabel(order.status)}</span>
            </div>
        </div>
        ${order.customer_notes ? `<p><strong>Observações:</strong> ${order.customer_notes}</p>` : ''}
        <h4 style="margin:14px 0 8px;font-size:14px;color:var(--text-muted)">Fotos (${photos.length})</h4>
        <div class="order-photos-grid">
            ${photos.map(p => `<img class="order-photo-preview" src="${p.url}" alt="Foto">`).join('')}
        </div>
        <div class="order-status-actions">
            <span style="font-size:13px;color:var(--text-muted);margin-right:4px">Atualizar status:</span>
            <button class="btn-secondary" onclick="updateStatus('pending')">Pendente</button>
            <button class="btn-secondary" onclick="updateStatus('confirmed')">Confirmado</button>
            <button class="btn-primary" onclick="updateStatus('delivered')">Entregue</button>
            <a href="https://wa.me/${order.customer_phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá ${order.customer_name}! Suas fotos estão prontas.`)}" target="_blank" class="btn-secondary" style="margin-left:auto">WhatsApp ↗</a>
        </div>
    `;

    document.getElementById('orderOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

async function updateStatus(status) {
    if (!currentOrderId) return;
    await db.from('orders').update({ status }).eq('id', currentOrderId);
    const order = allOrders.find(o => o.id === currentOrderId);
    if (order) order.status = status;
    closeOrderModal();
    renderOrdersTable();
    renderStats();
    renderRecentOrders();
}

function closeOrderModal() {
    document.getElementById('orderOverlay').style.display = 'none';
    document.body.style.overflow = '';
    currentOrderId = null;
}

/* =============================================
   EXPORT CSV
   ============================================= */
function exportCSV() {
    const rows = [['Data', 'Cliente', 'WhatsApp', 'Email', 'Fotos', 'Total', 'Status']];
    allOrders.forEach(o => {
        rows.push([
            formatDateTime(o.created_at),
            o.customer_name,
            o.customer_phone,
            o.customer_email || '',
            (o.photo_ids || []).length,
            o.total,
            statusLabel(o.status)
        ]);
    });

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos-thalita-${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/* =============================================
   BIND EVENTS
   ============================================= */
function bindAdminEvents() {
    // Tabs
    document.getElementById('navTabs').addEventListener('click', e => {
        const tab = e.target.closest('.nav-tab');
        if (!tab) return;

        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const section = tab.dataset.section;
        document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
        document.getElementById(`sec${capitalize(section)}`).style.display = '';

        if (section === 'fotos') renderAdminPhotos();
        if (section === 'pedidos') renderOrdersTable();
    });

    // Order modal close
    document.getElementById('orderModalClose').addEventListener('click', closeOrderModal);
    document.getElementById('orderOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeOrderModal();
    });

    // Orders filter
    document.getElementById('ordersStatusFilter').addEventListener('change', async e => {
        await loadAdminOrders(e.target.value);
        renderOrdersTable();
    });

    // Orders search
    document.getElementById('ordersSearch').addEventListener('input', () => renderOrdersTable());

    // Photo filter
    document.getElementById('photoFilterEvent').addEventListener('change', e => {
        renderAdminPhotos(e.target.value);
    });

    // Export
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
}

/* =============================================
   HELPERS
   ============================================= */
function formatPrice(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
