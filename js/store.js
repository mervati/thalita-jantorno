/* =============================================
   ESTADO GLOBAL
   ============================================= */
let allPhotos    = [];   // todas as fotos do banco
let galleryPhotos = [];  // fotos do evento atual (para preview)
let allPackages  = [];
let allEvents    = [];
let cart         = [];
let activePackage  = null;
let activeCoupon   = null;
let currentEventId = null;

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', async () => {
    await loadPackages();
    await Promise.all([loadAllEvents(), loadAllPhotos()]);
    renderEventCards();
    bindEvents();
});

/* =============================================
   CARREGAR DADOS
   ============================================= */
async function loadAllEvents() {
    const { data } = await db
        .from('events')
        .select('*')
        .eq('active', true)
        .order('date', { ascending: false });
    allEvents = data || [];
}

async function loadAllPhotos() {
    const { data } = await db
        .from('photos')
        .select('*, events(name)')
        .eq('active', true)
        .order('created_at', { ascending: true });
    allPhotos = data || [];
}

async function loadPackages() {
    const { data } = await db
        .from('packages')
        .select('*')
        .eq('active', true)
        .order('quantity', { ascending: true });

    allPackages = data || [];
    if (allPackages.length) renderPackages(allPackages);
    document.getElementById('packagesSection').style.display = 'none';
}

/* =============================================
   RENDERIZAR EVENTOS (cards)
   ============================================= */
function renderEventCards() {
    const grid = document.getElementById('eventsGrid');

    const eventsWithPhotos = allEvents.filter(ev =>
        allPhotos.some(p => p.event_id === ev.id)
    );

    if (!eventsWithPhotos.length) {
        grid.innerHTML = `
            <div class="events-empty">
                <div class="empty-icon">📷</div>
                <p>Nenhum evento disponível no momento.</p>
                <small>Verifique em breve ou entre em contato.</small>
            </div>`;
        return;
    }

    grid.innerHTML = eventsWithPhotos.map(ev => {
        const evPhotos = allPhotos.filter(p => p.event_id === ev.id);
        const count    = evPhotos.length;
        const path     = evPhotos[0]?.storage_path || '';

        return `
        <div class="event-card" onclick="selectEvent('${ev.id}')">
            <div class="event-card-img" data-cover-path="${path}">
                <div class="event-card-overlay"></div>
                <div class="event-card-badge">${count} foto${count !== 1 ? 's' : ''}</div>
            </div>
            <div class="event-card-body">
                <h3 class="event-card-name">${ev.name}</h3>
                <div class="event-card-meta">
                    ${ev.date        ? `<span class="event-card-date">${formatDate(ev.date)}</span>` : ''}
                    ${ev.description ? `<span class="event-card-loc">${ev.description}</span>`       : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // Carrega as capas dos eventos com URL assinada de 5 min (assíncrono, não bloqueia render)
    document.querySelectorAll('.event-card-img[data-cover-path]').forEach(async el => {
        const path = el.dataset.coverPath;
        if (!path) return;
        try {
            const url = await signedUrl(path, 300);
            el.style.backgroundImage = `url('${url}')`;
        } catch (_) {}
    });
}

/* =============================================
   NAVEGAR PARA EVENTO
   ============================================= */
function selectEvent(eventId) {
    currentEventId = eventId;
    const ev = allEvents.find(e => e.id === eventId);

    // Filtra e numera fotos deste evento
    const photos = allPhotos
        .filter(p => p.event_id === eventId)
        .map((p, i) => ({ ...p, seq: i + 1 }));

    // Alterna seções
    document.getElementById('eventsSection').style.display  = 'none';
    document.getElementById('gallerySection').style.display = '';
    if (allPackages.length) document.getElementById('packagesSection').style.display = '';

    // Nome do evento no header da galeria
    document.getElementById('galleryEventName').textContent = ev?.name || '';

    // Limpa carrinho
    cart = [];
    activePackage = null;
    activeCoupon  = null;
    document.querySelectorAll('.package-card').forEach(el => el.classList.remove('selected'));
    document.getElementById('couponInput').value    = '';
    document.getElementById('couponFeedback').textContent = '';
    updateCart();

    renderGallery(photos);
}

function backToEvents() {
    currentEventId = null;
    document.getElementById('eventsSection').style.display   = '';
    document.getElementById('gallerySection').style.display  = 'none';
    document.getElementById('packagesSection').style.display = 'none';

    cart = [];
    activePackage = null;
    activeCoupon  = null;
    updateCart();
}

/* =============================================
   RENDERIZAR PACOTES
   ============================================= */
function renderPackages(packages) {
    const track = document.getElementById('packagesTrack');
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
   MARCA D'ÁGUA
   ============================================= */
let wmObserver = null;

function loadImageCors(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src = url; // URL assinada já é única — sem cache-bust
    });
}

async function signedUrl(storagePath, expiresIn = 30) {
    const { data, error } = await db.storage
        .from('photos')
        .createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) throw new Error('URL assinada falhou: ' + storagePath);
    return data.signedUrl;
}

function applyWatermark(ctx, w, h) {
    const size  = Math.max(16, Math.min(w, h) / 18);
    const text  = 'Thalita Jantorno';
    const stepX = size * 6.5;
    const stepY = size * 4;

    ctx.save();
    ctx.font         = `bold ${size}px Arial, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.shadowColor  = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur   = 4;

    // Primeira camada — diagonal -30°
    ctx.globalAlpha = 0.45;
    for (let y = -stepY * 2; y < h + stepY * 2; y += stepY) {
        for (let x = -stepX * 2; x < w + stepX * 2; x += stepX) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-Math.PI / 6);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        }
    }

    // Segunda camada — diagonal +30° (offset) para cobrir brechas
    ctx.globalAlpha = 0.25;
    for (let y = -stepY * 2 + stepY / 2; y < h + stepY * 2; y += stepY) {
        for (let x = -stepX * 2 + stepX / 2; x < w + stepX * 2; x += stepX) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 6);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        }
    }

    ctx.restore();
}

