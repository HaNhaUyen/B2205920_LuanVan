# Hướng nâng độ chính xác AI nhận diện hình ảnh cho Travela

## Vấn đề gốc của bản hiện tại

Bản hiện tại dùng **CLIP zero-shot retrieval + prompt matching**. Nghĩa là model đang suy luận theo mô tả chữ của điểm đến chứ **chưa được huấn luyện riêng trên bộ ảnh địa danh/tour thật của hệ thống**.

Vì vậy nó sẽ ổn ở mức demo, nhưng sẽ sai khi:
- ảnh có nhiều người che landmark
- ảnh chụp đêm / mưa / ngược sáng
- ảnh góc lạ, crop sát, zoom mạnh
- nhiều địa danh có cảnh tương tự nhau (biển, phố cổ, núi, cổng chùa, cầu, quảng trường)

## Muốn nhận diện đúng hơn thì phải làm gì

### 1) Thu thập dữ liệu đúng bài toán

Tạo dataset riêng cho từng điểm đến và landmark:
- `data/train/<destination_or_landmark>/image_001.jpg`
- `data/val/<destination_or_landmark>/...`
- `data/test/<destination_or_landmark>/...`

Nên có tối thiểu:
- 200–500 ảnh / landmark nếu muốn mô hình học ổn
- nhiều góc chụp, sáng tối, ngày đêm, đông người, ít người
- cả ảnh “gây nhiễu” của các địa điểm tương tự để model học phân biệt

### 2) Gán nhãn đúng mức

Không chỉ gán nhãn theo `destination` chung chung, mà nên tách 2 tầng:
- **Tầng 1:** destination / region
- **Tầng 2:** landmark cụ thể

Ví dụ:
- Đà Nẵng
  - Cầu Rồng
  - Bà Nà Hills
  - Biển Mỹ Khê

Như vậy model sẽ không dồn hết mọi ảnh của Đà Nẵng vào cùng một nhãn lớn.

### 3) Augmentation bắt buộc

Khi train cần augment để giống ảnh người dùng tải lên thực tế:
- random crop
- blur nhẹ
- brightness / contrast
- compression JPEG
- rotate nhẹ
- scale / resize
- occlusion nhỏ

Nếu không augment, model sẽ tốt trên ảnh đẹp nhưng yếu trên ảnh ngoài đời.

### 4) Chuyển từ zero-shot sang fine-tune

Các hướng phù hợp:
- fine-tune CLIP / SigLIP / ViT trên bộ ảnh landmark của bạn
- hoặc train classifier riêng cho landmark
- hoặc dùng retrieval embedding từ model đã fine-tune thay vì prompt text mặc định

Khuyến nghị thực tế:
- **giai đoạn 1:** fine-tune classifier theo landmark
- **giai đoạn 2:** dùng embedding retrieval để re-rank top K

### 5) Thêm tầng re-rank sau khi nhận diện

Không nên quyết định luôn bằng một lần suy luận.

Flow tốt hơn:
1. model vision trả về top 5 landmark gần nhất
2. re-rank lại theo:
   - điểm destination
   - metadata tour trong DB
   - scene type (beach/mountain/city/culture)
   - text trong ảnh nếu có OCR
3. chỉ nhận là “đúng” khi confidence vượt ngưỡng

### 6) Có ngưỡng từ chối kết quả

Hiện nhiều hệ thống demo sai vì **bắt model phải đoán bằng mọi giá**.

Nên thêm rule:
- confidence >= 0.70: nhận diện mạnh
- 0.45–0.69: trả top 3 gợi ý
- < 0.45: báo “không đủ chắc chắn”

Điều này làm UX thật hơn và ít đoán sai vô lý hơn.

### 7) Dùng ảnh tham chiếu thật từ hệ thống tour

Mỗi destination/landmark nên có:
- ảnh banner
- ảnh landmark chuẩn
- ảnh nhiều mùa/góc khác nhau

Sau đó build embedding gallery từ ảnh tham chiếu thật và so khớp với ảnh upload.

## Hướng triển khai nên làm tiếp trong project này

### Mức 1 – cải thiện nhanh
- tăng catalog landmark
- tăng prompt song ngữ Việt/Anh
- thêm OCR text trong ảnh
- thêm ngưỡng từ chối kết quả
- lưu log các ảnh đoán sai để phân tích

### Mức 2 – đủ tốt cho demo luận văn
- thu thập dataset landmark Việt Nam
- fine-tune model classification hoặc embedding
- đánh giá Top-1 / Top-3 accuracy trên tập test riêng
- tích hợp lại API `/vision/search`

### Mức 3 – gần hệ thống thật
- gallery embedding thật theo destination/landmark
- re-rank bằng metadata tour
- human-in-the-loop: admin xác nhận ảnh khó
- active learning: ảnh sai được đưa lại vào tập huấn luyện vòng sau

## Chỉ số cần đánh giá

Không nên chỉ nhìn một ví dụ đúng/sai. Cần đo:
- Top-1 Accuracy
- Top-3 Accuracy
- Precision / Recall theo landmark
- Confusion Matrix giữa các destination gần giống nhau
- tỷ lệ “từ chối đoán” hợp lệ
- thời gian suy luận / ảnh

## Kết luận ngắn

Muốn AI nhận diện đúng rõ rệt thì **không phải chỉnh frontend**, mà phải:
1. có dataset đúng
2. gán nhãn đúng
3. fine-tune model theo landmark thật
4. thêm re-rank + ngưỡng từ chối
5. đánh giá bằng bộ test riêng

Zero-shot CLIP chỉ là bước khởi đầu tốt cho demo, chưa phải điểm cuối cho độ chính xác cao.
