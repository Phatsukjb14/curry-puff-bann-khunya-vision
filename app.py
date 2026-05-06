from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import time
from PIL import Image
import io
import gc
import psutil
import torch

app = Flask(__name__)
CORS(app)

# ===================================================
# ⚙️  ปรับค่าตรงนี้เพื่อแก้ปัญหานับเกิน
# ---------------------------------------------------
# ✅ FIX: เพิ่ม CONF_THRESHOLD 0.35 → 0.50
#         ลด false positive (เงา/ขอบถาด นับเป็นชิ้น)
# ✅ FIX: ลด IOU_THRESHOLD  0.40 → 0.35
#         ลด bounding box ที่ซ้อนทับกัน
# ✅ NEW: AUTO_CROP_BLACK = True — ตัดพื้นที่สีดำฝั่ง Python ด้วย
# ---------------------------------------------------
CONF_THRESHOLD   = 0.80   # ↑ จาก 0.35 — ลด false positive
IOU_THRESHOLD    = 0.60   # ↓ จาก 0.40 — ลด box ซ้อน
MAX_IMAGE_SIZE   = 1280   # จำกัดขนาดภาพ (px)
AUTO_CROP_BLACK  = True   # ตัดพื้นที่ดำออกก่อน predict
DARK_PIXEL_THRESH = 15    # ค่า brightness ที่ถือว่า "ดำ"
DEBUG_PRINT      = True   # True = พิมพ์ log ทุก box
# ===================================================

try:
    model = YOLO('best_khunya_6.pt')
    print(f"[OK] โหลดโมเดลสำเร็จ | conf={CONF_THRESHOLD} iou={IOU_THRESHOLD}")
except Exception as e:
    print(f"[ERR] โหลดโมเดลไม่ได้: {e}")


def resize_if_needed(image, max_size):
    """Resize ภาพถ้าใหญ่เกิน max_size — คืน (ภาพ, scale)"""
    w, h = image.size
    scale = 1.0
    if w > max_size or h > max_size:
        scale = max_size / max(w, h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        image = image.resize((new_w, new_h), Image.LANCZOS)
        print(f"  [Resize] {w}x{h} -> {new_w}x{new_h} (scale={scale:.3f})")
    return image, scale


# ✅ NEW: ตัดพื้นที่สีดำ (Black Padding) ออกก่อนส่ง YOLO
def crop_black_padding(image, dark_thresh=15):
    """
    ตัดพื้นที่ขอบสีดำออกจากภาพ
    คืน (ภาพที่ crop แล้ว, crop_box=(x1,y1,x2,y2))
    ถ้าไม่มีพื้นที่ดำ คืนภาพต้นฉบับ
    """
    import numpy as np
    arr = np.array(image)       # H x W x 3
    # mask: pixel ที่ brightness > dark_thresh ในอย่างน้อย 1 channel
    mask = (arr[:, :, 0] > dark_thresh) | \
           (arr[:, :, 1] > dark_thresh) | \
           (arr[:, :, 2] > dark_thresh)

    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)

    if not rows.any() or not cols.any():
        print("  [Crop] ไม่พบ pixel ที่ไม่ดำ — ใช้ภาพต้นฉบับ")
        return image, None

    y1, y2 = np.where(rows)[0][[0, -1]]
    x1, x2 = np.where(cols)[0][[0, -1]]
    w_orig, h_orig = image.size

    # ถ้า crop เปลี่ยนน้อยกว่า 5% → ไม่ crop (ไม่คุ้ม overhead)
    crop_area  = (x2 - x1) * (y2 - y1)
    total_area = w_orig * h_orig
    ratio = crop_area / total_area if total_area > 0 else 1.0

    if ratio > 0.95:
        print(f"  [Crop] ไม่มีพื้นที่สีดำมีนัยสำคัญ (ratio={ratio:.2f})")
        return image, None

    cropped = image.crop((int(x1), int(y1), int(x2), int(y2)))
    print(f"  [Crop] {w_orig}x{h_orig} → {cropped.width}x{cropped.height} "
          f"(box=[{x1},{y1},{x2},{y2}] ratio={ratio:.2f})")
    return cropped, (int(x1), int(y1), int(x2), int(y2))