async function renderWatermark(url, canvas, isThumb = false) {
    try {
        const img = await loadImageCors(url);
        const W = img.naturalWidth;
        const H = img.naturalHeight;

        if (isThumb) {
            // Miniatura: recorta para cobrir o canvas (object-fit: cover)
            const TW = 600, TH = 450; // resolução interna do thumb
            canvas.width  = TW;
            canvas.height = TH;
            const ctx = canvas.getContext('2d');
            const ratio = Math.max(TW / W, TH / H);
            const sw = TW / ratio, sh = TH / ratio;
            const sx = (W - sw) / 2, sy = (H - sh) / 2;
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TW, TH);
            applyWatermark(ctx, TW, TH);
        } else {
            // Preview: imagem em tamanho real
            canvas.width  = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            applyWatermark(ctx, W, H);
        }
    } catch (e) {
        console.warn('[Watermark] falha ao renderizar:', url, e);
    }
}

function setupWatermarkObserver() {
    if (wmObserver) wmObserver.disconnect();
    wmObserver = new IntersectionObserver(entries => {
        entries.forEach(async entry => {
            if (!entry.isIntersecting) return;
            const canvas = entry.target;
            wmObserver.unobserve(canvas);
            if (canvas.dataset.rendered) return;
            canvas.dataset.rendered = '1';

            const photo = galleryPhotos[parseInt(canvas.dataset.idx)];
            if (!photo) return;

            try {
                // Gera URL assinada de 30s só no momento do carregamento
                const url = await signedUrl(photo.storage_path, 30);
                renderWatermark(url, canvas, true);
            } catch (e) {
                console.warn('[Gallery] falha ao assinar URL:', e);
            }
        });
    }, { rootMargin: '250px' });

    document.querySelectorAll('.photo-canvas').forEach(c => wmObserver.observe(c));
}

/* =============================================
   RENDERIZAR GALERIA
   ============================================= */
