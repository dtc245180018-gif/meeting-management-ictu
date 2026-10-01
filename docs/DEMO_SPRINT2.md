# Kịch bản demo thủ công đầy đủ Sprint 2 (US09–US16)

## 1. Chuẩn bị

Tạo cấu hình local lần đầu:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Đưa dữ liệu về trạng thái sạch:

```powershell
cd backend
python scripts/reset_demo_data.py
python -m uvicorn app.main:app --reload
```

Terminal thứ hai:

```powershell
cd frontend
npm install
npm run dev
```

Mở `http://localhost:5173`. Trạng thái sạch gồm 10 nhân viên, 10 phòng, 6
thiết bị; chưa có cuộc họp, booking hoặc reminder. Thiết bị `TB-VC-01` được đặt
sẵn trạng thái bảo trì để demo US13.

## 2. Mở đầu (30 giây)

> Sprint 2 mở rộng hệ thống họp nội bộ ICTU bằng quản trị phòng/thiết bị, đặt
> thiết bị theo transaction, xuất lịch Google/Outlook và nhắc lịch. Phần đăng
> nhập đầy đủ thuộc Sprint 3; Sprint 2 chỉ dùng ADMIN_EMAILS cho API quản trị.

## 3. US10 — Sức chứa phòng (1 phút)

1. Mở **Phòng họp**, bấm **Xem danh sách phòng**.
2. Chỉ ra mỗi thẻ có tên, vị trí, loại và sức chứa.
3. Nhập một khung giờ tương lai và sức chứa `20`, bấm **Xem phòng đang trống**.
4. Xác nhận kết quả không có phòng nào dưới 20 chỗ.
5. Thử thêm bộ lọc khu nhà, tầng và thiết bị phòng để chứng minh bộ lọc Sprint 1 vẫn hoạt động.

## 4. US11 — Quản trị phòng (2 phút)

1. Mở **Quản trị** → **Quản lý phòng**.
2. Thêm `Phòng E201`, sức chứa `14`, vị trí `Tầng 2 - Khu E`, khu `Khu E`, tầng `2`.
3. Thêm lại cùng tên để nhận thông báo trùng tên.
4. Thử sức chứa `0`; form/API phải từ chối.
5. Bấm **Sửa**, đổi sức chứa thành `18`, lưu lại.
6. Bấm **Khóa phòng**. Phòng vẫn còn trong danh sách quản trị/lịch sử nhưng không còn ở danh sách phòng có thể đặt.
7. Bấm **Kích hoạt** để đưa phòng trở lại hoạt động.

## 5. US14 — Quản trị thiết bị (2 phút)

1. Trong **Quản trị**, chọn **Quản lý thiết bị**.
2. Thêm `TB-DEMO-01 | Thiết bị demo | demo | Kho thiết bị`.
3. Thử thêm lại cùng mã để xem lỗi trùng mã.
4. Bấm **Sửa**, chuyển sang **Bảo trì**, lưu và kiểm tra trạng thái.
5. Chuyển lại **Sẵn sàng**, sau đó bấm **Khóa**.
6. Giải thích dữ liệu có lịch sử đặt chỉ bị xóa mềm, không xóa khỏi database.

## 6. US13 — Trạng thái thiết bị theo thời gian (1 phút)

1. Mở **Thiết bị**.
2. Chỉ ra `TB-VC-01` là **Đang bảo trì**, không thể được chọn khi tạo lịch.
3. Lọc loại `projector`, trạng thái `Sẵn sàng`.
4. Nhập khung thời gian tương lai và bấm **Tìm thiết bị**.
5. Sau bước tạo lịch ở phần tiếp theo, tìm lại cùng khung giờ để thiết bị đã chọn hiển thị **Đã được đặt**.

## 7. US12 và US16 — Tạo lịch với nhiều thiết bị và reminder (3 phút)

1. Mở **Tạo lịch họp**.
2. Nhập tên `Demo Sprint 2 - Tài nguyên`, người tổ chức `leader@example.com`.
3. Mời `employee.one@example.com` và `employee.two@example.com`.
4. Nhập **Số người dự kiến** lớn hơn hoặc bằng 3, chọn một giờ trong tương lai
   theo giờ Việt Nam và chọn **Nhắc trước 30 phút**.