def check_overlap(boxes_data):
    """ตรวจหา box ที่ศูนย์กลางใกล้กันเกิน threshold"""
    OVERLAP_DIST = 40
    centers = []
    for b in boxes_data:
        x1, y1, x2, y2 = b["box"]
        centers.append(((x1 + x2) / 2, (y1 + y2) / 2, b["label"], b["conf"]))

    overlap_found = False
    for i in range(len(centers)):
        for j in range(i + 1, len(centers)):
            dist = ((centers[i][0]-centers[j][0])**2 + (centers[i][1]-centers[j][1])**2) ** 0.5
            if dist < OVERLAP_DIST:
                if not overlap_found:
                    print(f"  [WARN] พบ Box ที่อาจซ้อนกัน (ระยะ < {OVERLAP_DIST}px):")
                    overlap_found = True
                print(f"    Box{i+1} ({centers[i][0]:.0f},{centers[i][1]:.0f}) "
                      f"<-> Box{j+1} ({centers[j][0]:.0f},{centers[j][1]:.0f}) dist={dist:.1f}px")

    if not overlap_found:
        print(f"  [OK] ไม่พบ box ซ้อนกัน (threshold={OVERLAP_DIST}px)")


@app.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file       = request.files['image']
    image      = Image.open(io.BytesIO(file.read())).convert("RGB")
    orig_w, orig_h = image.size
    start_time = time.time()

    print(f"\n{'='*60}")
    print(f"[IN] รับภาพ: {file.filename}  ขนาด: {orig_w}x{orig_h}px")
    print(f"[CFG] conf={CONF_THRESHOLD}  iou={IOU_THRESHOLD}  max_size={MAX_IMAGE_SIZE}  autoCrop={AUTO_CROP_BLACK}")

    # ✅ STEP 1: Auto-crop black padding
    crop_box = None
    if AUTO_CROP_BLACK:
        image, crop_box = crop_black_padding(image, DARK_PIXEL_THRESH)

    # ✅ STEP 2: Resize ก่อนส่งโมเดล
    image_for_model, scale = resize_if_needed(image, MAX_IMAGE_SIZE)
    model_input_w, model_input_h = image_for_model.size

    # ✅ STEP 3: Predict ด้วย conf และ iou ที่ปรับแล้ว
    results = model(image_for_model, conf=CONF_THRESHOLD, iou=IOU_THRESHOLD)

    boxes_data       = []
    detected_classes = []

    for r in results:
        raw_count = len(r.boxes)
        print(f"  [YOLO raw boxes] {raw_count}")

        for idx, box in enumerate(r.boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            c     = int(box.cls)
            conf  = float(box.conf)
            label = model.names[c]

            # แปลงพิกัดกลับตาม scale
            if scale != 1.0:
                x1, y1, x2, y2 = x1/scale, y1/scale, x2/scale, y2/scale

            # ✅ แปลงพิกัดกลับตาม crop_box
            if crop_box is not None:
                cx_off, cy_off = crop_box[0], crop_box[1]
                x1 += cx_off; y1 += cy_off
                x2 += cx_off; y2 += cy_off

            boxes_data.append({
                "box":   [round(x1), round(y1), round(x2), round(y2)],
                "label": label,
                "conf":  round(conf, 2)
            })
            detected_classes.append(label)

            if DEBUG_PRINT:
                print(f"    Box{idx+1:02d}: {label} conf={conf:.2f}"
                      f"  [{round(x1)},{round(y1)}->{round(x2)},{round(y2)}]"
                      f"  {round(x2-x1)}x{round(y2-y1)}px")

    product_detected = "UNKNOWN"
    if detected_classes:
        product_detected = max(set(detected_classes), key=detected_classes.count)

    process_time = round(time.time() - start_time, 3)
    final_count  = len(boxes_data)
    model_size_str = f"{model_input_w}x{model_input_h}"

    print(f"  [RESULT] product={product_detected}  count={final_count}  time={process_time}s")

    ram = psutil.virtual_memory()
    ram_used_pct = ram.percent
    print(f"  [RAM] {ram_used_pct:.1f}%  ({ram.used // 1024**2} MB / {ram.total // 1024**2} MB)")
    if ram_used_pct > 80:
        print(f"  [WARN] RAM เหลือน้อย! แนะนำ restart app.py")

    if DEBUG_PRINT and final_count > 1:
        check_overlap(boxes_data)

    print(f"{'='*60}\n")

    # เคลียร์ memory
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
            "orig_size":   f"{orig_w}x{orig_h}",
            "model_size":  model_size_str,
            "crop_box":    crop_box,
            "conf":        CONF_THRESHOLD,
            "iou":         IOU_THRESHOLD,
            "scale":       round(scale, 4),
            "ram_used":    f"{ram_used_pct:.1f}%",
            "ram_warn":    ram_used_pct > 80
        }
    })


@app.route('/health', methods=['GET'])
def health():
    ram = psutil.virtual_memory()
    return jsonify({
        "status":      "ok",
        "ram_used":    f"{ram.percent:.1f}%",
        "ram_free_mb": ram.available // 1024**2,
        "ram_warn":    ram.percent > 80,
        "conf":        CONF_THRESHOLD,
        "iou":         IOU_THRESHOLD,
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

