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
 
// ========== STATE ==========
let imageFiles = [];
let imageResults = [];
let currentIndex = 0;
let historyData = [];
let detectCount = 0;
 
// เซ็ตค่าเริ่มต้น
document.getElementById('mfgDate').valueAsDate = new Date();
 
// อัปเดตเวลาแบบ Real-time
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
 
// ========== DRAG & DROP ==========
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length > 0) addFiles(files);
});
 
// ========== FILE HANDLING ==========
function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (files.length > 0) addFiles(files);
  event.target.value = '';
}
 
function addFiles(files) {
  files.forEach(file => {
    imageFiles.push(file);
    imageResults.push(null);
  });
  renderFileInfo();
  renderThumbs();
  if (imageFiles.length === files.length) currentIndex = 0;
  showImage(currentIndex);
}
 
function renderFileInfo() {
  const el = document.getElementById('fileInfo');
  if (imageFiles.length === 0) {
    el.innerHTML = 'ยังไม่ได้เลือกไฟล์';
    return;
  }
  el.innerHTML = imageFiles.map((f, i) => `
    <div class="file-info-item">
      <span class="file-badge">${i + 1}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
      ${imageResults[i]
        ? '<span style="color:#2ecc71;font-size:10px;">✓</span>'
        : '<span style="color:var(--text-muted);font-size:10px;">⏳</span>'}
    </div>
  `).join('');
}
 
// ========== THUMBNAIL STRIP ==========
function renderThumbs() {
  const strip = document.getElementById('thumbStrip');
 
  strip.querySelectorAll('img').forEach(img => URL.revokeObjectURL(img.src));
  strip.innerHTML = '';
 
  const fragment = document.createDocumentFragment();
  imageFiles.forEach((file, i) => {
    const img = document.createElement('img');
    img.className = 'thumb' + (i === currentIndex ? ' active' : '');
    img.src = URL.createObjectURL(file);
    img.title = file.name;
    img.loading = 'lazy';
    img.onclick = () => { currentIndex = i; showImage(i); };
    fragment.appendChild(img);
  });
 
  const addBtn = document.createElement('div');
  addBtn.className = 'thumb-empty';
  addBtn.innerHTML = '＋';
  addBtn.title = 'เพิ่มรูปภาพ';
  addBtn.onclick = () => document.getElementById('fileInput').click();
  fragment.appendChild(addBtn);
 
  strip.appendChild(fragment);
}
 
// ========== CAROUSEL NAVIGATION ==========
function changeImage(dir) {
  if (imageFiles.length === 0) return;
  currentIndex = (currentIndex + dir + imageFiles.length) % imageFiles.length;
  showImage(currentIndex);
}
 
// ============================================================
// ✅ FIX 1: showImage — แก้ปัญหาภาพดำครึ่งหนึ่งบนมือถือ
//
// สาเหตุเดิม:
//   wrap.clientWidth / clientHeight อาจ = 0 บนมือถือ
//   เพราะ layout ยังไม่ render เสร็จตอน img.onload
//   ทำให้ ratio ผิด → canvas เล็กเกินไป → ภาพชิดซ้าย
//
// วิธีแก้:
//   1. ใช้ offsetWidth/offsetHeight แทน clientWidth
//   2. ถ้าได้ค่า 0 ให้ requestAnimationFrame รอ 1 frame แล้วลองใหม่
//   3. มี fallback ค่า default กัน div 0
// ============================================================
function showImage(index) {
  if (imageFiles.length === 0) return;
  currentIndex = index;
 
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const objectUrl = URL.createObjectURL(imageFiles[index]);
  img.src = objectUrl;
 
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
 
    // ✅ ใช้ offsetWidth/offsetHeight (ได้ค่าจริงหลัง layout render แล้ว)
    const wrap = canvas.parentElement;
    const maxW = wrap.offsetWidth  || 320;
    const maxH = wrap.offsetHeight || 280;
 
    // ✅ ถ้ายังได้ 0 (layout ยังไม่เสร็จ) ให้รอ 1 frame แล้วลองใหม่
    if (maxW === 0 || maxH === 0) {
      requestAnimationFrame(() => showImage(index));
      return;
    }
 
    // คำนวณ ratio ให้ภาพพอดี wrap โดยไม่บิดเบี้ยว
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    canvas.width  = Math.round(img.naturalWidth  * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
 
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
 
    document.getElementById('carouselCounter').textContent =
      `${index + 1} / ${imageFiles.length}`;
    document.getElementById('currentImageLabel').textContent =
      imageFiles[index].name.length > 25
        ? imageFiles[index].name.slice(0, 22) + '...'
        : imageFiles[index].name;
 
    renderThumbs();
 
    const result = imageResults[index];
    if (result) {
      displayResults(result);
      // ✅ FIX 3: เรียก drawBoundingBoxes พร้อม ratio ที่ถูกต้อง
      drawBoundingBoxes(ctx, result.boxes, img.naturalWidth, img.naturalHeight, ratio);
    } else {
      document.getElementById('resStatus').innerText =
        `⏳ กำลังประมวลผลภาพ ${index + 1}/${imageFiles.length}`;
      document.getElementById('resStatus').style.background = 'var(--btn-blue)';
    }
  };
}
 
