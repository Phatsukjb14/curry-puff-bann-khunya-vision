// ============================================================
//  Machine Vision Counter — script.js  v2.2.0
//  แก้ไข: piecesPerBox, updateResults, autoCrop, drawBoundingBoxes
// ============================================================

// ---------- Product Map ----------
const productMap = {
  "CHK": "ไก่",
  "MSH": "เห็ด",
  "MPK": "หมูสับ",
  "CFL": "หมูหยองพริกเผา",
  "MBN": "ถั่วเหลือง",
  "TRO": "เผือก",
  "PIN": "สับปะรด",
  "UNKNOWN": "ไม่ระบุ"
};

// ---------- STATE ----------
let imageFiles   = [];   // ไฟล์ภาพทั้งหมด
let imageResults = [];   // ผลลัพธ์ของแต่ละภาพ
let imageSources = [];   // 'upload' | 'camera'
let currentIndex = 0;
let historyData  = [];
let detectCount  = 0;

// ---------- CAMERA STATE ----------
let currentMode    = 'upload';
let camStream      = null;
let currentDeviceId = '';

// ---------- BACKEND CONFIG ----------
const BACKEND_URL = 'http://127.0.0.1:5000';
let backendOnline = false;

// ✅ FIX: Helper — อ่านค่า piecesPerBox จาก input (ป้องกัน hard-code)
function getPiecesPerBox() {
  const val = parseInt(document.getElementById('piecesPerBox')?.value, 10);
  return (Number.isFinite(val) && val > 0) ? val : 30;
}

// ============================================================
//  BACKEND HEALTH CHECK
// ============================================================
async function checkBackend() {
  const dot  = document.getElementById('backendDot');
  const text = document.getElementById('backendText');
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      backendOnline = true;
      if (dot)  { dot.textContent  = '🟢'; dot.title = 'Backend online'; }
      if (text) { text.textContent = `Backend: พร้อม (RAM ${data.ram_used})`; text.style.color = '#2ecc71'; }
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    backendOnline = false;
    if (dot)  { dot.textContent  = '🔴'; dot.title = 'Backend offline'; }
    if (text) { text.textContent = 'Backend: ไม่ได้รัน → รัน app.py ก่อน'; text.style.color = '#e74c3c'; }
  }
  return backendOnline;
}

window.addEventListener('load', () => checkBackend());
setInterval(checkBackend, 10000);

// ---------- Init ----------
document.getElementById('mfgDate').valueAsDate = new Date();

function updateTime() {
  const now = new Date();
  document.getElementById("datetime").innerText = now.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  document.getElementById("inspectDate").value = now.toLocaleString('en-GB');
}
setInterval(updateTime, 1000);
updateTime();

// ============================================================
//  DRAG & DROP
// ============================================================
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length > 0) addFiles(files, 'upload');
});

// ============================================================
//  FILE HANDLING
// ============================================================
function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (files.length > 0) addFiles(files, 'upload');
  event.target.value = '';
}

function addFiles(files, source = 'upload') {
  const prevLen = imageFiles.length;
  files.forEach(file => {
    imageFiles.push(file);
    imageResults.push(null);
    imageSources.push(source);
  });
  renderFileInfo();
  renderThumbs();
  if (prevLen === 0) currentIndex = 0;
  showImage(currentIndex);
}

function renderFileInfo() {
  const el = document.getElementById('fileInfo');
  if (imageFiles.length === 0) { el.innerHTML = 'ยังไม่ได้เลือกไฟล์'; return; }
  el.innerHTML = imageFiles.map((f, i) => {
    const isCam = imageSources[i] === 'camera';
    return `
      <div class="file-info-item">
        <span class="file-badge ${isCam ? 'cam-badge' : ''}">${isCam ? '📷' : i + 1}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
        ${imageResults[i]
          ? '<span style="color:#2ecc71;font-size:10px;">✓</span>'
          : '<span style="color:var(--text-muted);font-size:10px;">⏳</span>'}
      </div>`;
  }).join('');
}

