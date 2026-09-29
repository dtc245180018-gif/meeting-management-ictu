# Kịch bản demo Meeting Management ICTU

## 1. Chuẩn bị

Khởi động Backend và Frontend:

```powershell
cd backend
python scripts/seed_demo_data.py
python -m uvicorn app.main:app --reload
```

Mở một terminal khác:

```powershell
cd frontend
npm run dev
```

Mở `http://localhost:5173`.

Dữ liệu demo có thể nạp nhiều lần. Script không xóa dữ liệu thật và sẽ bỏ qua nhóm cuộc họp demo đã tồn tại.

## 2. Dữ liệu dùng trong buổi trình diễn

| Dữ liệu | Mục đích |
| --- | --- |
| Họp kế hoạch Sprint 1 | Hiển thị lịch sắp tới và phòng A203 đã đặt |
| Nghiệm thu nội bộ | Minh họa nhiều trạng thái lời mời và phòng B301 |
| Họp chưa đặt phòng | Minh họa cuộc họp cần tìm phòng sau |
| Lịch họp định kỳ | Minh họa hai lần lặp hằng tuần, đặt phòng D201 |
| Cuộc họp đã hủy | Minh họa lịch sử và trạng thái đã hủy |

## 3. Luồng demo đề xuất (8–10 phút)

### Bước 1 — Tổng quan (1 phút)

1. Mở trang **Tổng quan**.
2. Giới thiệu các số liệu: tổng lịch, lịch sắp tới, phòng đã đặt và lịch chưa có phòng.
3. Chỉ vào khu vực **Lịch gần nhất** để cho thấy các cuộc họp được sắp xếp theo thời gian bắt đầu.
4. Bấm **Lịch họp** trên sidebar để chuyển sang danh sách đầy đủ.

### Bước 2 — Tìm lịch theo email (1 phút)

1. Tại trang **Lịch họp**, chọn email `minhanh@ictu.edu.vn` hoặc gõ `minhanh`.
2. Chọn gợi ý email.
3. Bấm **Tìm** để xem lịch người đó tham gia.
4. Đổi trạng thái hoặc khoảng ngày để minh họa bộ lọc; dùng **Xóa** để trở về danh sách ban đầu.

### Bước 3 — Tạo cuộc họp và mời người tham dự (2 phút)

1. Mở **Tạo lịch họp**.
2. Nhập tiêu đề: `Demo lập kế hoạch truyền thông`.
3. Tại **Người tổ chức**, chọn `leader@ictu.edu.vn`.
4. Bấm **Mời tất cả mọi người**. Hệ thống thêm toàn bộ nhân viên ICTU nhưng tự loại người tổ chức.
5. Có thể xóa một người trong chip danh sách để minh họa chỉnh sửa.
6. Chọn thời gian trong tương lai và chọn lặp lại nếu cần.

### Bước 4 — Tìm và đặt phòng cùng lúc tạo lịch (2 phút)

1. Bấm **Tìm phòng phù hợp**.
2. Chọn một phòng phù hợp, ví dụ `Phòng A205` hoặc `Phòng B305`.
3. Bấm **Tạo lịch họp**.
4. Nhấn mạnh cuộc họp và đặt phòng được gửi trong cùng một yêu cầu; với lịch lặp, hệ thống kiểm tra tất cả lần lặp trước khi ghi dữ liệu.

### Bước 5 — Danh mục phòng (1 phút)

1. Mở **Phòng họp**.
2. Bấm **Xem danh sách phòng**.
3. Minh họa lọc cơ bản theo `Tất cả phòng`, `Phòng đang trống`, `Phòng đã đặt`, tòa/khu vực và tầng 2 hoặc tầng 3.
4. Nhập thời gian và sức chứa rồi bấm **Xem phòng đang trống** để minh họa tra cứu nâng cao theo khung giờ.

### Bước 6 — Tình huống chống trùng (tùy chọn, 1–2 phút)

1. Tạo một lịch lặp hằng tuần trong 2 lần, chọn cùng một phòng.
2. Chọn khoảng thời gian khiến một lần lặp trùng với lịch demo đã có.
3. Bấm tạo lịch.
4. Hệ thống trả lỗi `409`, không tạo lần lặp nào và dữ liệu cũ không bị thay đổi.

## 4. Điểm cần nhấn mạnh

- Đây là hệ thống họp nội bộ; người tổ chức có thể chọn nhân viên ICTU.
- Người tổ chức không bị thêm lại vào danh sách người tham dự.
- Email mời hiện được lưu dưới dạng danh sách người tham dự; gửi email thực tế và vòng đời chấp nhận/từ chối là phần mở rộng sau Sprint 1.
- Nút **Đăng xuất** hiện chỉ hiển thị thông báo “Chức năng đăng xuất đang được cập nhật” vì hệ thống chưa có đăng nhập/phân quyền.