function renderGallery(photos) {
    galleryPhotos = photos;
    const grid = document.getElementById('galleryGrid');

    if (!photos.length) {
        showEmpty(true);
        grid.innerHTML = '';
        return;
    }
    showEmpty(false);

    grid.innerHTML = photos.map((photo, idx) => `
        <div class="photo-card" id="card-${photo.id}" data-id="${photo.id}" onclick="togglePhoto('${photo.id}')">
            <canvas class="photo-canvas" data-idx="${idx}"></canvas>
            <div class="photo-overlay">
                <span class="photo-num">Foto #${photo.seq}</span>
                <span class="photo-price-tag">${formatPrice(photo.price)}</span>
            </div>
            <div class="photo-check">✓</div>
            <button class="photo-preview-btn" onclick="openPreview('${photo.id}', event)" title="Ver ampliada">⤢</button>
        </div>
    `).join('');

    setupWatermarkObserver();
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
            if (cart.length >= activePackage.quantity) cart.shift();
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
    if (activePackage?.id === pkgId) { removePackage(); return; }

    const pkg = allPackages.find(p => p.id === pkgId);
    if (!pkg) return;

    activePackage = pkg;
    cart = [];

    document.querySelectorAll('.package-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === pkgId);
    });
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
    const itemsEl     = document.getElementById('cartItems');
    const totalEl     = document.getElementById('cartTotalValue');
    const badgeEl     = document.getElementById('cartBadge');
    const countEl     = document.getElementById('selectedCount');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const pkgInfo     = document.getElementById('cartPackageInfo');

    // Badge
    if (cart.length > 0) {
        badgeEl.style.display = 'flex';
        badgeEl.textContent   = cart.length;
    } else {
        badgeEl.style.display = 'none';
    }

    // Contador
    if (cart.length > 0) {
        countEl.style.display = 'inline';
        countEl.textContent   = `${cart.length} selecionada(s)`;
    } else {
        countEl.style.display = 'none';
    }

    // Info do pacote
    if (activePackage) {
        pkgInfo.style.display = '';
        document.getElementById('packageTagName').textContent = `${activePackage.name} — ${formatPrice(activePackage.price)}`;
        const fill      = document.getElementById('packageProgressFill');
        const hint      = document.getElementById('packageHint');
        const pct       = (cart.length / activePackage.quantity) * 100;
        fill.style.width = `${pct}%`;
        const remaining = activePackage.quantity - cart.length;
        hint.textContent = remaining > 0 ? `Selecione mais ${remaining} foto(s)` : 'Pacote completo! ✓';
    } else {
        pkgInfo.style.display = 'none';
    }

    // Lista de itens
    if (cart.length === 0) {
        itemsEl.innerHTML = '<p class="cart-empty">Nenhuma foto selecionada ainda</p>';
    } else {
        itemsEl.innerHTML = cart.map(photo => {
            // Reutiliza canvas já renderizado da galeria (sem nova requisição de rede)
            const gc = document.querySelector(`#card-${photo.id} .photo-canvas`);
            const thumbSrc = (gc && gc.dataset.rendered) ? gc.toDataURL('image/jpeg', 0.4) : '';
            return `
            <div class="cart-item">
                ${thumbSrc
                    ? `<img class="cart-item-thumb" src="${thumbSrc}" alt="Foto ${photo.seq}">`
                    : `<div class="cart-item-thumb"></div>`}
                <div class="cart-item-info">
                    <div class="cart-item-label">Foto #${photo.seq}</div>
                    <div class="cart-item-price">${activePackage ? 'inclusa no pacote' : formatPrice(photo.price)}</div>
                </div>
                <button class="cart-item-remove" onclick="togglePhoto('${photo.id}')" title="Remover">✕</button>
            </div>`;
        }).join('');
    }

    // Subtotal e desconto
    let subtotal = 0;
    if (activePackage) {
        subtotal = cart.length === activePackage.quantity ? activePackage.price : 0;
    } else {
        subtotal = cart.reduce((sum, p) => sum + p.price, 0);
    }

    const discount = calcDiscount(subtotal);
    const total    = Math.max(0, subtotal - discount);

    const subtotalRow = document.getElementById('cartSubtotalRow');
    const discountRow = document.getElementById('cartDiscountRow');
    if (activeCoupon && discount > 0) {
        subtotalRow.style.display = 'flex';
        document.getElementById('cartSubtotalValue').textContent  = formatPrice(subtotal);
        discountRow.style.display = 'flex';
        document.getElementById('cartDiscountLabel').textContent  = `Cupom (${activeCoupon.code})`;
        document.getElementById('cartDiscountValue').textContent  = `— ${formatPrice(discount)}`;
    } else {
        subtotalRow.style.display = 'none';
        discountRow.style.display = 'none';
    }

    totalEl.textContent = formatPrice(total);

    const canCheckout  = activePackage ? cart.length === activePackage.quantity : cart.length > 0;
    checkoutBtn.disabled = !canCheckout;
}

