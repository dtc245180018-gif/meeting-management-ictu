# Sprint 4 — Hướng dẫn vận hành US25–US28

## 1. Phạm vi đã hoàn thành

| US | Chức năng | Vị trí trên giao diện |
| --- | --- | --- |
| US25 | Đặt lịch qua chatbot Gemini và xác nhận giao dịch | Nút **Trợ lý AI** ở góc dưới bên phải |
| US26 | Gợi ý, xếp hạng phòng phù hợp | **Tạo lịch họp → Gợi ý phòng thông minh** |
| US27 | Check-in/check-out bằng QR | Thanh bên → **Check-in QR** |
| US28 | Đồng bộ HRM/ERP | **Quản trị → Đồng bộ HRM/ERP** |

## 2. Cấu hình

Các biến sau nằm trong `.env` của máy chạy và không được commit giá trị bí mật:

```ini
# US25 — nếu thiếu khóa, biểu mẫu/transaction vẫn hoạt động nhưng không gọi Gemini thật.
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite

# US27
QR_TOKEN_MINUTES=720
QR_CHECKIN_EARLY_MINUTES=30
QR_CHECKOUT_GRACE_MINUTES=60

# US28 — connector mock mặc định để demo và test offline
HRM_CONNECTOR=mock
HRM_MOCK_DATA_FILE=data/hrm_mock.json
HRM_DEFAULT_ROLE=participant
HRM_SYNC_INTERVAL_MINUTES=0
```

Không đặt Gemini key, mật khẩu, token HRM/ERP hoặc OAuth secret vào biến frontend
`VITE_*`. Frontend chỉ gọi backend; bí mật luôn ở phía server.

## 3. Quy tắc nghiệp vụ

### US25 — chatbot đặt lịch

Chatbot chỉ thu thập và chuẩn hóa dữ liệu. Trước khi ghi, backend kiểm tra thời
gian, lịch lặp, quyền phòng, sức chứa, thiết bị và xung đột. Người dùng phải chọn
phòng và xác nhận bản tóm tắt bằng token ký có thời hạn. Tạo cuộc họp, người tham
dự, phòng, thiết bị và reminder nằm trong cùng transaction.

### US26 — gợi ý phòng

`POST /api/rooms/recommendations` nhận khung giờ, số người, lịch lặp, thiết bị,
tiện ích bắt buộc, khu nhà ưu tiên và phân trang. Kết quả chỉ gồm phòng hoạt động,
còn trống trong tất cả lần lặp, đủ sức chứa và tài khoản có quyền đặt. Thứ tự ổn
định theo điểm, mức dư chỗ, tên và ID; mỗi mục có lý do để giải thích đề xuất.

### US27 — QR tham dự

Mỗi mã được ký HMAC và gắn với `booking_id`, `room_id`, hạn dùng. Chỉ người tổ
chức hoặc Admin tạo QR. Chỉ người tổ chức, Admin hoặc người được mời mới kiểm tra
và ghi nhận tham dự. Backend kiểm tra chữ ký, phòng, trạng thái cuộc họp, khung
giờ và thứ tự check-in trước check-out. Gửi lại cùng thao tác không tạo bản ghi
trùng; mọi lần thành công hoặc bị từ chối được lưu audit.

### US28 — HRM/ERP

Chỉ Admin truy cập. Đồng bộ ưu tiên `external_id`, đối chiếu thêm email, tạo tài
khoản mới với vai trò mặc định và bắt đổi mật khẩu. Chạy lại cùng dữ liệu sẽ bỏ
qua thay vì tạo trùng. Trạng thái phòng ban/hoạt động được cập nhật, lịch sử cuộc
họp cũ không bị xóa. Một bản ghi lỗi không làm rollback các bản ghi hợp lệ khác.

`mock` là adapter chạy được thật trong hệ thống nhưng dùng file nguồn cục bộ.
Khi doanh nghiệp cung cấp API HRM/ERP, thay adapter nguồn bằng kết nối HTTP có
xác thực; không thay đổi hợp đồng API, giao diện hay logic upsert.

## 4. Kiểm thử tự động

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm test -- --run
npm run lint
npm run build
npm audit
```

Các test Sprint 4 bao phủ quyền truy cập, xếp hạng ổn định, không có kết quả,
thiết bị bận, QR bị sửa, người ngoài, cuộc họp hủy, idempotency, audit, đồng bộ
từng phần, chạy lại và cập nhật nhân viên.

## 5. API Sprint 4

| Method | Endpoint | Quyền |
| --- | --- | --- |
| POST | `/api/chatbot/conversation` | Tài khoản đăng nhập |
| POST | `/api/chatbot/bookings/preview` | Organizer/Admin |
| POST | `/api/chatbot/bookings/confirm` | Organizer/Admin |
| POST | `/api/rooms/recommendations` | Tài khoản đăng nhập |
| GET | `/api/bookings/{booking_id}/qr` | Organizer cuộc họp/Admin |
| POST | `/api/bookings/qr/inspect` | Thành viên cuộc họp |
| POST | `/api/bookings/qr/check-in` | Thành viên cuộc họp |
| POST | `/api/bookings/qr/check-out` | Thành viên cuộc họp |
| GET | `/api/admin/integrations/hrm/status` | Admin |
| POST | `/api/admin/integrations/hrm/sync` | Admin |
| GET | `/api/admin/integrations/hrm/history` | Admin |
