# Travela Vision Threshold Toolkit

Bộ công cụ tạo tập ảnh đánh giá và chọn ngưỡng cho `vision_search.py` của Travela.

## Quy mô mặc định

- 20 địa danh có trong dataset × 8 ảnh = 160 ảnh.
- 5 địa danh ngoài dataset × 8 ảnh = 40 ảnh.
- 5 nhóm ảnh không phải địa danh × 8 ảnh = 40 ảnh.
- Tổng dự kiến: **240 ảnh**.

Ảnh được tải từ Wikimedia Commons và `metadata.csv` lưu URL nguồn, giấy phép, tác giả. Script chỉ tạo tập ứng viên; người dùng phải duyệt thủ công vì kết quả tìm kiếm công khai có thể có ảnh sai nhãn.

## 1. Chép toolkit vào thư mục `ai-service`

Có thể giữ nguyên thư mục này hoặc chép `scripts/`, `dataset_plan.json` vào dự án.

## 2. Tải dataset

Chạy tại thư mục toolkit:

```bash
python scripts/download_threshold_dataset.py \
  --plan dataset_plan.json \
  --output threshold_dataset \
  --per-class 8
```

Tạo trang xem nhanh:

```bash
python scripts/make_review_gallery.py --dataset threshold_dataset
```

Mở `threshold_dataset/review_gallery.html`, kiểm tra từng ảnh. Trong `metadata.csv`, sửa `review_status` thành:

- `approved`: đúng nhãn và đủ chất lượng.
- `rejected`: sai nhãn, ảnh bản đồ, logo, ảnh ghép, quá mờ hoặc trùng lặp.

Nên thay ảnh bị loại để mỗi lớp còn ít nhất 6–8 ảnh.

## 3. Chạy CLIP và xuất điểm

Ví dụ toolkit nằm cạnh source và source AI là `D:/travela/ai-service`:

```bash
python scripts/evaluate_thresholds.py \
  --ai-root "D:/travela/ai-service" \
  --dataset threshold_dataset \
  --output results/predictions.csv
```

Để thử External Vision:

```bash
python scripts/evaluate_thresholds.py \
  --ai-root "D:/travela/ai-service" \
  --dataset threshold_dataset \
  --output results/predictions_with_external.csv \
  --with-external
```

`--with-external` cần Internet và API key Groq/OpenRouter, có thể phát sinh chi phí hoặc giới hạn lượt gọi.

## 4. Tìm bộ ngưỡng CLIP

```bash
python scripts/optimize_thresholds.py \
  --predictions results/predictions.csv \
  --output-dir results \
  --min-precision 0.90 \
  --min-ood-rejection 0.85
```

Kết quả:

- `results/threshold_grid_top50.csv`: 50 bộ ngưỡng tốt nhất.
- `results/best_thresholds.json`: chỉ số của bộ được chọn.
- `results/recommended_thresholds.env`: ba biến môi trường có thể chép vào `.env`.

Tiêu chí mặc định ưu tiên precision bằng F0.5, đồng thời xét recall và tỷ lệ từ chối ảnh ngoài dataset. Trong ứng dụng tour, trả sai địa danh nguy hiểm hơn chuyển sang External Vision nên precision được ưu tiên.

## 5. Tìm ngưỡng External Vision

Sau khi có file chạy với `--with-external`:

```bash
python scripts/optimize_external_thresholds.py \
  --predictions results/predictions_with_external.csv \
  --output-dir results
```

Kết quả:

- `recommended_external_thresholds.env`
- `external_threshold_grid.csv`

Lưu ý: script tự động đánh giá khả năng chấp nhận/từ chối. Độ chính xác tên cụ thể như “Big Ben” hay “Núi Phú Sĩ” vẫn cần kiểm tra thủ công vì tên trả về là văn bản tự do.

## 6. Cách diễn giải chỉ số

- `best_image_score`: cosine similarity cao nhất giữa ảnh truy vấn và ảnh mẫu.
- `confidence`: điểm chuẩn hóa nội bộ từ `final_score`, không phải xác suất thống kê.
- `top_gap`: `final_score(top1) - final_score(top2)`.
- Precision: trong các kết quả CLIP được chấp nhận, bao nhiêu kết quả đúng.
- Recall: trong các ảnh nội bộ hợp lệ, bao nhiêu ảnh được CLIP nhận đúng và chấp nhận.
- OOD rejection: tỷ lệ ảnh ngoài dataset/không phải địa danh được chuyển khỏi CLIP.

## 7. Quy tắc báo cáo luận văn

Không ghi rằng ngưỡng là “chuẩn của CLIP”. Nên ghi rằng chúng được chọn bằng grid search trên tập validation độc lập, ưu tiên precision và kiểm tra lại trên tập test. Để chặt chẽ hơn, chia `metadata.csv` thêm cột `split` theo tỷ lệ 70% validation và 30% test, chỉ chọn ngưỡng trên validation rồi báo cáo kết quả cuối trên test.
