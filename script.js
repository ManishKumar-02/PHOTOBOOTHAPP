
const STRIP_W   = 1100;
const STRIP_H   = 3800;
const PHOTO_W   = 1000;
const PHOTO_H   = 750;
const PAD_X     = 50;
const PAD_TOP   = 120;
const PHOTO_GAP = 55;


let capturedPhotos     = [];
let fCanvas            = null;
let currentScale       = 1;
let currentBorderColor = '#FFFFFF';
let currentBgImage     = '';
let isCapturing        = false;


const STICKER_FILES = [
    "Furina 1.png","Furina 2.png","Furina 3.png","Furina 4.png",
    "Ganyu 1.png","Ganyu 2.png","Ganyu 5.png",
    "Hu Tao 1.png","Hu Tao 2.png","Hu Tao 4.png",
    "Kaedehara Kazuha 1.png","Kaedehara Kazuha 2.png",
    "Kaedehara Kazuha 3.png","Kaedehara Kazuha 4.png",
    "Kaeya 1.png","Kaeya 2.png","Kaeya 3.png","Kaeya.png",
    "Mona 1.png","Mona 2.png","Neuvillette.png","Paimon 6.png",
    "Skirk 1.png","Skirk 2.png","Skirk 3.png","Skirk 4.png",
    "Tartaglia 1.png","Tartaglia 2.png","Tartaglia 3.png","Tartaglia 4.png",
    "Venti 1.png","Venti 4.png",
    "Xiao 1.png","Xiao 4.png","Xiao 5.png","Zhongli 1.png"
];
const TOTAL_SETS = 42;


const sleep = ms => new Promise(r => setTimeout(r, ms));

function showToast(msg, ms = 2200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.add('hidden'), ms);
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error('Failed: ' + src));
        img.src = src;
    });
}


function drawCoverCrop(ctx, video, dw, dh) {
    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;
    const vR = vw / vh;
    const dR = dw / dh;
    let sx, sy, sw, sh;
    if (vR > dR) {
        sh = vh; sw = vh * dR;
        sx = (vw - sw) / 2; sy = 0;
    } else {
        sw = vw; sh = vw / dR;
        sx = 0; sy = (vh - sh) / 2;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
}

function randomBetween(a, b) {
    return Math.floor(Math.random() * (b - a)) + a;
}

function pickContrastColor(hex, alpha) {
    const r   = parseInt(hex.slice(1,3) || 'ff', 16);
    const g   = parseInt(hex.slice(3,5) || 'ff', 16);
    const b   = parseInt(hex.slice(5,7) || 'ff', 16);
    const lum = 0.299*r + 0.587*g + 0.114*b;
    return `rgba(${lum > 140 ? '0,0,0' : '255,255,255'},${alpha})`;
}

// camera
const video = document.getElementById('video');
let videoStream = null;

async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = videoStream;
    } catch (err) {
        console.warn('Camera error:', err);
        showToast('📷 No camera — use Upload instead!', 3500);
    }
}
startCamera();

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
        video.srcObject = null;
    }
}

//the upload part here
document.getElementById('upload-input').addEventListener('change', function () {
    const files = Array.from(this.files).slice(0, 4);
    if (!files.length) return;
    const readers = files.map(f => new Promise(res => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.readAsDataURL(f);
    }));
    Promise.all(readers).then(urls => {
        while (urls.length < 4) urls.push(urls[urls.length - 1]);
        capturedPhotos = urls.slice(0, 4);
        stopCamera();
        goToEditMode();
    });
    this.value = '';
});


document.getElementById('start-btn').addEventListener('click', async () => {
    if (isCapturing) return;
    if (!videoStream) { showToast('No camera. Use Upload!', 2500); return; }
    isCapturing = true;
    capturedPhotos = [];

    const countdownEl = document.getElementById('countdown');
    const flashEl     = document.getElementById('flash');
    const countBar    = document.getElementById('photo-count-bar');
    const dots        = document.querySelectorAll('.shot-dot');

    countBar.classList.remove('hidden');
    dots.forEach(d => d.classList.remove('taken'));

    for (let i = 0; i < 4; i++) {
        countdownEl.classList.remove('hidden');
        for (let j = 3; j > 0; j--) {
            countdownEl.textContent = j;
            await sleep(900);
        }
        countdownEl.classList.add('hidden');

        flashEl.classList.add('flashing');

        const snap = document.createElement('canvas');
        snap.width  = PHOTO_W;
        snap.height = PHOTO_H;
        const ctx = snap.getContext('2d');
        ctx.translate(PHOTO_W, 0);
        ctx.scale(-1, 1);
        drawCoverCrop(ctx, video, PHOTO_W, PHOTO_H);

        capturedPhotos.push(snap.toDataURL('image/jpeg', 0.93));
        dots[i].classList.add('taken');
        setTimeout(() => flashEl.classList.remove('flashing'), 250);
        await sleep(800);
    }

    isCapturing = false;
    stopCamera();
    goToEditMode();
});


