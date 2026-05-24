/* =============================================
   ESTADO GLOBAL
   ============================================= */
let allPhotos = [];
let allPackages = [];
let cart = [];          // array de photo objects selecionadas
let activePackage = null; // package object ou null

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', async () => {
    await loadEvents();
    await loadPackages();
    await loadPhotos();
    bindEvents();
});

/* =============================================
   CARREGAR DADOS
   ============================================= */
async function loadEvents() {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('active', true)
        .order('date', { ascending: false });

    if (error || !data?.length) return;

    const select = document.getElementById('eventFilter');
    data.forEach(ev => {
        const opt = document.createElement('option');
        opt.value = ev.id;
        opt.textContent = ev.name + (ev.date ? ` — ${formatDate(ev.date)}` : '');
        select.appendChild(opt);
    });
}

async function loadPackages() {
    const { data, error } = await supabase
        .from('packages')
        .select('*')
        .eq('active', true)
        .order('quantity', { ascending: true });

    if (error || !data?.length) return;

    allPackages = data;
    renderPackages(data);
}

async function loadPhotos(eventId = '') {
    showLoading(true);

    let query = supabase
        .from('photos')
        .select('*, events(name)')
        .eq('active', true)
        .order('created_at', { ascending: true });

    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query;

    showLoading(false);

    if (error) { showEmpty(true); return; }

    allPhotos = (data || []).map((p, i) => ({ ...p, seq: i + 1 }));
    renderGallery(allPhotos);
}

/* =============================================
   RENDERIZAR PACOTES
   ============================================= */
function renderPackages(packages) {
    const section = document.getElementById('packagesSection');
    const track = document.getElementById('packagesTrack');

    if (!packages.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    track.innerHTML = packages.map(pkg => `
        <div class="package-card" data-id="${pkg.id}" onclick="selectPackage('${pkg.id}')">
            <div class="package-qty">${pkg.quantity}</div>
            <div class="package-label">${pkg.name}</div>
            ${pkg.description ? `<div class="package-desc">${pkg.description}</div>` : ''}
            <div class="package-price">${formatPrice(pkg.price)}</div>
        </div>
    `).join('');
}

/* =============================================
   RENDERIZAR GALERIA
   ============================================= */
function renderGallery(photos) {
    const grid = document.getElementById('galleryGrid');

    if (!photos.length) { showEmpty(true); grid.innerHTML = ''; return; }
    showEmpty(false);

    grid.innerHTML = photos.map(photo => `
        <div class="photo-card" id="card-${photo.id}" data-id="${photo.id}" onclick="togglePhoto('${photo.id}')">
            <img src="${photo.url}" alt="Foto ${photo.seq}" loading="lazy">
            <div class="photo-overlay">
                <span class="photo-num">Foto #${photo.seq}</span>
                <span class="photo-price-tag">${formatPrice(photo.price)}</span>
            </div>
            <div class="photo-check">✓</div>
            <button class="photo-preview-btn" onclick="openPreview('${photo.id}', event)" title="Ver ampliada">⤢</button>
        </div>
    `).join('');
}

/* =============================================
   SELECIONAR / DESSELECIONAR FOTO
   ============================================= */
function togglePhoto(photoId) {
    const photo = allPhotos.find(p => p.id === photoId);
    if (!photo) return;

    const isSelected = cart.some(p => p.id === photoId);

    if (isSelected) {
        cart = cart.filter(p => p.id !== photoId);
    } else {
        if (activePackage) {
            // Modo pacote: limita ao número do pacote
            if (cart.length >= activePackage.quantity) {
                cart.shift(); // remove o mais antigo
            }
        }
        cart.push(photo);
    }

    updateCardUI(photoId, !isSelected);
    updateCart();
}

function updateCardUI(photoId, selected) {
    const card = document.getElementById(`card-${photoId}`);
    if (!card) return;
    card.classList.toggle('selected', selected);
}

/* =============================================
   SELECIONAR PACOTE
   ============================================= */
function selectPackage(pkgId) {
    if (activePackage?.id === pkgId) {
        removePackage();
        return;
    }

    const pkg = allPackages.find(p => p.id === pkgId);
    if (!pkg) return;

    activePackage = pkg;
    cart = []; // limpa carrinho ao mudar para pacote

    // Atualiza UI dos cards de pacote
    document.querySelectorAll('.package-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === pkgId);
    });

    // Remove checkmarks de fotos
    document.querySelectorAll('.photo-card').forEach(el => el.classList.remove('selected'));

    updateCart();
}