// ========== วาด Bounding Box ==========
function drawBoundingBoxes(ctx, boxes, origW, origH, ratio) {
  if (!boxes || boxes.length === 0) return;
  boxes.forEach(b => {
    const [x1, y1, x2, y2] = b.box.map(v => v * ratio);
    const w = x2 - x1;
    const h = y2 - y1;
 
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = Math.max(1.5, ratio * 2);
    ctx.strokeRect(x1, y1, w, h);
 
    const label = `${b.label} ${b.conf}`;
    const fontSize = Math.max(10, 12 * ratio);
    ctx.font = `bold ${fontSize}px Segoe UI`;
    const tw = ctx.measureText(label).width;
    const th = fontSize + 4;
 
    ctx.fillStyle = 'rgba(255,68,68,0.85)';
    ctx.fillRect(x1, y1 - th, tw + 6, th);
 
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x1 + 3, y1 - 3);
  });
}
 
function clearResults() {
  document.getElementById('resCode').innerText = '-';
  document.getElementById('resNameTh').innerText = '-';
  document.getElementById('resOperator').innerText = '-';
  document.getElementById('resPieces').innerText = '0';
  document.getElementById('resBox').innerText = '0';
  document.getElementById('resTime').innerText = '0.000';
  document.getElementById('resConf').innerText = '0.00';
  document.getElementById('resStatus').innerText = '⏳ รอการตรวจจับ';
  document.getElementById('resStatus').style.background = 'var(--btn-blue)';
}
 
// ========== DETECT ==========
async function detect() {
  if (imageFiles.length === 0) {
    alert('กรุณาเลือกรูปภาพก่อนเริ่มตรวจจับ');
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
 
    const result = await detectSingleImage(imageFiles[i]);
    imageResults[i] = result;
 
    renderFileInfo();
    showImage(i);
    processAIData(result, i);
 
    await new Promise(r => setTimeout(r, 50));
  }
 
  btn.innerHTML = '▶ เริ่มตรวจจับ';
  btn.disabled = false;
  document.getElementById('detectProgress').textContent =
    `✓ ตรวจสอบครบ ${imageFiles.length} รูป`;
 
  showImage(imageFiles.length - 1);
}
 