function goToEditMode() {
    document.getElementById('screen-camera').style.display = 'none';
    document.getElementById('screen-edit').style.display = '';
    setupFabricCanvas();
    loadAllStickers();
}



async function setupFabricCanvas() {
    if (fCanvas) { fCanvas.dispose(); fCanvas = null; }
    window.removeEventListener('resize', onResize);

    await buildAndShowStripBg();

    const scale = computeScale();
    currentScale = scale;
    const dispW  = Math.round(STRIP_W * scale);
    const dispH  = Math.round(STRIP_H * scale);

    // Size the wrapper to display dimensions
    const wrapper = document.getElementById('strip-wrapper');
    wrapper.style.width  = dispW + 'px';
    wrapper.style.height = dispH + 'px';

    // Init Fabric at display size
    fCanvas = new fabric.Canvas('edit-canvas', {
        width:  dispW,
        height: dispH,
        backgroundColor: null,
        preserveObjectStacking: true,
        enableRetinaScaling: false,
        selection: true,
        allowTouchScrolling: false,
    });

    
    fCanvas.setZoom(scale);

 
    document.addEventListener('keydown', e => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && fCanvas) {
            if (document.activeElement.tagName === 'INPUT') return;
            const obj = fCanvas.getActiveObject();
            if (obj) {
                fCanvas.remove(obj);
                fCanvas.discardActiveObject();
                fCanvas.requestRenderAll();
            }
        }
    });

    window.addEventListener('resize', onResize);
}

function computeScale() {
    const ws  = document.getElementById('workspace');
    const wsW = ws.clientWidth  - 16;
    const wsH = ws.clientHeight - 30;
    return Math.min(wsW / STRIP_W, wsH / STRIP_H, 1);
}

function onResize() {
    if (!fCanvas) return;
    const scale  = computeScale();
    currentScale = scale;
    const dispW  = Math.round(STRIP_W * scale);
    const dispH  = Math.round(STRIP_H * scale);
    document.getElementById('strip-wrapper').style.width  = dispW + 'px';
    document.getElementById('strip-wrapper').style.height = dispH + 'px';
    fCanvas.setWidth(dispW);
    fCanvas.setHeight(dispH);
    fCanvas.setZoom(scale);
    fCanvas.requestRenderAll();
}


