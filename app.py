from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import time
from PIL import Image
import io
import gc        # ✅ เพิ่ม: เคลียร์ RAM หลังทุก request
import psutil    # ✅ เพิ่ม: ตรวจสอบ RAM (pip install psutil)
import torch     # ✅ เพิ่ม: เคลียร์ torch cache
 
app = Flask(__name__)
CORS(app)
 
# ===================================================
# ⚙️  ปรับค่าตรงนี้เพื่อแก้ปัญหานับเกิน
# ---------------------------------------------------
CONF_THRESHOLD = 0.5   # ขั้น 3: ถ้านับเกินให้ขึ้นเป็น 0.6 → 0.65 → 0.7
IOU_THRESHOLD  = 0.45  # ขั้น 2: ถ้า box ซ้อนกันให้ลดเป็น 0.3 → 0.25
MAX_IMAGE_SIZE = 1280  # ขั้น 4: จำกัดขนาดภาพ (px) ป้องกัน tile ซ้ำ
DEBUG_PRINT    = True  # ขั้น 1: True = พิมพ์ log ทุก box ออก terminal
# ===================================================
 
try:
    model = YOLO('best_khunya_6.pt')
    print(f"[OK] โหลดโมเดลสำเร็จ | conf={CONF_THRESHOLD} iou={IOU_THRESHOLD}")
except Exception as e:
    print(f"[ERR] โหลดโมเดลไม่ได้: {e}")
 
 