5. Bấm **Tìm phòng phù hợp**, chọn `Phòng A203`.
6. Bấm **Tìm thiết bị**, chọn `TB-MC-01` và `TB-MIC-01`.
7. Bấm **Tạo lịch họp**. Xác nhận thông báo tạo lịch, phòng và 2 thiết bị thành công.
8. Mở **Lịch họp** → **Xem chi tiết** để thấy phòng, thiết bị và người tham dự.
9. Mở **Tổng quan**, kiểm tra reminder của người tổ chức trong **Thông báo của bạn** và bấm để đánh dấu đã đọc.

Điểm cần nói: meeting, RoomBooking, EquipmentBooking và reminder được ghi trong
cùng transaction. Nếu một thiết bị xung đột, toàn bộ request rollback.

## 8. US12 — Xung đột và lịch lặp (2 phút)

1. Tạo cuộc họp thứ hai cùng khung giờ, chọn lại `TB-MC-01`.
2. Backend trả lỗi xung đột; cuộc họp thứ hai không được tạo.
3. Tạo lịch lặp hằng tuần 2 lần với `TB-MC-02`.
4. Tạo lịch khác chiếm `TB-MC-02` ở tuần thứ hai, rồi thử lại lịch lặp.
5. Backend kiểm tra mọi lần lặp và trả HTTP 409; không có lần lặp nào được ghi.

Nếu cần chứng minh nhanh bằng test tự động:

```powershell
cd backend
pytest -q tests/test_sprint2.py
```

## 9. US15 — Google Calendar và Outlook/ICS (1 phút)

1. Tại thẻ cuộc họp, bấm **Thêm vào Google Calendar** để mở form tạo sự kiện Google.
   Kiểm tra người tham dự xuất hiện trong danh sách khách mời và thời gian trùng
   với giờ hiển thị trên hệ thống.
2. Bấm **Tải lịch Outlook/ICS** để tải file `.ics`.
3. Mở file bằng trình soạn thảo hoặc Outlook; kiểm tra tiêu đề, mô tả, thời gian,
   phòng, người tổ chức và người tham dự.
4. Giải thích UID của cùng một cuộc họp không đổi. Đây là tích hợp một chiều;
   Sprint 2 không lưu OAuth secret/token và không giả lập đồng bộ hai chiều.

## 10. US09 — Hủy và giải phóng tài nguyên (2 phút)

1. Ghi nhớ phòng và thiết bị của cuộc họp `Demo Sprint 2 - Tài nguyên`.
2. Mở menu `⋯`, chọn **Hủy lịch** và xác nhận.
3. Giao diện thông báo phòng, thiết bị và reminder đã được giải phóng.
4. Tìm lại đúng phòng/thiết bị trong cùng khung giờ; chúng phải xuất hiện là sẵn sàng.
5. Tải lại ICS của cuộc họp đã hủy; file có `METHOD:CANCEL` và `STATUS:CANCELLED`.
   Giao diện không còn nút tạo mới sự kiện Google cho cuộc họp đã hủy.
6. Hủy lại qua API không gây lỗi 500; người khác hủy thay nhận HTTP 403.

## 11. Kiểm tra hồi quy Sprint 1 (2 phút)

1. Tạo cuộc họp không có phòng/thiết bị.
2. Dùng gợi ý email, **Mời tất cả mọi người**, gợi ý giờ trống.
3. Sửa tiêu đề/người tham dự; tìm và đặt phòng sau khi tạo.
4. Lọc lịch theo email, trạng thái, ngày và chuyển trang.
5. Thu gọn/mở sidebar, kiểm tra các trang không chồng chéo trên màn hình laptop.

## 12. Đối chiếu nghiệm thu

| User Story | Phần demo |
| --- | --- |
| US09 | Hủy và giải phóng phòng, thiết bị, reminder |
| US10 | Thẻ phòng và lọc sức chứa |
| US11 | CRUD/xóa mềm phòng, trùng tên, sức chứa hợp lệ |
| US12 | Chọn nhiều thiết bị, transaction, conflict và lịch lặp |
| US13 | Trạng thái available/booked/maintenance/inactive theo thời gian |
| US14 | CRUD, bảo trì, kích hoạt và khóa thiết bị |
| US15 | Google Calendar link và Outlook/ICS một chiều |
| US16 | Chọn thời gian nhắc, thông báo trong ứng dụng, console/SMTP nền |

## 13. Kết thúc và làm sạch

Sau khi tập demo, chạy lại:

```powershell
cd backend
python scripts/reset_demo_data.py
```

Lệnh này xóa meeting, participant, booking và reminder, rồi khôi phục đúng 10
phòng, 10 nhân viên và 6 thiết bị mẫu để buổi demo chính bắt đầu từ dữ liệu sạch.