async function buildAndShowStripBg() {
    const c   = document.createElement('canvas');
    c.width   = STRIP_W;
    c.height  = STRIP_H;
    const ctx = c.getContext('2d');

    if (currentBgImage) {
        try { ctx.drawImage(await loadImage(currentBgImage), 0, 0, STRIP_W, STRIP_H); }
        catch (_) {}
    }

    ctx.fillStyle = currentBorderColor;
    ctx.fillRect(0, 0, STRIP_W, STRIP_H);

    for (let i = 0; i < 4; i++) {
        if (!capturedPhotos[i]) continue;
        const img = await loadImage(capturedPhotos[i]);
        const y   = PAD_TOP + i * (PHOTO_H + PHOTO_GAP);
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur  = 18;
        ctx.shadowOffsetY = 6;
        ctx.drawImage(img, PAD_X, y, PHOTO_W, PHOTO_H);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    const sig = document.getElementById('user-signature').value.trim();
    if (sig) {
        ctx.font = 'bold 52px "DynaPuff", cursive';
        ctx.textAlign = 'center';
        ctx.fillStyle = pickContrastColor(currentBorderColor, 0.7);
        ctx.fillText(sig, STRIP_W / 2, STRIP_H - 70);
    }

    ctx.font = '36px "DynaPuff", cursive';
    ctx.textAlign = 'center';
    ctx.fillStyle = pickContrastColor(currentBorderColor, 0.35);
    ctx.fillText('✨ GENSHIN SNAP ✨', STRIP_W / 2, STRIP_H - 22);

    document.getElementById('photo-strip-bg').style.backgroundImage = `url(${c.toDataURL()})`;
}


let allStickerPaths = [];

function loadAllStickers() {
    const lib = document.getElementById('sticker-library');
    const msg = document.getElementById('sticker-loading-msg');
    lib.innerHTML = '';
    msg.classList.remove('hidden');
    msg.textContent = 'Loading stickers…';
    allStickerPaths = [];

    let found = 0, checked = 0;
    const total = TOTAL_SETS * STICKER_FILES.length;

    for (let s = 1; s <= TOTAL_SETS; s++) {
        for (const file of STICKER_FILES) {
            const path  = `ASSETS/Set ${s}/${file}`;
            const probe = new Image();
            probe.onload = () => {
                allStickerPaths.push(path);
                addStickerThumb(path, lib);
                found++;
                if (++checked === total) onStickersLoaded(found, msg);
            };
            probe.onerror = () => {
                if (++checked === total) onStickersLoaded(found, msg);
            };
            probe.src = path;
        }
    }
    if (total === 0) onStickersLoaded(0, msg);
}

function onStickersLoaded(found, msgEl) {
    if (found === 0) {
        msgEl.textContent = '⚠️ No stickers found — check your ASSETS folder!';
    } else {
        msgEl.textContent = `✅ ${found} stickers ready!`;
        setTimeout(() => msgEl.classList.add('hidden'), 2500);
    }
}

function addStickerThumb(path, container) {
    const thumb = document.createElement('img');
    thumb.src   = path;
    thumb.className = 'sticker-thumb';
    thumb.loading   = 'lazy';
    thumb.title     = path.split('/').pop().replace('.png', '');
    thumb.addEventListener('click', () => addStickerToCanvas(path));
    container.appendChild(thumb);
}

document.getElementById('sticker-search').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.sticker-thumb').forEach(th => {
        th.style.display = (!q || th.title.toLowerCase().includes(q)) ? '' : 'none';
    });
});


function addStickerToCanvas(path) {
    fabric.Image.fromURL(path, (fImg) => {
        if (!fImg) { showToast('Failed to load sticker'); return; }
        const scale = 280 / (fImg.width || 280);
        fImg.set({
            left:  randomBetween(PAD_X + 60, PAD_X + PHOTO_W - 320),
            top:   randomBetween(PAD_TOP, PAD_TOP + 900),
            scaleX: scale, scaleY: scale,
            cornerColor: '#ff85a2', cornerSize: 28,
            transparentCorners: false,
            borderColor: '#ff85a2', borderScaleFactor: 2,
        });
        fCanvas.add(fImg);
        fCanvas.setActiveObject(fImg);
        fCanvas.requestRenderAll();
    }, { crossOrigin: 'anonymous' });
}

document.querySelectorAll('.emoji-item').forEach(el => {
    el.addEventListener('click', () => {
        const txt = new fabric.Text(el.dataset.e, {
            fontSize: 180,
            left: randomBetween(PAD_X + 60, PAD_X + 600),
            top:  randomBetween(PAD_TOP + 50, PAD_TOP + 600),
            cornerColor: '#ff85a2', cornerSize: 28,
            transparentCorners: false,
            borderColor: '#ff85a2', borderScaleFactor: 2,
        });
        fCanvas.add(txt);
        fCanvas.setActiveObject(txt);
        fCanvas.requestRenderAll();
    });
});

const fontSlider      = document.getElementById('font-size-slider');
const fontDisplay     = document.getElementById('font-size-display');
const textColorPicker = document.getElementById('text-color-picker');

fontSlider.addEventListener('input', function () {
    fontDisplay.textContent = this.value;
    const obj = fCanvas?.getActiveObject();
    if (obj && (obj.type === 'text' || obj.type === 'i-text')) {
        obj.set('fontSize', parseInt(this.value));
        fCanvas.requestRenderAll();
    }
});

document.getElementById('add-text-btn').addEventListener('click', () => {
    const val = document.getElementById('custom-text-input').value.trim();
    if (!val) { showToast('Type something first!'); return; }
    const txt = new fabric.IText(val, {
        fontSize: parseInt(fontSlider.value),
        fill: textColorPicker.value,
        fontFamily: 'DynaPuff, cursive',
        left: randomBetween(PAD_X + 60, PAD_X + 600),
        top:  randomBetween(PAD_TOP + 50, PAD_TOP + 600),
        cornerColor: '#ff85a2', cornerSize: 28,
        transparentCorners: false,
        borderColor: '#ff85a2', borderScaleFactor: 2,
    });
    fCanvas.add(txt);
    fCanvas.setActiveObject(txt);
    fCanvas.requestRenderAll();
});