// ============================================================
//  THUMBNAIL STRIP
// ============================================================
function renderThumbs() {
  const strip = document.getElementById('thumbStrip');
  strip.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  strip.innerHTML = '';
  const fragment = document.createDocumentFragment();

  imageFiles.forEach((file, i) => {
    const img = document.createElement('img');
    const isCam = imageSources[i] === 'camera';
    img.className = 'thumb' + (i === currentIndex ? ' active' : '') + (isCam ? ' cam-thumb' : '');
    img.src       = URL.createObjectURL(file);
    img.title     = (isCam ? '📷 ' : '') + file.name;
    img.loading   = 'lazy';
    img.onclick   = () => { currentIndex = i; showImage(i); };
    fragment.appendChild(img);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'thumb-empty';
  addBtn.innerHTML = '＋';
  addBtn.title     = 'เพิ่มรูปภาพ';
  addBtn.onclick   = () => document.getElementById('fileInput').click();
  fragment.appendChild(addBtn);
  strip.appendChild(fragment);
}

// ============================================================
//  CAROUSEL NAVIGATION
// ============================================================
function changeImage(dir) {
  if (imageFiles.length === 0) return;
  currentIndex = (currentIndex + dir + imageFiles.length) % imageFiles.length;
  showImage(currentIndex);
}

// ============================================================
//  SHOW IMAGE + BOUNDING BOXES
// ============================================================
function showImage(index) {
  if (imageFiles.length === 0) return;
  currentIndex = index;

  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');
  const img    = new Image();
  const objectUrl = URL.createObjectURL(imageFiles[index]);
  img.src = objectUrl;

  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const maxW = rect.width  || wrap.offsetWidth  || 300;
    const maxH = rect.height || wrap.offsetHeight || 280;

    if (maxW === 0 || maxH === 0) { setTimeout(() => showImage(index), 100); return; }

    const ratio   = Math.min(maxW / img.width, maxH / img.height);
    canvas.width  = Math.round(img.width  * ratio);
    canvas.height = Math.round(img.height * ratio);
    canvas.style.display = 'block';
    canvas.style.margin  = 'auto';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const isCam    = imageSources[index] === 'camera';
    const sourceLbl = isCam ? ' 📷 Camera' : '';
    document.getElementById('carouselCounter').textContent = `${index + 1} / ${imageFiles.length}`;
    const fname = imageFiles[index].name;
    document.getElementById('currentImageLabel').textContent =
      (fname.length > 25 ? fname.slice(0, 22) + '...' : fname) + sourceLbl;

    renderThumbs();

    const result = imageResults[index];
    if (result && !result._error) {
      displayResults(result);
      drawBoundingBoxesOnCanvas(result, img.width, img.height, ratio);
    } else if (result && result._error) {
      document.getElementById('resStatus').innerText = '❌ ตรวจจับไม่สำเร็จ';
      document.getElementById('resStatus').style.background = '#c0392b';
    } else {
      clearResults();
    }
  };
}



// ============================================================
//  CLEAR RESULTS
// ============================================================
function clearResults() {
  document.getElementById('resCode').innerText     = '-';
  document.getElementById('resNameTh').innerText   = '-';
  document.getElementById('resOperator').innerText = '-';
  document.getElementById('resPieces').innerText   = '0';
  document.getElementById('resBox').innerText      = '0';
  document.getElementById('resTime').innerText     = '0.000';
  document.getElementById('resConf').innerText     = '0.00';
  document.getElementById('resStatus').innerText   = '⏳ รอการตรวจจับ';
  document.getElementById('resStatus').style.background = 'var(--btn-blue)';
}

// ============================================================
//  MODE SWITCHING
// ============================================================
function switchMode(mode) {
  currentMode = mode;
  const uploadPanel = document.getElementById('uploadPanel');
  const camPanel    = document.getElementById('camPanel');
  const tabUpload   = document.getElementById('tabUpload');
  const tabCam      = document.getElementById('tabCam');

  if (mode === 'upload') {
    uploadPanel.style.display = 'block';
    camPanel.style.display    = 'none';
    tabUpload.classList.add('active');
    tabCam.classList.remove('active');
    stopCamera();
  } else {
    uploadPanel.style.display = 'none';
    camPanel.style.display    = 'block';
    tabUpload.classList.remove('active');
    tabCam.classList.add('active');
  }
}

// ============================================================
//  CAMERA FUNCTIONS
// ============================================================
async function startCamera(deviceId = '') {
  setCamStatus('⏳ กำลังเปิดกล้อง...', 'var(--text-muted)');
  if (camStream) stopCamStream();

  const constraints = {
    video: {
      width: { ideal: 1280 }, height: { ideal: 720 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' })
    },
    audio: false
  };

  try {
    camStream = await navigator.mediaDevices.getUserMedia(constraints);
    currentDeviceId = camStream.getVideoTracks()[0]?.getSettings()?.deviceId || '';
    document.getElementById('camVideo').srcObject = camStream;
    document.getElementById('btnStartCam').disabled = true;
    document.getElementById('btnCapture').disabled  = false;
    document.getElementById('btnStopCam').disabled  = false;
    setCamStatus('🟢 กล้องพร้อมใช้งาน', '#2ecc71');
    await loadCameraList();
  } catch (err) {
    setCamStatus('❌ เปิดกล้องไม่ได้: ' + err.message, '#e74c3c');
  }
}

async function loadCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const sel     = document.getElementById('camSelect');
    sel.innerHTML = '';
    cameras.forEach((cam, i) => {
      const opt = document.createElement('option');
      opt.value       = cam.deviceId;
      opt.textContent = cam.label || `กล้อง ${i + 1}`;
      if (cam.deviceId === currentDeviceId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (e) { console.warn('[Camera] enumerateDevices failed:', e); }
}

async function changeCamera() {
  const deviceId = document.getElementById('camSelect').value;
  if (deviceId) await startCamera(deviceId);
}

function stopCamStream() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  const video = document.getElementById('camVideo');
  if (video) video.srcObject = null;
}

function stopCamera() {
  stopCamStream();
  const btnStart   = document.getElementById('btnStartCam');
  const btnCapture = document.getElementById('btnCapture');
  const btnStop    = document.getElementById('btnStopCam');
  if (btnStart)   btnStart.disabled   = false;
  if (btnCapture) btnCapture.disabled = true;
  if (btnStop)    btnStop.disabled    = true;
  setCamStatus('ปิดกล้องแล้ว', 'var(--text-muted)');
}

function captureFrame() {
  const video = document.getElementById('camVideo');
  if (!video || !camStream) return;
  video.classList.add('flash');
  setTimeout(() => video.classList.remove('flash'), 300);

  const offscreen    = document.createElement('canvas');
  offscreen.width    = video.videoWidth  || 1280;
  offscreen.height   = video.videoHeight || 720;
  offscreen.getContext('2d').drawImage(video, 0, 0, offscreen.width, offscreen.height);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `capture_${timestamp}.jpg`;

  offscreen.toBlob(blob => {
    if (!blob) { setCamStatus('❌ ถ่ายภาพไม่สำเร็จ', '#e74c3c'); return; }
    const file = new File([blob], filename, { type: 'image/jpeg' });
    addFiles([file], 'camera');
    setCamStatus(`✅ ถ่ายภาพแล้ว: ${filename}`, '#2ecc71');
  }, 'image/jpeg', 0.92);
}

function setCamStatus(msg, color = 'var(--text-muted)') {
  const el = document.getElementById('camStatus');
  if (el) { el.textContent = msg; el.style.color = color; }
}

// ============================================================
//  ✅ NEW: AUTO CROP BLACK PADDING
//  ตัดพื้นที่สีดำรอบภาพออกก่อนส่ง YOLO
// ============================================================
function autoCropBlackPadding(canvas) {
  const ctx  = canvas.getContext('2d');
  const w    = canvas.width;
  const h    = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // threshold ความสว่าง — pixel ที่มืดกว่านี้ถือว่า "ดำ"
  const DARK_THRESH = 15;

  let minX = w, minY = h, maxX = 0, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > DARK_THRESH || g > DARK_THRESH || b > DARK_THRESH) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // ถ้าไม่มีพื้นที่ดำหรือ crop แทบไม่เปลี่ยน → คืนต้นฉบับ
  const cropW = maxX - minX;
  const cropH = maxY - minY;
  const areaRatio = (cropW * cropH) / (w * h);
  if (areaRatio > 0.95 || cropW < 10 || cropH < 10) return canvas;

  console.log(`[AutoCrop] ${w}x${h} → ${cropW}x${cropH} (${(areaRatio * 100).toFixed(1)}% area kept)`);

  const cropped    = document.createElement('canvas');
  cropped.width    = cropW;
  cropped.height   = cropH;
  cropped.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return cropped;
}

// ============================================================
//  ✅ FIX: PREPROCESS IMAGE (EXIF + RESIZE + AUTO CROP)
// ============================================================
function preprocessImage(file) {
  return new Promise((resolve) => {
    const isCamFile = file.name.startsWith('capture_');

    const processCanvas = (c) => {
      // ✅ NEW: Auto crop black padding
      const cropped = autoCropBlackPadding(c);
      const wasCropped = cropped !== c;
      const cropInfoEl = document.getElementById('cropInfo');
      if (cropInfoEl) {
        if (wasCropped) {
          cropInfoEl.classList.add('show');
          cropInfoEl.textContent = `✂️ ตัดพื้นที่ว่างออก: ${c.width}x${c.height} → ${cropped.width}x${cropped.height}px`;
        } else {
          cropInfoEl.classList.remove('show');
        }
      }
      cropped.toBlob(
        blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
        'image/jpeg', 0.95
      );
    };

    if (isCamFile) {
      // ภาพจากกล้อง — ไม่ต้องแก้ EXIF แต่ยัง crop ได้
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const c = document.createElement('canvas');
        c.width  = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        processCanvas(c);
      };
      img.src = url;
      return;
    }

    EXIF.getData(file, function () {
      const orientation = EXIF.getTag(this, 'Orientation') || 1;
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_SIZE = 1280;
        const needSwap = [5, 6, 7, 8].includes(orientation);
        const srcW = img.width, srcH = img.height;
        const dispW = needSwap ? srcH : srcW;
        const dispH = needSwap ? srcW : srcH;
        const scale = Math.min(MAX_SIZE / dispW, MAX_SIZE / dispH, 1);
        const outW  = Math.round(dispW * scale);
        const outH  = Math.round(dispH * scale);

        const c    = document.createElement('canvas');
        c.width    = outW;
        c.height   = outH;
        const ctx  = c.getContext('2d');
        ctx.save();
        switch (orientation) {
          case 2: ctx.translate(outW, 0);       ctx.scale(-1, 1); break;
          case 3: ctx.translate(outW, outH);    ctx.rotate(Math.PI); break;
          case 4: ctx.translate(0, outH);       ctx.scale(1, -1); break;
          case 5: ctx.rotate(Math.PI / 2);      ctx.scale(1, -1); break;
          case 6: ctx.translate(outW, 0);       ctx.rotate(Math.PI / 2); break;
          case 7: ctx.translate(outW, outH);    ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
          case 8: ctx.translate(0, outH);       ctx.rotate(-Math.PI / 2); break;
        }
        needSwap
          ? ctx.drawImage(img, 0, 0, outH, outW)
          : ctx.drawImage(img, 0, 0, outW, outH);
        ctx.restore();

        processCanvas(c);
      };
      img.src = url;
    });
  });
}