function calcDiscount(subtotal) {
    if (!activeCoupon) return 0;
    if (activeCoupon.type === 'percent') return subtotal * (activeCoupon.value / 100);
    return Math.min(activeCoupon.value, subtotal);
}

async function applyCoupon() {
    const code     = document.getElementById('couponInput').value.trim().toUpperCase();
    const feedback = document.getElementById('couponFeedback');
    if (!code) return;

    feedback.textContent = 'Verificando...';
    feedback.className   = 'coupon-feedback';

    const { data } = await db.from('coupons').select('*').eq('active', true).ilike('code', code).single();

    if (!data) {
        feedback.textContent = '✕ Cupom inválido ou expirado.';
        feedback.className   = 'coupon-feedback coupon-error';
        activeCoupon = null;
    } else {
        const today = new Date().toISOString().split('T')[0];
        if (data.starts_at && today < data.starts_at) {
            const d = data.starts_at.split('-').reverse().join('/');
            feedback.textContent = `✕ Cupom válido somente a partir de ${d}.`;
            feedback.className   = 'coupon-feedback coupon-error';
            activeCoupon = null;
        } else if (data.expires_at && today > data.expires_at) {
            feedback.textContent = '✕ Cupom expirado.';
            feedback.className   = 'coupon-feedback coupon-error';
            activeCoupon = null;
        } else {
            activeCoupon = data;
            const desc   = data.type === 'percent' ? `${data.value}% de desconto` : `${formatPrice(data.value)} de desconto`;
            feedback.textContent = `✓ Cupom aplicado! ${desc}`;
            feedback.className   = 'coupon-feedback coupon-success';
        }
    }
    updateCart();
}

/* =============================================
   PREVIEW MODAL
   ============================================= */
let previewIndex = 0;

function openPreview(photoId, e) {
    e?.stopPropagation();
    const idx = galleryPhotos.findIndex(p => p.id === photoId);
    if (idx === -1) return;
    previewIndex = idx;
    showPreview();
}