document.getElementById('delete-selected-btn').addEventListener('click', () => {
    const obj = fCanvas?.getActiveObject();
    if (!obj) { showToast('Tap something on the strip first!'); return; }
    fCanvas.remove(obj);
    fCanvas.discardActiveObject();
    fCanvas.requestRenderAll();
});


document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.remove('hidden');
    });
});


document.querySelectorAll('.border-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        currentBorderColor = this.dataset.color;
        document.querySelectorAll('.border-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        buildAndShowStripBg();
    });
});

document.querySelectorAll('.bg-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        currentBgImage = this.dataset.bg;
        document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        buildAndShowStripBg();
    });
});


document.getElementById('retake-btn').addEventListener('click', () => {
    if (fCanvas) { fCanvas.dispose(); fCanvas = null; }
    window.removeEventListener('resize', onResize);
    capturedPhotos = [];
    currentBorderColor = '#FFFFFF';
    currentBgImage = '';
    document.getElementById('photo-count-bar').classList.add('hidden');
    document.querySelectorAll('.shot-dot').forEach(d => d.classList.remove('taken'));
    document.getElementById('screen-edit').style.display = 'none';
    document.getElementById('screen-camera').style.display = '';
    startCamera();
});


document.getElementById('save-btn').addEventListener('click', async function () {
    const btn = this;
    btn.textContent = 'SAVING…';
    btn.disabled = true;

    try {
        const out = document.getElementById('output-canvas');
        out.width  = STRIP_W;
        out.height = STRIP_H;
        const ctx  = out.getContext('2d');
        ctx.clearRect(0, 0, STRIP_W, STRIP_H);

        if (currentBgImage) {
            try { ctx.drawImage(await loadImage(currentBgImage), 0, 0, STRIP_W, STRIP_H); }
            catch (_) {}
        }

        ctx.fillStyle = currentBorderColor;
        ctx.fillRect(0, 0, STRIP_W, STRIP_H);

        for (let i = 0; i < 4; i++) {
            if (!capturedPhotos[i]) continue;
            const p = await loadImage(capturedPhotos[i]);
            const y = PAD_TOP + i * (PHOTO_H + PHOTO_GAP);
            ctx.shadowColor = 'rgba(0,0,0,0.18)';
            ctx.shadowBlur  = 18; ctx.shadowOffsetY = 6;
            ctx.drawImage(p, PAD_X, y, PHOTO_W, PHOTO_H);
            ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        }

        
        const savedScale = currentScale;
        fCanvas.setZoom(1);
        fCanvas.setWidth(STRIP_W);
        fCanvas.setHeight(STRIP_H);
        fCanvas.requestRenderAll();
        const stickerDataURL = fCanvas.toDataURL({ format: 'png', multiplier: 1 });
        fCanvas.setZoom(savedScale);
        fCanvas.setWidth(Math.round(STRIP_W * savedScale));
        fCanvas.setHeight(Math.round(STRIP_H * savedScale));
        fCanvas.requestRenderAll();

        ctx.drawImage(await loadImage(stickerDataURL), 0, 0, STRIP_W, STRIP_H);

        const sig = document.getElementById('user-signature').value.trim();
        if (sig) {
            ctx.font = 'bold 52px "DynaPuff", cursive';
            ctx.textAlign = 'center';
            ctx.fillStyle = pickContrastColor(currentBorderColor, 0.75);
            ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8;
            ctx.fillText(sig, STRIP_W / 2, STRIP_H - 70);
            ctx.shadowBlur = 0;
        }

        ctx.font = '34px "DynaPuff", cursive';
        ctx.textAlign = 'center';
        ctx.fillStyle = pickContrastColor(currentBorderColor, 0.35);
        ctx.fillText('✨ GENSHIN SNAP ✨', STRIP_W / 2, STRIP_H - 22);

        const link    = document.createElement('a');
        link.download = `GenshinSnap_${Date.now()}.png`;
        link.href     = out.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('🎉 Saved! Check your downloads!', 3000);

    } catch (err) {
        console.error('Save error:', err);
        showToast('❌ Save failed — check the console.', 4000);
    } finally {
        btn.textContent = 'SAVE';
        btn.disabled    = false;
    }
});