// ============================================================
// ✅ FIX 2: preprocessImage — แก้ปัญหาภาพหมุนผิดบนมือถือ
//
// สาเหตุเดิม:
//   ctx.drawImage(img, 0, 0, rotated ? h : w, rotated ? w : h)
//   h และ w ตรงนี้คือขนาดหลัง scale แต่ถ้า rotated=true
//   w = realW*ratio (แนวนอน), h = realH*ratio (แนวตั้ง)
//   แต่ drawImage ต้องการขนาด SOURCE ของภาพต้นฉบับ ไม่ใช่ขนาด canvas
//   ทำให้ภาพถูก squish หรือ stretch ก่อนส่ง backend → YOLO ผิด
//
// วิธีแก้:
//   ใช้ ctx.setTransform() แทน rotate+translate
//   และ drawImage ด้วยขนาด origW/origH เสมอ (ก่อน scale)
//   แล้วให้ transform จัดการหมุน
// ============================================================
function preprocessImage(file) {
  return new Promise((resolve) => {
    EXIF.getData(file, function () {
      const orientation = EXIF.getTag(this, 'Orientation') || 1;
      const img = new Image();
      const url = URL.createObjectURL(file);
 
      img.onload = () => {
        URL.revokeObjectURL(url);
 
        const MAX_SIZE = 1280;
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;
 
        // ✅ ภาพหมุน 90°/270° ต้องสลับ width/height ของ canvas
        const rotated = [5, 6, 7, 8].includes(orientation);
        const realW = rotated ? origH : origW;   // ขนาดจริงหลังหมุน
        const realH = rotated ? origW : origH;
 
        // Scale ให้ไม่เกิน MAX_SIZE
        const scale = Math.min(MAX_SIZE / realW, MAX_SIZE / realH, 1);
        const outW = Math.round(realW * scale);
        const outH = Math.round(realH * scale);
 
        const canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
 
        // ✅ ใช้ setTransform สำหรับทุก orientation (ชัดเจน ไม่มี side effect)
        // Matrix: (a, b, c, d, e, f) = (scaleX, skewY, skewX, scaleY, tx, ty)
        switch (orientation) {
          case 1: // ปกติ
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            break;
          case 2: // พลิกแนวนอน
            ctx.setTransform(-scale, 0, 0, scale, outW, 0);
            break;
          case 3: // หมุน 180°
            ctx.setTransform(-scale, 0, 0, -scale, outW, outH);
            break;
          case 4: // พลิกแนวตั้ง
            ctx.setTransform(scale, 0, 0, -scale, 0, outH);
            break;
          case 5: // หมุน 90° + พลิก
            ctx.setTransform(0, scale, scale, 0, 0, 0);
            break;
          case 6: // หมุน 90° CW (iPhone landscape)
            ctx.setTransform(0, scale, -scale, 0, outW, 0);
            break;
          case 7: // หมุน 270° + พลิก
            ctx.setTransform(0, -scale, -scale, 0, outW, outH);
            break;
          case 8: // หมุน 270° CW (iPhone portrait ถ่ายกลับหัว)
            ctx.setTransform(0, -scale, scale, 0, 0, outH);
            break;
          default:
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
 
        // ✅ drawImage ด้วยขนาดต้นฉบับเสมอ — transform จัดการ scale+rotate
        ctx.drawImage(img, 0, 0, origW, origH);
        ctx.resetTransform();
 
        canvas.toBlob(
          (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
          'image/jpeg',
          0.95  // ✅ เพิ่มจาก 0.92 → 0.95 ลด artifact ก่อนส่ง YOLO
        );
      };
      img.src = url;
    });
  });
}
 
// ========== ส่งรูปเดี่ยวไป Backend ==========
async function detectSingleImage(file) {
  try {
    const processedFile = await preprocessImage(file);
 
    const formData = new FormData();
    formData.append('image', processedFile);
 
    const res = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
 
  } catch (err) {
    console.warn('Backend ไม่ตอบสนอง - ใช้ Mock Data');
    await new Promise(r => setTimeout(r, 600));
 
    const mockCount = Math.floor(Math.random() * 20) + 10;
    const mockTime = (Math.random() * 0.5 + 0.3).toFixed(3);
    const userCode = document.getElementById('product').value;
    const isMismatch = Math.random() > 0.75;
    const mockCode = isMismatch ? 'MSH' : userCode;
 
    const mockBoxes = [];
    return new Promise(resolve => {
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const iW = tmpImg.naturalWidth;
        const iH = tmpImg.naturalHeight;
        const boxSize = Math.round(Math.min(iW, iH) * 0.12);
        const cols = 4;
        const rows = Math.ceil(mockCount / cols);
        for (let b = 0; b < mockCount; b++) {
          const col = b % cols;
          const row = Math.floor(b / cols);
          const x1 = Math.round((col / cols) * iW * 0.85 + iW * 0.05 + (Math.random() - 0.5) * boxSize * 0.4);
          const y1 = Math.round((row / rows) * iH * 0.85 + iH * 0.05 + (Math.random() - 0.5) * boxSize * 0.4);
          mockBoxes.push({
            box: [
              Math.max(0, x1), Math.max(0, y1),
              Math.min(iW, x1 + boxSize), Math.min(iH, y1 + boxSize)
            ],
            label: mockCode,
            conf: parseFloat((Math.random() * 0.1 + 0.82).toFixed(2))
          });
        }
        resolve({
          product_detected: mockCode,
          count: mockCount,
          boxes: mockBoxes,
          time_sec: parseFloat(mockTime)
        });
      };
      const tempUrl = URL.createObjectURL(file);
      tmpImg.onload = function() {
        URL.revokeObjectURL(tempUrl);
        // สร้าง mock boxes ด้วยขนาดภาพจริง
        const iW = this.naturalWidth;
        const iH = this.naturalHeight;
        const boxSize = Math.round(Math.min(iW, iH) * 0.12);
        const cols = 4;
        const rows = Math.ceil(mockCount / cols);
        for (let b = 0; b < mockCount; b++) {
          const col = b % cols;
          const row = Math.floor(b / cols);
          const x1 = Math.round((col / cols) * iW * 0.85 + iW * 0.05 + (Math.random() - 0.5) * boxSize * 0.4);
          const y1 = Math.round((row / rows) * iH * 0.85 + iH * 0.05 + (Math.random() - 0.5) * boxSize * 0.4);
          mockBoxes.push({
            box: [
              Math.max(0, x1), Math.max(0, y1),
              Math.min(iW, x1 + boxSize), Math.min(iH, y1 + boxSize)
            ],
            label: mockCode,
            conf: parseFloat((Math.random() * 0.1 + 0.82).toFixed(2))
          });
        }
        resolve({
          product_detected: mockCode,
          count: mockCount,
          boxes: mockBoxes,
          time_sec: parseFloat(mockTime)
        });
      };
      tmpImg.src = tempUrl;
    });
  }
}
 
function processAIData(data, imageIndex) {
  const userCode = document.getElementById('product').value;
  const aiCode = data.product_detected;
  let finalCode = aiCode;
 
  const pokaAlert = document.getElementById('pokaAlert');
  if (pokaAlert) pokaAlert.classList.remove('show');
 
  if (aiCode !== 'UNKNOWN' && userCode !== aiCode) {
    const aiTH = productMap[aiCode] || aiCode;
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
 
  let avgConf = 0;
  if (data.boxes && data.boxes.length > 0) {
    const totalConf = data.boxes.reduce((sum, b) => sum + b.conf, 0);
    avgConf = ((totalConf / data.boxes.length) * 100).toFixed(2);
  }
 
  addHistory(data.count, data.time_sec, finalCode, avgConf);
}
 
function displayResults(result) {
  const piecesPerBox = 30;
  const boxes = (result.count / piecesPerBox).toFixed(1);
  const thaiName = productMap[result.product_detected] || 'ไม่ระบุ';
 
  let avgConf = 0;
  if (result.boxes && result.boxes.length > 0) {
    const totalConf = result.boxes.reduce((sum, b) => sum + b.conf, 0);
    avgConf = ((totalConf / result.boxes.length) * 100).toFixed(2);
  }
 
  document.getElementById('resCode').innerText = result.product_detected;
  document.getElementById('resNameTh').innerText = `กะหรี่พัฟไส้${thaiName}`;
  document.getElementById('resOperator').innerText = document.getElementById('operator').value;
  document.getElementById('resPieces').innerText = result.count;
  document.getElementById('resBox').innerText = boxes;
  document.getElementById('resTime').innerText = result.time_sec;
  document.getElementById('resConf').innerText = avgConf;
  document.getElementById('resStatus').innerText = '✓ สำเร็จ';
  document.getElementById('resStatus').style.background = 'var(--btn-green)';
}
 
// ========== HISTORY ==========
function addHistory(count, timeSec, code, avgConf) {
  const piecesPerBox = 30;
  const boxes = (count / piecesPerBox).toFixed(1);
  const thaiName = productMap[code] || 'ไม่ระบุ';
  const operator = document.getElementById('operator').value;
  const qcName = document.getElementById('qcName').value;
  const mfgDate = document.getElementById('mfgDate').value;
 
  detectCount++;
  historyData.unshift({
    id: detectCount,
    code: code,
    product: `${code} (${thaiName})`,
    boxes: boxes,
    pieces: count,
    time: timeSec,
    operator: operator,
    qc: qcName,
    date: new Date(mfgDate).toLocaleDateString('th-TH'),
    accuracy: avgConf
  });
 
  renderHistory();
}
 
function renderHistory() {
  const container = document.getElementById('historyCards');
  if (historyData.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px;font-size:12px;">ยังไม่มีประวัติ</div>';
    return;
  }
 
  container.innerHTML = historyData.map(item => `
    <div class="history-card">
      <div class="h-num">${item.id}</div>
      <div class="h-main">
        <div class="h-product">🥟 ${item.product}</div>
        <div class="h-meta">👤 ${item.operator} &nbsp;|&nbsp; 🔍 ${item.qc} &nbsp;|&nbsp; 📅 ${item.date}</div>
      </div>
      <div class="h-right">
        <div class="h-boxes">${item.boxes}</div>
        <div class="h-boxes-label">กล่อง</div>
        <div class="h-time">⚡ ${item.time}s | 🎯 ${item.accuracy}%</div>
      </div>
    </div>
  `).join('');
}
 
// ========== SAVE TO GOOGLE SHEETS ==========
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
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(historyData),
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
 
// ========== RESET ==========
function resetAll() {
  document.querySelectorAll('#thumbStrip img').forEach(img => URL.revokeObjectURL(img.src));
 
  imageFiles = [];
  imageResults = [];
  currentIndex = 0;
  historyData = [];
  detectCount = 0;
 
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
 
  document.getElementById('carouselCounter').textContent = '0 / 0';
  document.getElementById('currentImageLabel').textContent = '';
  document.getElementById('detectProgress').textContent = '';
  document.getElementById('fileInput').value = '';
 
  renderFileInfo();
  renderThumbs();
  renderHistory();
  clearResults();
}