def resize_if_needed(image, max_size):
    """
    ขั้น 4: Resize ภาพถ้าใหญ่เกิน max_size
    คืนค่า (ภาพที่ resize แล้ว, scale_factor)
    scale_factor ใช้แปลง box coordinates กลับเป็นพิกัดต้นฉบับ
    """
    w, h = image.size
    scale = 1.0
    if w > max_size or h > max_size:
        scale = max_size / max(w, h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        image = image.resize((new_w, new_h), Image.LANCZOS)
        print(f"  [Resize] {w}x{h} -> {new_w}x{new_h} (scale={scale:.3f})")
    return image, scale
 
 
def check_overlap(boxes_data):
    """
    ขั้น 1: ตรวจหา box ที่ศูนย์กลางใกล้กันเกิน threshold
    ถ้าพบจะพิมพ์เตือนใน terminal
    """
    OVERLAP_DIST = 40  # px -- ถ้าศูนย์กลางใกล้กันน้อยกว่านี้ถือว่าซ้ำ
    centers = []
    for b in boxes_data:
        x1, y1, x2, y2 = b["box"]
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        centers.append((cx, cy, b["label"], b["conf"]))
 
    overlap_found = False
    for i in range(len(centers)):
        for j in range(i + 1, len(centers)):
            dx = abs(centers[i][0] - centers[j][0])
            dy = abs(centers[i][1] - centers[j][1])
            dist = (dx**2 + dy**2) ** 0.5
            if dist < OVERLAP_DIST:
                if not overlap_found:
                    print(f"  [WARN] พบ Box ที่อาจซ้อนกัน (ระยะศูนย์กลาง < {OVERLAP_DIST}px):")
                    overlap_found = True
                print(f"    Box{i+1} center=({centers[i][0]:.0f},{centers[i][1]:.0f})"
                      f" <-> Box{j+1} center=({centers[j][0]:.0f},{centers[j][1]:.0f})"
                      f"  dist={dist:.1f}px")
 
    if not overlap_found:
        print(f"  [OK] ไม่พบ box ซ้อนกัน (threshold={OVERLAP_DIST}px)")
 
 
@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
 
    file = request.files['image']
    image = Image.open(io.BytesIO(file.read())).convert("RGB")
    orig_w, orig_h = image.size
    start_time = time.time()
 
    print(f"\n{'='*55}")
    print(f"[IN] รับภาพ: {file.filename}  ขนาด: {orig_w}x{orig_h}px")
    print(f"[CFG] conf={CONF_THRESHOLD}  iou={IOU_THRESHOLD}  max_size={MAX_IMAGE_SIZE}")
 
    # ขั้น 4: Resize ก่อนส่งโมเดล
    image_for_model, scale = resize_if_needed(image, MAX_IMAGE_SIZE)
 
    # ขั้น 2+3: ส่งพร้อม conf และ iou ที่ปรับแล้ว
    results = model(image_for_model, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD)
 
    boxes_data = []
    detected_classes = []
 
    for r in results:
        raw_count = len(r.boxes)
        print(f"  [YOLO raw boxes] {raw_count}")
 
        for idx, box in enumerate(r.boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            c     = int(box.cls)
            conf  = float(box.conf)
            label = model.names[c]
 
            # ขั้น 4: แปลงพิกัดกลับเป็นภาพต้นฉบับ
            if scale != 1.0:
                x1, y1, x2, y2 = x1/scale, y1/scale, x2/scale, y2/scale
 
            boxes_data.append({
                "box":   [round(x1), round(y1), round(x2), round(y2)],
                "label": label,
                "conf":  round(conf, 2)
            })
            detected_classes.append(label)
 
            # ขั้น 1: Debug print ทุก box
            if DEBUG_PRINT:
                w_box = round(x2 - x1)
                h_box = round(y2 - y1)
                print(f"    Box{idx+1:02d}: {label} conf={conf:.2f}"
                      f"  [{round(x1)},{round(y1)}->{round(x2)},{round(y2)}]"
                      f"  {w_box}x{h_box}px")
 
    # สรุปชื่อไส้ที่เจอมากที่สุด
    product_detected = "UNKNOWN"
    if detected_classes:
        product_detected = max(set(detected_classes), key=detected_classes.count)
 
    process_time = round(time.time() - start_time, 3)
    final_count  = len(boxes_data)
 
    # บันทึกขนาดก่อน del
    model_size_str = f"{image_for_model.size[0]}x{image_for_model.size[1]}"
 
    print(f"  [RESULT] product={product_detected}  count={final_count}  time={process_time}s")
 
    # ตรวจสอบ RAM ที่เหลืออยู่
    ram = psutil.virtual_memory()
    ram_used_pct = ram.percent
    print(f"  [RAM] ใช้ไป {ram_used_pct:.1f}%  ({ram.used // 1024**2} MB / {ram.total // 1024**2} MB)")
    if ram_used_pct > 80:
        print(f"  [WARN] RAM เหลือน้อย! ผลลัพธ์อาจไม่แม่นยำ → แนะนำ restart app.py")
 
    # ขั้น 1: ตรวจหา box ซ้อนกัน
    if DEBUG_PRINT and final_count > 1:
        check_overlap(boxes_data)
 
    print(f"{'='*55}\n")
 
    # ✅ เคลียร์ memory หลังทุก request ป้องกัน RAM สะสม
    del image, image_for_model, results
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
 
    return jsonify({
        "product_detected": product_detected,
        "count":            final_count,
        "boxes":            boxes_data,
        "time_sec":         process_time,
        "debug": {
            "orig_size":  f"{orig_w}x{orig_h}",
            "model_size": model_size_str,
            "conf":       CONF_THRESHOLD,
            "iou":        IOU_THRESHOLD,
            "scale":      round(scale, 4),
            "ram_used":   f"{ram_used_pct:.1f}%",   # ✅ ดูได้ใน DevTools
            "ram_warn":   ram_used_pct > 80
        }
    })
 
 
# ✅ เพิ่ม endpoint สำหรับเช็ค RAM จาก browser ได้เลย
# เปิด http://127.0.0.1:5000/health
@app.route('/health', methods=['GET'])
def health():
    ram = psutil.virtual_memory()
    return jsonify({
        "status":     "ok",
        "ram_used":   f"{ram.percent:.1f}%",
        "ram_free_mb": ram.available // 1024**2,
        "ram_warn":   ram.percent > 80,
        "conf":       CONF_THRESHOLD,
        "iou":        IOU_THRESHOLD,
    })
 
 
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
    