function removePackage() {
    activePackage = null;
    cart = [];

    document.querySelectorAll('.package-card').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.photo-card').forEach(el => el.classList.remove('selected'));

    updateCart();
}

/* =============================================
   ATUALIZAR CARRINHO (UI)
   ============================================= */
function updateCart() {
    const itemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotalValue');
    const badgeEl = document.getElementById('cartBadge');
    const countEl = document.getElementById('selectedCount');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const pkgInfo = document.getElementById('cartPackageInfo');

    // Badge no botão do header
    if (cart.length > 0) {
        badgeEl.style.display = 'flex';
        badgeEl.textContent = cart.length;
    } else {
        badgeEl.style.display = 'none';
    }

    // Contagem abaixo do título
    if (cart.length > 0) {
        countEl.style.display = 'inline';
        countEl.textContent = `${cart.length} selecionada(s)`;
    } else {
        countEl.style.display = 'none';
    }

    // Info do pacote no sidebar
    if (activePackage) {
        pkgInfo.style.display = '';
        document.getElementById('packageTagName').textContent = `${activePackage.name} — ${formatPrice(activePackage.price)}`;
        const fill = document.getElementById('packageProgressFill');
        const hint = document.getElementById('packageHint');
        const pct = (cart.length / activePackage.quantity) * 100;
        fill.style.width = `${pct}%`;
        const remaining = activePackage.quantity - cart.length;
        hint.textContent = remaining > 0
            ? `Selecione mais ${remaining} foto(s)`
            : 'Pacote completo! ✓';
    } else {
        pkgInfo.style.display = 'none';
    }

    // Lista de itens
    if (cart.length === 0) {
        itemsEl.innerHTML = '<p class="cart-empty">Nenhuma foto selecionada ainda</p>';
    } else {
        itemsEl.innerHTML = cart.map(photo => `
            <div class="cart-item">
                <img class="cart-item-thumb" src="${photo.url}" alt="Foto ${photo.seq}">
                <div class="cart-item-info">
                    <div class="cart-item-label">Foto #${photo.seq}</div>
                    <div class="cart-item-price">${activePackage ? 'inclusa no pacote' : formatPrice(photo.price)}</div>
                </div>
                <button class="cart-item-remove" onclick="togglePhoto('${photo.id}')" title="Remover">✕</button>
            </div>
        `).join('');
    }

    // Total
    let total = 0;
    if (activePackage) {
        total = cart.length === activePackage.quantity ? activePackage.price : 0;
    } else {
        total = cart.reduce((sum, p) => sum + p.price, 0);
    }
    totalEl.textContent = formatPrice(total);

    // Habilitar checkout
    const canCheckout = activePackage
        ? cart.length === activePackage.quantity
        : cart.length > 0;

    checkoutBtn.disabled = !canCheckout;
}

/* =============================================
   PREVIEW MODAL
   ============================================= */
let previewIndex = 0;

function openPreview(photoId, e) {
    e?.stopPropagation();
    const idx = allPhotos.findIndex(p => p.id === photoId);
    if (idx === -1) return;
    previewIndex = idx;
    showPreview();
}