async function showPreview() {
    const photo  = galleryPhotos[previewIndex];
    const canvas = document.getElementById('previewImg');

    // Limpa canvas enquanto gera URL e carrega
    canvas.width = 4; canvas.height = 3;

    document.getElementById('previewLabel').textContent  = `Foto #${photo.seq}`;
    document.getElementById('previewPrice').textContent  = formatPrice(photo.price);

    const isSelected = cart.some(p => p.id === photo.id);
    document.getElementById('previewSelectBtn').textContent = isSelected ? 'Remover seleção' : 'Selecionar foto';

    document.getElementById('previewOverlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    try {
        // URL assinada de 30s — só válida durante o carregamento
        const url = await signedUrl(photo.storage_path, 30);
        renderWatermark(url, canvas, false);
    } catch (e) {
        console.warn('[Preview] falha ao assinar URL:', e);
    }
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
    const subtotal = activePackage
        ? activePackage.price
        : cart.reduce((s, p) => s + p.price, 0);
    const discount = calcDiscount(subtotal);
    const total    = Math.max(0, subtotal - discount);

    const summaryText = activePackage
        ? `${activePackage.name} — ${cart.length} foto(s) — Total: ${formatPrice(total)}`
        : `${cart.length} foto(s) — Total: ${formatPrice(total)}`;

    document.getElementById('orderSummary').textContent     = summaryText;
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

    const name    = document.getElementById('custName').value.trim();
    const phone   = document.getElementById('custPhone').value.trim();
    const email   = document.getElementById('custEmail').value.trim();
    const notes   = document.getElementById('custNotes').value.trim();
    const errorEl = document.getElementById('formError');

    errorEl.style.display = 'none';

    if (!name || !phone) {
        errorEl.textContent   = 'Preencha nome e WhatsApp obrigatoriamente.';
        errorEl.style.display = '';
        return;
    }

    const subtotal    = activePackage ? activePackage.price : cart.reduce((s, p) => s + p.price, 0);
    const discount    = calcDiscount(subtotal);
    const total       = Math.max(0, subtotal - discount);
    const orderNumber = Math.floor(100000 + Math.random() * 900000);
    const photoIds    = cart.map(p => p.id);

    await db.from('orders').insert({
        customer_name:  name,
        customer_phone: phone,
        customer_email: email || null,
        customer_notes: notes || null,
        photo_ids:      photoIds,
        package_id:     activePackage?.id || null,
        coupon_code:    activeCoupon?.code || null,
        discount_amount: discount,
        total:          total,
        order_number:   orderNumber,
        status:         'pending'
    });

    const msg = buildWhatsAppMessage({ name, phone, email, notes, total, orderNumber, subtotal, discount });
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

function buildWhatsAppMessage({ name, phone, email, notes, total, orderNumber, subtotal, discount }) {
    const numFormatado = orderNumber ? String(orderNumber) : '------';

    const photoList = cart.map(p => {
        const eventName = p.events?.name || '';
        const price     = activePackage ? '' : ` — ${formatPrice(p.price)}`;
        return `* Foto #${p.seq}${eventName ? ` (${eventName})` : ''}${price}`;
    }).join('\n');

    const lines = [
        `Olá, ${name}!`,
        'Obrigada pelo pedido.',
        '',
        `*Pedido #${numFormatado} — Thalita Jantorno Fotografia*`,
        '',
        `*Cliente:* ${name}`,
        `*WhatsApp:* ${phone}`,
        `*E-mail:* ${email || ''}`,
        '',
        activePackage ? `Pacote: ${activePackage.name} (${activePackage.quantity} fotos)` : null,
        `Fotos selecionadas (${cart.length}):`,
        photoList,
        '',
        activeCoupon && discount > 0 ? `Subtotal: ${formatPrice(subtotal)}` : null,
        activeCoupon && discount > 0 ? `Cupom (${activeCoupon.code}): — ${formatPrice(discount)}` : null,
        `Total: ${formatPrice(total)}`,
        notes ? `\nObservações: ${notes}` : null,
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
        previewIndex = (previewIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
        showPreview();
    });
    document.getElementById('previewNext').addEventListener('click', () => {
        previewIndex = (previewIndex + 1) % galleryPhotos.length;
        showPreview();
    });
    document.getElementById('previewSelectBtn').addEventListener('click', () => {
        togglePhoto(galleryPhotos[previewIndex].id);
        showPreview();
    });
    document.getElementById('previewOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closePreview();
    });

    // Package remove
    document.getElementById('removePackageBtn').addEventListener('click', removePackage);

    // Cupom
    document.getElementById('applyCouponBtn').addEventListener('click', applyCoupon);
    document.getElementById('couponInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
    });
    document.getElementById('couponInput').addEventListener('blur', () => {
        if (document.getElementById('couponInput').value.trim()) applyCoupon();
    });
    document.getElementById('couponInput').addEventListener('input', e => {
        e.target.value = e.target.value.toUpperCase();
    });

    // Voltar para eventos
    document.getElementById('backToEventsBtn').addEventListener('click', backToEvents);

    // Proteção: bloqueia menu de contexto e arraste na galeria e no preview
    ['galleryGrid', 'previewOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('contextmenu', e => e.preventDefault());
        el.addEventListener('dragstart',   e => e.preventDefault());
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

function showEmpty(show) {
    document.getElementById('galleryEmpty').style.display = show ? '' : 'none';
}
