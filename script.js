// 📌 ข้อมูลอ้างอิง Code แปลงเป็นชื่อภาษาไทย
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
let imageFiles = [];         // ไฟล์ภาพทั้งหมด
let imageResults = [];       // ผลลัพธ์ของแต่ละภาพ (null = ยังไม่ได้ตรวจจับ)
let currentIndex = 0;        // ภาพปัจจุบันที่แสดง
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
  // reset input ให้เลือกซ้ำได้
  event.target.value = '';
}
 
function addFiles(files) {
  files.forEach(file => {
    imageFiles.push(file);
    imageResults.push(null); // ยังไม่ได้ตรวจ
  });
  renderFileInfo();
  renderThumbs();
  // แสดงภาพแรกที่เพิ่มมา
  if (imageFiles.length === files.length) {
    currentIndex = 0;
  }
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
      ${imageResults[i] ? '<span style="color:#2ecc71;font-size:10px;">✓</span>' : '<span style="color:var(--text-muted);font-size:10px;">⏳</span>'}
    </div>
  `).join('');
}
 
// ========== THUMBNAIL STRIP ==========
function renderThumbs() {
  const strip = document.getElementById('thumbStrip');
  
  // ✅ Revoke URL เก่าทั้งหมดก่อน render ใหม่
  strip.querySelectorAll('img').forEach(img => {
    URL.revokeObjectURL(img.src);
  });
  strip.innerHTML = '';

  // ✅ ใช้ Fragment ลด reflow
  const fragment = document.createDocumentFragment();

  imageFiles.forEach((file, i) => {
    const img = document.createElement('img');
    img.className = 'thumb' + (i === currentIndex ? ' active' : '');
    img.src = URL.createObjectURL(file);
    img.title = file.name;
    img.loading = 'lazy'; // ✅ lazy load
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
 
// ========== SHOW IMAGE + BOUNDING BOXES ==========
function showImage(index) {
  if (imageFiles.length === 0) return;
  currentIndex = index;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  // ✅ สร้าง URL แล้ว revoke ทันทีหลัง load
  const objectUrl = URL.createObjectURL(imageFiles[index]);
  img.src = objectUrl;

  img.onload = () => {
    URL.revokeObjectURL(objectUrl);

    const wrap = canvas.parentElement;
    const maxW = wrap.clientWidth;
    const maxH = wrap.clientHeight;
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
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
      displayResults(result); // ✅ มี result → แสดงผล
    } else {
      // ✅ ยังไม่มี result → แสดง loading แทน dash
      document.getElementById('resStatus').innerText = 
        `⏳ กำลังประมวลผลภาพ ${index + 1}/${imageFiles.length}`;
      document.getElementById('resStatus').style.background = 'var(--btn-blue)';
    }
  };
}

// ✅ ฟังก์ชันวาด Bounding Box พร้อม label
function drawBoundingBoxes(ctx, boxes, origW, origH, ratio) {
  boxes.forEach(b => {
    const [x1, y1, x2, y2] = b.box.map(v => v * ratio);
    const w = x2 - x1;
    const h = y2 - y1;
 
    // กรอบสี
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = Math.max(1.5, ratio * 2);
    ctx.strokeRect(x1, y1, w, h);
 
    // พื้นหลัง label
    const label = `${b.label} ${b.conf}`;
    const fontSize = Math.max(10, 12 * ratio);
    ctx.font = `bold ${fontSize}px Segoe UI`;
    const tw = ctx.measureText(label).width;
    const th = fontSize + 4;
 
    ctx.fillStyle = 'rgba(255,68,68,0.85)';
    ctx.fillRect(x1, y1 - th, tw + 6, th);
 
    // ข้อความ
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
  document.getElementById('resConf').innerText = '0.00'; // 🟢 เพิ่มเคลียร์ค่าความแม่นยำ
  document.getElementById('resStatus').innerText = '⏳ รอการตรวจจับ';
  document.getElementById('resStatus').style.background = 'var(--btn-blue)';
}

 
// ========== DETECT - Multi Image ==========
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

    // ✅ แสดงภาพก่อน (ยังไม่มี result)
    currentIndex = i;
    showImage(i);

    // ✅ รอ result จาก Backend
    const result = await detectSingleImage(imageFiles[i]);
    imageResults[i] = result; // ✅ เก็บ result แล้ว

    renderFileInfo();

    // ✅ แสดงภาพอีกครั้งหลังได้ result — จะ trigger displayResults อัตโนมัติ
    showImage(i);

    // ✅ ประมวลผลและเพิ่มประวัติ
    processAIData(result, i);

    // ✅ รอ UI อัพเดตก่อนไปภาพถัดไป
    await new Promise(r => setTimeout(r, 50));
  }

  btn.innerHTML = '▶ เริ่มตรวจจับ';
  btn.disabled = false;
  document.getElementById('detectProgress').textContent = 
    `✓ ตรวจสอบครบ ${imageFiles.length} รูป`;

  // ✅ แสดงภาพสุดท้ายพร้อมผลลัพธ์
  showImage(imageFiles.length - 1);
}


// ✅ แก้ภาพหมุน + Resize สำหรับมือถือ
function preprocessImage(file) {
  return new Promise((resolve) => {
    EXIF.getData(file, function() {
      const orientation = EXIF.getTag(this, 'Orientation') || 1;
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const MAX_SIZE = 1280;
        let w = img.width;
        let h = img.height;

        // ✅ ถ้าภาพหมุน 90/270 ให้สลับ w/h
        const rotated = [5,6,7,8].includes(orientation);
        if (rotated) [w, h] = [h, w];

        const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h, 1);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        // ✅ หมุนภาพให้ถูกต้องตาม EXIF
        ctx.save();
        if (orientation === 6) { ctx.translate(w,0); ctx.rotate(Math.PI/2); }
        else if (orientation === 8) { ctx.translate(0,h); ctx.rotate(-Math.PI/2); }
        else if (orientation === 3) { ctx.translate(w,h); ctx.rotate(Math.PI); }
        ctx.drawImage(img, 0, 0, rotated ? h : w, rotated ? w : h);
        ctx.restore();

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      };
      img.src = url;
    });
  });
}



// ส่งรูปเดี่ยวไป Backend
async function detectSingleImage(file) {
  try {
    // ✅ Preprocess ก่อนส่งทุกครั้ง
    const processedFile = await preprocessImage(file);

    const formData = new FormData();
    formData.append('image', processedFile); // ✅ ส่งไฟล์ที่ผ่านการแก้แล้ว

    const res = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
 
  } catch (err) {
    // ✅ Mock Data (ทดสอบ UI เมื่อยังไม่มี Backend)
    console.warn('Backend ไม่ตอบสนอง - ใช้ Mock Data');
    await new Promise(r => setTimeout(r, 600));
 
    const mockCount = Math.floor(Math.random() * 20) + 10;
    const mockTime = (Math.random() * 0.5 + 0.3).toFixed(3);
    const userCode = document.getElementById('product').value;
    const isMismatch = Math.random() > 0.75;
    const mockCode = isMismatch ? 'MSH' : userCode;
 
    // ✅ แก้: สร้าง mock boxes โดยอ่านขนาดภาพจริง ไม่ hardcode 300/400
    const mockBoxes = [];
    return new Promise(resolve => {
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const iW = tmpImg.width;
        const iH = tmpImg.height;
        const boxSize = Math.round(Math.min(iW, iH) * 0.12); // กรอบ ~12% ของภาพ
        const cols = 4;
        const rows = Math.ceil(mockCount / cols);
        for (let b = 0; b < mockCount; b++) {
          const col = b % cols;
          const row = Math.floor(b / cols);
          // กระจาย box แบบ grid + สุ่มเล็กน้อย
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
      tmpImg.src = URL.createObjectURL(file);
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
 
  // 🟢 คำนวณความแม่นยำเฉลี่ยเพื่อส่งไปเก็บในประวัติ
  let avgConf = 0;
  if (data.boxes && data.boxes.length > 0) {
    let totalConf = 0;
    data.boxes.forEach(b => totalConf += b.conf);
    avgConf = ((totalConf / data.boxes.length) * 100).toFixed(2);
  }
 
  // ไม่ต้องเรียก updateResults แล้ว เพราะ showImage จะเรียก displayResults ให้อัตโนมัติ
  addHistory(data.count, data.time_sec, finalCode, avgConf); // 🟢 ส่งค่า avgConf ไปด้วย
}


function displayResults(result) {
  const piecesPerBox = 30; // 🟢 แก้เป็น 30 ชิ้น=1กล่อง
  const boxes = (result.count / piecesPerBox).toFixed(1);
  const thaiName = productMap[result.product_detected] || 'ไม่ระบุ';
 
  // 🟢 คำนวณความแม่นยำเฉลี่ย
  let avgConf = 0;
  if (result.boxes && result.boxes.length > 0) {
    let totalConf = 0;
    result.boxes.forEach(b => totalConf += b.conf);
    avgConf = ((totalConf / result.boxes.length) * 100).toFixed(2);
  }

  document.getElementById('resCode').innerText = result.product_detected;
  document.getElementById('resNameTh').innerText = `กะหรี่พัฟไส้${thaiName}`;
  document.getElementById('resOperator').innerText = document.getElementById('operator').value;
  document.getElementById('resPieces').innerText = result.count;
  document.getElementById('resBox').innerText = boxes;
  document.getElementById('resTime').innerText = result.time_sec;
  document.getElementById('resConf').innerText = avgConf; // 🟢 แสดงค่าความแม่นยำ
  document.getElementById('resStatus').innerText = '✓ สำเร็จ';
  document.getElementById('resStatus').style.background = 'var(--btn-green)';
}
 
function updateResults(count, timeSec, code) {
  const piecesPerBox = 10;
  const boxes = (count / piecesPerBox).toFixed(1);
  const thaiName = productMap[code] || 'ไม่ระบุ';
  const operator = document.getElementById('operator').value;
 
  document.getElementById('resCode').innerText = code;
  document.getElementById('resNameTh').innerText = `กะหรี่พัฟไส้${thaiName}`;
  document.getElementById('resOperator').innerText = operator;
  document.getElementById('resPieces').innerText = count;
  document.getElementById('resBox').innerText = boxes;
  document.getElementById('resTime').innerText = timeSec;
  document.getElementById('resStatus').innerText = '✓ สำเร็จ';
  document.getElementById('resStatus').style.background = 'var(--btn-green)';
}
 
// ========== HISTORY - Card Layout ==========
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

  // ❌ ลบ 2 บรรทัดนี้ออก
  // if (historyData.length > 10) historyData.pop();

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
        <div class="h-time">⚡ ${item.time}s | 🎯 ${item.accuracy}%</div> <!-- 🟢 แสดงความแม่นยำใน Card ประวัติ -->
      </div>
    </div>
  `).join('');
}
 
// ========== SAVE ==========
function saveData() {
  if (historyData.length === 0) {
    alert('ไม่มีข้อมูลให้บันทึก กรุณาตรวจจับภาพก่อน');
    return;
  }
  alert(`บันทึกข้อมูลเรียบร้อย ${historyData.length} รายการ\nเตรียมส่งมอบไปยัง Google Sheets`);
}


// ========== SAVE TO GOOGLE SHEETS ==========

// 🔴 นำ URL ของเว็บแอปที่ได้จาก Google Apps Script มาใส่ในเครื่องหมายคำพูดด้านล่าง
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
      resetAll(); // ✅ เรียก reset หลังบันทึกสำเร็จ
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

// ✅ ฟังก์ชันรีเซ็ตทุกอย่างเพื่อรับชุดรูปถัดไป
function resetAll() {
  // Revoke Object URLs ทั้งหมดก่อนล้าง
  document.querySelectorAll('#thumbStrip img').forEach(img => {
    URL.revokeObjectURL(img.src);
  });

  // รีเซ็ต state
  imageFiles = [];
  imageResults = [];
  currentIndex = 0;
  historyData = [];
  detectCount = 0;

  // รีเซ็ต UI
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



