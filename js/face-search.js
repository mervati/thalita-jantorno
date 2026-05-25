/* =============================================
   FACE SEARCH — Buscar minhas fotos
   Usa @vladmandic/face-api (roda no browser)
   ============================================= */

const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const FACE_THRESHOLD = 0.45;

let faceApiReady   = false;
let faceApiLoading = false;
let cameraStream   = null;

/* =============================================
   CARREGAR MODELOS (lazy)
   ============================================= */
async function ensureFaceApi() {
    if (faceApiReady) return true;

    if (faceApiLoading) {
        await new Promise(resolve => {
            const t = setInterval(() => {
                if (!faceApiLoading) { clearInterval(t); resolve(); }
            }, 150);
        });
        return faceApiReady;
    }

    faceApiLoading = true;

    try {
        if (typeof faceapi === 'undefined') {
            setProgress(0.05, 'Baixando biblioteca de IA...');
            await loadScript('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js');
        }

        if (typeof faceapi === 'undefined') {
            throw new Error('Biblioteca face-api não carregou.');
        }

        setProgress(0.1, 'Carregando modelos de reconhecimento facial...');

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
        ]);

        faceApiReady   = true;
        faceApiLoading = false;
        return true;
    } catch (e) {
        console.error('[FaceSearch] Erro ao carregar modelos:', e);
        faceApiLoading = false;
        return false;
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src     = src;
        s.onload  = resolve;
        s.onerror = () => reject(new Error('Falha ao carregar: ' + src));
        document.head.appendChild(s);
    });
}

/* =============================================
   DROPDOWN
   ============================================= */
function toggleFaceDropdown(e) {
    e.stopPropagation();
    document.getElementById('faceDropdown').classList.toggle('open');
}

function closeFaceDropdown() {
    document.getElementById('faceDropdown')?.classList.remove('open');
}

/* =============================================
   CÂMERA
   ============================================= */
async function openCamera() {
    closeFaceDropdown();
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        document.getElementById('cameraVideo').srcObject = cameraStream;
        document.getElementById('cameraOverlay').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (_) {
        alert('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
}

function closeCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    document.getElementById('cameraOverlay').style.display = 'none';
    document.body.style.overflow = '';
}

function capturePhoto() {
    const video  = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => { closeCamera(); startFaceSearch(blob); }, 'image/jpeg', 0.92);
}

/* =============================================
   UPLOAD
   ============================================= */
function openFaceUpload() {
    closeFaceDropdown();
    document.getElementById('faceFileInput').click();
}

/* =============================================
   BUSCA PRINCIPAL
   ============================================= */