function showPreview() {
    const photo = allPhotos[previewIndex];
    const overlay = document.getElementById('previewOverlay');
    const img = document.getElementById('previewImg');
    const label = document.getElementById('previewLabel');
    const price = document.getElementById('previewPrice');
    const btn = document.getElementById('previewSelectBtn');

    img.src = photo.url;
    label.textContent = `Foto #${photo.seq}`;
    price.textContent = formatPrice(photo.price);

    const isSelected = cart.some(p => p.id === photo.id);
    btn.textContent = isSelected ? 'Remover seleção' : 'Selecionar foto';
    btn.style.background = isSelected ? '' : '';

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePreview() {
    document.getElementById('previewOverlay').style.display = 'none';
    document.body.style.overflow = '';
}

/* =============================================
   CART SIDEBAR
   ============================================= */
function openCart() {
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('cartOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

/* =============================================
   CHECKOUT
   ============================================= */
function openCheckout() {
    const total = activePackage
        ? activePackage.price
        : cart.reduce((s, p) => s + p.price, 0);

    const summaryText = activePackage
        ? `${activePackage.name} — ${cart.length} foto(s) — Total: ${formatPrice(activePackage.price)}`
        : `${cart.length} foto(s) — Total: ${formatPrice(total)}`;

    document.getElementById('orderSummary').textContent = summaryText;
    document.getElementById('checkoutOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeCheckout() {
    document.getElementById('checkoutOverlay').style.display = 'none';
    document.body.style.overflow = '';
}

/* =============================================
   SUBMIT CHECKOUT
   ============================================= */
async function handleCheckoutSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const notes = document.getElementById('custNotes').value.trim();
    const errorEl = document.getElementById('formError');

    errorEl.style.display = 'none';

    if (!name || !phone) {
        errorEl.textContent = 'Preencha nome e WhatsApp obrigatoriamente.';
        errorEl.style.display = '';
        return;
    }

    const total = activePackage
        ? activePackage.price
        : cart.reduce((s, p) => s + p.price, 0);

    // Salva o pedido no banco
    const photoIds = cart.map(p => p.id);
    await db.from('orders').insert({
        customer_name: name,
        customer_phone: phone,
        customer_email: email || null,
        customer_notes: notes || null,
        photo_ids: photoIds,
        package_id: activePackage?.id || null,
        total: total,
        status: 'pending'
    });

    // Monta mensagem para WhatsApp
    const msg = buildWhatsAppMessage({ name, phone, email, notes, total });
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
}

function buildWhatsAppMessage({ name, phone, email, notes, total }) {
    const photoList = cart.map(p => {
        const eventName = p.events?.name || '';
        return `• Foto #${p.seq}${eventName ? ` (${eventName})` : ''}${activePackage ? '' : ` — ${formatPrice(p.price)}`}`;
    }).join('\n');

    const lines = [
        'Olá, Thalita! 😊',
        '',
        '*📸 Nova Solicitação de Compra*',
        '',
        `*Cliente:* ${name}`,
        `*WhatsApp:* ${phone}`,
        email ? `*E-mail:* ${email}` : null,
        '',
        activePackage
            ? `*Pacote:* ${activePackage.name} (${activePackage.quantity} fotos)`
            : null,
        `*Fotos selecionadas (${cart.length}):*`,
        photoList,
        '',
        `*💰 Total: ${formatPrice(total)}*`,
        notes ? `\n*Observações:* ${notes}` : null,
        '',
        '_Mensagem gerada pelo site._'
    ].filter(l => l !== null).join('\n');

    return lines;
}

/* =============================================
   EVENT BINDINGS
   ============================================= */
function bindEvents() {
    // Cart
    document.getElementById('cartBtn').addEventListener('click', openCart);
    document.getElementById('cartClose').addEventListener('click', closeCart);
    document.getElementById('cartOverlay').addEventListener('click', closeCart);
    document.getElementById('checkoutBtn').addEventListener('click', () => { closeCart(); openCheckout(); });

    // Checkout
    document.getElementById('checkoutClose').addEventListener('click', closeCheckout);
    document.getElementById('checkoutOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeCheckout();
    });
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckoutSubmit);

    // Preview
    document.getElementById('previewClose').addEventListener('click', closePreview);
    document.getElementById('previewPrev').addEventListener('click', () => {
        previewIndex = (previewIndex - 1 + allPhotos.length) % allPhotos.length;
        showPreview();
    });
    document.getElementById('previewNext').addEventListener('click', () => {
        previewIndex = (previewIndex + 1) % allPhotos.length;
        showPreview();
    });
    document.getElementById('previewSelectBtn').addEventListener('click', () => {
        togglePhoto(allPhotos[previewIndex].id);
        showPreview();
    });
    document.getElementById('previewOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closePreview();
    });

    // Package remove
    document.getElementById('removePackageBtn').addEventListener('click', removePackage);

    // Event filter
    document.getElementById('eventFilter').addEventListener('change', e => {
        loadPhotos(e.target.value);
        cart = [];
        activePackage = null;
        document.querySelectorAll('.package-card').forEach(el => el.classList.remove('selected'));
        updateCart();
    });
}

/* =============================================
   HELPERS
   ============================================= */
function formatPrice(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function showLoading(show) {
    document.getElementById('galleryLoading').style.display = show ? '' : 'none';
    document.getElementById('galleryGrid').style.display = show ? 'none' : '';
}

function showEmpty(show) {
    document.getElementById('galleryEmpty').style.display = show ? '' : 'none';
}