// ============================================================
//  DETECT — Multi Image Loop
// ============================================================
async function detect() {
  if (imageFiles.length === 0) {
    alert('กรุณาเลือกรูปภาพหรือถ่ายภาพก่อนเริ่มตรวจจับ');
    return;
  }

  const online = await checkBackend();
  if (!online) {
    alert(
      '❌ เชื่อมต่อ Backend ไม่ได้!\n\n' +
      'กรุณารัน app.py ก่อน:\n' +
      '  python app.py\n\n' +
      'แล้วรอจนเห็น "Running on http://127.0.0.1:5000"\n' +
      'จึงกดเริ่มตรวจจับอีกครั้ง'
    );
    return;
  }

  const btn = document.getElementById('btnDetect');
  btn.disabled = true;

  for (let i = 0; i < imageFiles.length; i++) {
    btn.innerHTML = `⏳ กำลังประมวลผล ${i + 1}/${imageFiles.length}...`;
    document.getElementById('detectProgress').textContent =
      `ภาพที่ ${i + 1} จาก ${imageFiles.length}`;

    currentIndex = i;
    showImage(i);

    try {
      const result    = await detectSingleImage(imageFiles[i]);
      imageResults[i] = result;
      renderFileInfo();
      showImage(i);
      processAIData(result, i);
    } catch (err) {
      console.error(`[Detect] ภาพ ${i + 1} ผิดพลาด:`, err.message);
      imageResults[i] = { _error: true, message: err.message };
      renderFileInfo();

      const canvas = document.getElementById('canvas');
      const ctx    = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(231,76,60,0.85)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font      = 'bold 14px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText('❌ ตรวจจับไม่สำเร็จ', canvas.width / 2, canvas.height / 2 - 10);
      ctx.font      = '11px Segoe UI';
      ctx.fillText(err.message.slice(0, 60), canvas.width / 2, canvas.height / 2 + 14);
      ctx.textAlign = 'left';

      document.getElementById('resStatus').innerText = '❌ Error: ' + err.message.slice(0, 50);
      document.getElementById('resStatus').style.background = '#c0392b';

      if (!backendOnline) {
        alert('❌ Backend หลุดการเชื่อมต่อ\nหยุดการประมวลผล\nกรุณาเช็ค app.py แล้วลองใหม่');
        break;
      }
    }

    await new Promise(r => setTimeout(r, 50));
  }

  btn.innerHTML = '▶ เริ่มตรวจจับ';
  btn.disabled  = false;
  document.getElementById('detectProgress').textContent =
    `✓ ตรวจสอบครบ ${imageFiles.length} รูป`;

  showImage(imageFiles.length - 1);
}