async function startFaceSearch(imageBlob) {
    const progress     = document.getElementById('faceSearchProgress');
    const filterBanner = document.getElementById('faceFilterBanner');

    filterBanner.style.display = 'none';
    progress.style.display     = '';
    setProgress(0, 'Iniciando...');

    const ok = await ensureFaceApi();
    if (!ok) {
        progress.style.display = 'none';
        alert('Não foi possível carregar os modelos de reconhecimento facial.\nVerifique sua conexão com a internet e tente novamente.');
        return;
    }

    setProgress(0.15, 'Detectando rosto na foto...');

    let queryImg;
    try {
        queryImg = await blobToImage(imageBlob);
    } catch (e) {
        progress.style.display = 'none';
        alert('Erro ao processar a imagem enviada. Tente outro arquivo.');
        return;
    }

    // Detecta TODOS os rostos da foto enviada
    const queryDets = await faceapi
        .detectAllFaces(queryImg, new faceapi.TinyFaceDetectorOptions({ inputSize: 608 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

    if (!queryDets || !queryDets.length) {
        progress.style.display = 'none';
        alert('Nenhum rosto foi detectado na foto enviada.\n\nDicas:\n• Use uma foto com rosto bem visível e centralizado\n• Boa iluminação ajuda muito\n• Evite óculos escuros ou máscaras');
        return;
    }

    let selectedDescriptor;

    if (queryDets.length === 1) {
        // Só um rosto — segue automaticamente
        selectedDescriptor = queryDets[0].descriptor;
        await searchGallery(selectedDescriptor);
    } else {
        // Mais de um rosto — pergunta qual é o usuário
        progress.style.display = 'none';
        selectedDescriptor = await pickFace(queryImg, queryDets);
        if (!selectedDescriptor) return; // usuário cancelou
        progress.style.display = '';
        await searchGallery(selectedDescriptor);
    }
}

/* =============================================
   SELEÇÃO DE ROSTO (quando há mais de um)
   ============================================= */
function pickFace(img, detections) {
    return new Promise(resolve => {
        const grid = document.getElementById('faceSelectGrid');
        grid.innerHTML = '';

        detections.forEach((det, i) => {
            const thumb = extractFaceThumbnail(img, det.detection.box);
            const btn   = document.createElement('button');
            btn.className = 'face-thumb-btn';
            btn.innerHTML = `<img src="${thumb}" alt="Rosto ${i + 1}">`;
            btn.addEventListener('click', () => {
                closeFaceSelect();
                resolve(det.descriptor);
            });
            grid.appendChild(btn);
        });

        document.getElementById('faceSelectClose').onclick = () => {
            closeFaceSelect();
            resolve(null);
        };

        document.getElementById('faceSelectOverlay').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });
}

function closeFaceSelect() {
    document.getElementById('faceSelectOverlay').style.display = 'none';
    document.body.style.overflow = '';
}

function extractFaceThumbnail(img, box) {
    const pad = Math.max(box.width, box.height) * 0.35;
    const x   = Math.max(0, box.x - pad);
    const y   = Math.max(0, box.y - pad);
    const w   = Math.min(img.width  - x, box.width  + pad * 2);
    const h   = Math.min(img.height - y, box.height + pad * 2);

    const canvas = document.createElement('canvas');
    canvas.width  = 120;
    canvas.height = 120;
    canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, 120, 120);
    return canvas.toDataURL('image/jpeg', 0.85);
}

/* =============================================
   BUSCA NA GALERIA
   ============================================= */
async function searchGallery(qDesc) {
    const progress = document.getElementById('faceSearchProgress');
    progress.style.display = '';

    const photos  = galleryPhotos;
    const matches = [];
    let errors    = 0;

    for (let i = 0; i < photos.length; i++) {
        const pct = 0.2 + (i + 1) / photos.length * 0.8;
        setProgress(pct, `Verificando foto ${i + 1} de ${photos.length}...`);

        try {
            const img  = await urlToImage(photos[i].url, true);
            const dets = await faceapi
                .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (dets && dets.length > 0) {
                const isMatch = dets.some(d => faceapi.euclideanDistance(qDesc, d.descriptor) < FACE_THRESHOLD);
                if (isMatch) matches.push(photos[i]);
            }
        } catch (e) {
            errors++;
        }

        if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
    }

    progress.style.display = 'none';

    if (errors > 0 && errors === photos.length) {
        alert('Não foi possível verificar as fotos deste evento.\nIsso pode ser um problema de CORS. Contate o suporte.');
        return;
    }

    applyFaceFilter(matches);
}

/* =============================================
   FILTRAR GALERIA COM RESULTADOS
   ============================================= */
function applyFaceFilter(matches) {
    const banner = document.getElementById('faceFilterBanner');
    const text   = document.getElementById('faceFilterText');
    const grid   = document.getElementById('galleryGrid');
    const empty  = document.getElementById('galleryEmpty');

    if (!matches.length) {
        banner.style.display = 'none';
        empty.style.display  = '';
        empty.querySelector('p').textContent =
            'Nenhuma foto com seu rosto foi encontrada neste evento.';
        grid.innerHTML = '';
        return;
    }

    const count = matches.length;
    text.textContent     = `${count} foto${count !== 1 ? 's' : ''} encontrada${count !== 1 ? 's' : ''} com seu rosto`;
    banner.style.display = 'flex';
    empty.style.display  = 'none';

    grid.innerHTML = matches.map(photo => `
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

    cart.forEach(p => {
        document.getElementById(`card-${p.id}`)?.classList.add('selected');
    });
}

function clearFaceFilter() {
    document.getElementById('faceFilterBanner').style.display = 'none';
    document.getElementById('galleryEmpty').style.display     = 'none';
    renderGallery(galleryPhotos);
}

/* =============================================
   HELPERS
   ============================================= */
function setProgress(ratio, text) {
    const bar = document.getElementById('faceProgressBar');
    const txt = document.getElementById('faceProgressText');
    if (bar) bar.style.width = `${Math.round(ratio * 100)}%`;
    if (txt) txt.textContent = text;
}

function blobToImage(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar blob')); };
        img.src = url;
    });
}

function urlToImage(src, bustCache = false) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error('Falha ao carregar: ' + src));
        img.src = bustCache
            ? src + (src.includes('?') ? '&' : '?') + '_face=1'
            : src;
    });
}

/* =============================================
   BINDINGS
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('faceSearchBtn')?.addEventListener('click', toggleFaceDropdown);
    document.getElementById('cameraSearchBtn')?.addEventListener('click', openCamera);
    document.getElementById('uploadSearchBtn')?.addEventListener('click', openFaceUpload);
    document.getElementById('captureBtn')?.addEventListener('click', capturePhoto);
    document.getElementById('cameraClose')?.addEventListener('click', closeCamera);
    document.getElementById('cameraOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeCamera();
    });
    document.getElementById('faceFileInput')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) startFaceSearch(file);
        e.target.value = '';
    });
    document.getElementById('faceClearBtn')?.addEventListener('click', clearFaceFilter);
    document.getElementById('faceSelectOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) { closeFaceSelect(); }
    });
    document.addEventListener('click', closeFaceDropdown);
});