// ============================================================
//  SEND SINGLE IMAGE TO BACKEND
// ============================================================
async function detectSingleImage(file) {
  const processedFile = await preprocessImage(file);
  console.log(`[Send] ${file.name} → ${processedFile.size} bytes`);

  const formData = new FormData();
  formData.append('image', processedFile);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${BACKEND_URL}/predict`, {
      method: 'POST',
      body:   formData,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Backend ตอบกลับ ${res.status}: ${errText}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (data.debug?.ram_warn) {
      console.warn(`[RAM WARNING] ${data.debug.ram_used}`);
    }
    return data;

  } catch (err) {
    clearTimeout(timer);
    let msg = err.message || String(err);
    if (err.name === 'AbortError') {
      msg = 'หมดเวลา (timeout 60s) — ภาพอาจใหญ่เกินไป หรือ Backend ค้างอยู่';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      msg = 'เชื่อมต่อ Backend ไม่ได้ — กรุณาเช็คว่า app.py กำลังรันอยู่';
      backendOnline = false;
      checkBackend();
    }
    throw new Error(msg);
  }
}

// ============================================================
//  PROCESS AI DATA (Poka-Yoke)
// ============================================================
function processAIData(data, imageIndex) {
  const userCode  = document.getElementById('product').value;
  const aiCode    = data.product_detected;
  let   finalCode = aiCode;

  const pokaAlert = document.getElementById('pokaAlert');
  if (pokaAlert) pokaAlert.classList.remove('show');

  if (aiCode !== 'UNKNOWN' && userCode !== aiCode) {
    const aiTH   = productMap[aiCode]   || aiCode;
    const userTH = productMap[userCode] || userCode;

    if (pokaAlert) {
      pokaAlert.textContent = `⚠️ ความขัดแย้ง! เลือก: ${userTH} แต่ AI ตรวจพบ: ${aiTH} (${aiCode})`;
      pokaAlert.classList.add('show');
    }

    const sel = document.getElementById('product');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === aiCode) { sel.selectedIndex = i; break; }
    }
  }

  const avgConf = calcAvgConf(data.boxes);
  const source  = imageSources[imageIndex] || 'upload';
  addHistory(data.count, data.time_sec, finalCode, avgConf, source);
}

// ============================================================
//  ✅ FIX: DISPLAY RESULTS — ใช้ getPiecesPerBox() แทน hard-code
// ============================================================
function displayResults(result) {
  const ppb      = getPiecesPerBox();                          // ✅ อ่านจาก input
  const boxes    = (result.count / ppb).toFixed(1);
  const thaiName = productMap[result.product_detected] || 'ไม่ระบุ';
  const avgConf  = calcAvgConf(result.boxes);

  document.getElementById('resCode').innerText     = result.product_detected;
  document.getElementById('resNameTh').innerText   = `กะหรี่พัฟไส้${thaiName}`;
  document.getElementById('resOperator').innerText = document.getElementById('operator').value;
  document.getElementById('resPieces').innerText   = result.count;
  document.getElementById('resBox').innerText      = boxes;
  document.getElementById('resTime').innerText     = result.time_sec;
  document.getElementById('resConf').innerText     = avgConf;
  document.getElementById('resStatus').innerText   = '✓ สำเร็จ';
  document.getElementById('resStatus').style.background = 'var(--btn-green)';
}

// ============================================================
//  ✅ FIX: UPDATE RESULTS — ใช้ getPiecesPerBox() แทน hard-code 10
// ============================================================
function updateResults(count, timeSec, code) {
  const ppb      = getPiecesPerBox();                          // ✅ แก้จาก 10 → dynamic
  const boxes    = (count / ppb).toFixed(1);
  const thaiName = productMap[code] || 'ไม่ระบุ';
  const operator = document.getElementById('operator').value;

  document.getElementById('resCode').innerText     = code;
  document.getElementById('resNameTh').innerText   = `กะหรี่พัฟไส้${thaiName}`;
  document.getElementById('resOperator').innerText = operator;
  document.getElementById('resPieces').innerText   = count;
  document.getElementById('resBox').innerText      = boxes;
  document.getElementById('resTime').innerText     = timeSec;
  document.getElementById('resStatus').innerText   = '✓ สำเร็จ';
  document.getElementById('resStatus').style.background = 'var(--btn-green)';
}

// ✅ Helper: คำนวณ average confidence
function calcAvgConf(boxes) {
  if (!boxes || boxes.length === 0) return '0.00';
  const total = boxes.reduce((sum, b) => sum + b.conf, 0);
  return ((total / boxes.length) * 100).toFixed(2);
}

// ============================================================
//  HISTORY
// ============================================================
function addHistory(count, timeSec, code, avgConf, source = 'upload') {
  const ppb      = getPiecesPerBox();                          // ✅ ใช้ค่าจาก input
  const boxes    = (count / ppb).toFixed(1);
  const thaiName = productMap[code] || 'ไม่ระบุ';
  const operator = document.getElementById('operator').value;
  const qcName   = document.getElementById('qcName').value;
  const mfgDate  = document.getElementById('mfgDate').value;

  detectCount++;
  historyData.unshift({
    id:       detectCount,
    code:     code,
    product:  `${code} (${thaiName})`,
    boxes:    boxes,
    pieces:   count,
    time:     timeSec,
    operator: operator,
    qc:       qcName,
    date:     new Date(mfgDate).toLocaleDateString('th-TH'),
    accuracy: avgConf,
    source:   source
  });

  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('historyCards');
  if (historyData.length === 0) {
    container.innerHTML =
      '<div style="color:var(--text-muted);text-align:center;padding:16px;font-size:12px;">ยังไม่มีประวัติ</div>';
    return;
  }
  container.innerHTML = historyData.map(item => {
    const srcIcon = item.source === 'camera' ? '📷' : '📁';
    return `
      <div class="history-card">
        <div class="h-num">${item.id}</div>
        <div class="h-main">
          <div class="h-product">🥟 ${item.product}</div>
          <div class="h-meta">
            👤 ${item.operator} &nbsp;|&nbsp;
            🔍 ${item.qc} &nbsp;|&nbsp;
            📅 ${item.date} &nbsp;|&nbsp;
            ${srcIcon} ${item.source === 'camera' ? 'Camera' : 'Upload'}
          </div>
        </div>
        <div class="h-right">
          <div class="h-boxes">${item.boxes}</div>
          <div class="h-boxes-label">กล่อง</div>
          <div class="h-time">⚡ ${item.time}s | 🎯 ${item.accuracy}%</div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
//  ✅ NEW: SAVE EDIT (แก้ไขข้อมูล)
// ============================================================
function saveEdit() {
  const code     = document.getElementById('editProduct').value;
  const boxes    = parseFloat(document.getElementById('editBoxes').value);
  const operator = document.getElementById('editOperator').value.trim();
  const mfgDate  = document.getElementById('editMfgDate').value;

  if (!code || code === '-- เลือกชื่อไส้ --') {
    alert('กรุณาเลือกชื่อไส้ที่ถูกต้อง');
    return;
  }

  // แก้ไข entry ล่าสุดในประวัติ
  if (historyData.length === 0) {
    alert('ยังไม่มีข้อมูลให้แก้ไข');
    return;
  }

  const latest = historyData[0];
  if (code    !== '-- เลือกชื่อไส้ --') latest.code     = code;
  if (!isNaN(boxes) && boxes > 0)        latest.boxes    = boxes.toFixed(1);
  if (operator)                           latest.operator = operator;
  if (mfgDate)                            latest.date     = new Date(mfgDate).toLocaleDateString('th-TH');

  latest.product = `${latest.code} (${productMap[latest.code] || latest.code})`;
  renderHistory();
  alert('✅ บันทึกการแก้ไขแล้ว');
}

// ============================================================
//  SAVE TO GOOGLE SHEETS
// ============================================================
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbwMI64ZU9m4oOSBqvcJikLzveL6Ba59K2HYPMDR9Nh6RDthMWFiI-3uMqVigMmniiUg/exec";

async function saveData() {
  if (historyData.length === 0) {
    alert('ไม่มีข้อมูลให้บันทึก กรุณาตรวจจับภาพก่อน');
    return;
  }

  const saveBtn = document.querySelector('button[onclick="saveData()"]');
  const originalText = saveBtn ? saveBtn.innerText : "💾 บันทึกผลลัพธ์";
  if (saveBtn) { saveBtn.innerText = "⏳ กำลังบันทึก..."; saveBtn.disabled = true; }

  try {
    const response = await fetch(GOOGLE_SHEET_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify(historyData),
      redirect: 'follow'
    });
    const result = await response.text();
    if (result === "Success") {
      alert(`✅ บันทึกข้อมูล ${historyData.length} รายการ ลง Google Sheets เรียบร้อยแล้ว!`);
      resetAll();
    } else {
      throw new Error(result);
    }
  } catch (error) {
    console.error('Error saving data:', error);
    alert('❌ เกิดข้อผิดพลาด\n' + error);
  } finally {
    if (saveBtn) { saveBtn.innerText = originalText; saveBtn.disabled = false; }
  }
}

// ============================================================
//  RESET ALL
// ============================================================
function resetAll() {
  document.querySelectorAll('#thumbStrip img').forEach(img => URL.revokeObjectURL(img.src));
  stopCamera();

  imageFiles   = [];
  imageResults = [];
  imageSources = [];
  currentIndex = 0;
  historyData  = [];
  detectCount  = 0;

  const canvas = document.getElementById('canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById('carouselCounter').textContent   = '0 / 0';
  document.getElementById('currentImageLabel').textContent  = '';
  document.getElementById('detectProgress').textContent    = '';
  document.getElementById('fileInput').value               = '';

  const cropInfo = document.getElementById('cropInfo');
  if (cropInfo) cropInfo.classList.remove('show');

  renderFileInfo();
  renderThumbs();
  renderHistory();
  clearResults();
}
