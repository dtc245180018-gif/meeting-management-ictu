# Sprint 3 — Hướng dẫn vận hành US17–US24

## 1. Cấu hình bắt buộc

Backend đọc cấu hình từ `backend/.env` khi chạy trực tiếp hoặc `.env` ở thư mục
gốc khi chạy Docker Compose.

```ini
AUTH_REQUIRED=true
AUTH_SECRET_KEY=<chuỗi ngẫu nhiên tối thiểu 32 ký tự>
AUTH_TOKEN_MINUTES=480
INITIAL_ACCOUNT_PASSWORD=ICTU123
SPRINT3_SEED_ACCOUNTS=true
```

Tạo khóa bằng:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Không commit `.env`, token, mật khẩu SMTP hoặc OAuth Client Secret. Nếu
`AUTH_SECRET_KEY` chưa được cấu hình, hệ thống chỉ dùng
`GOOGLE_OAUTH_STATE_SECRET` làm khóa migration tạm thời khi giá trị đó đủ mạnh.

## 2. Tài khoản và vai trò

- `admin`: quản lý tài khoản, vai trò, phòng, thiết bị, quyền phòng, báo cáo và xuất file.
- `organizer`: tạo/chỉnh sửa/hủy cuộc họp của mình và đặt các phòng được phép.
- `participant`: xem lịch liên quan, thông báo và phản hồi lời mời; không tạo lịch.

Tài khoản mới có mật khẩu tạm `ICTU123`, được băm PBKDF2 với salt riêng và bắt
buộc đổi trước khi gọi API nghiệp vụ. Đổi vai trò, khóa tài khoản, đặt lại mật
khẩu hoặc đăng xuất sẽ tăng `token_version`, làm token cũ hết hiệu lực ngay.
Hệ thống từ chối khóa hoặc hạ quyền quản trị viên đang hoạt động cuối cùng.

## 3. Quyền phòng

Mặc định tài khoản được phép đặt mọi phòng. Quản trị viên có thể tạo chính sách
`can_book=false` kèm lý do cho từng cặp tài khoản–phòng. Chính sách được kiểm tra
ở cả ba lớp:

1. Danh mục phòng hiển thị trạng thái và lý do hạn chế.
2. API tìm phòng trống loại phòng bị hạn chế khỏi kết quả.
3. API tạo lịch kèm phòng và API đặt phòng riêng đều trả `403`, nên không thể
   bỏ qua giao diện bằng request trực tiếp.

## 4. Báo cáo và xuất file

Trang Quản trị → Báo cáo hỗ trợ lọc theo khoảng ngày, phòng, tầng và khu nhà.
Số liệu gồm tổng cuộc họp, trạng thái, lượt/phút sử dụng phòng, phòng dùng nhiều
nhất, số/tỷ lệ hủy, xu hướng theo ngày, người tổ chức và lý do hủy. Cuộc họp cũ
không có lý do được gom vào “Không ghi lý do”. Thời gian hiển thị theo
`Asia/Ho_Chi_Minh`.

Excel và PDF dùng đúng bộ lọc đang xem. Endpoint xuất file chỉ cho vai trò
`admin`; tên file có thời điểm xuất và nội dung có tiêu đề, khoảng thời gian,
múi giờ cùng bảng số liệu tiếng Việt.

## 5. API Sprint 3

| Chức năng | Endpoint |
| --- | --- |
| Đăng nhập | `POST /api/auth/login` |
| Phiên hiện tại | `GET /api/auth/me` |
| Đổi mật khẩu | `POST /api/auth/change-password` |
| Đăng xuất | `POST /api/auth/logout` |
| Danh sách/tạo tài khoản | `GET/POST /api/admin/users` |
| Sửa vai trò, khóa, reset mật khẩu | `PATCH /api/admin/users/{account_id}` |
| Xem quyền phòng | `GET /api/admin/users/{account_id}/room-permissions` |
| Đổi quyền phòng | `PUT /api/admin/users/{account_id}/room-permissions/{room_id}` |
| Báo cáo | `GET /api/admin/reports/overview` |
| Xuất báo cáo | `GET /api/admin/reports/export?format=xlsx|pdf` |

Mọi endpoint nghiệp vụ khác yêu cầu `Authorization: Bearer <token>` khi
`AUTH_REQUIRED=true`. Email trong payload cũ chỉ được giữ để tương thích Sprint
1–2; khi có token, backend luôn lấy danh tính từ token.

## 6. Migration và kiểm thử

`Base.metadata.create_all` tạo bảng mới và `apply_schema_migrations` chỉ thêm
cột/chuyển vai trò cũ, không xóa meeting, booking, notification, Google OAuth
token hay tài khoản. Bản SQL tham chiếu PostgreSQL nằm tại
`backend/migrations/002_sprint3_auth_rbac_reports.sql`.

```powershell
cd backend
python -m pytest -q

cd ../frontend
npm run test
npm run lint
npm run build
```

Backend tests dùng database SQLite riêng và tắt auth chỉ cho các regression test
Sprint 1–2; test Sprint 3 dùng token thật, kiểm tra 401/403, chống giả mạo email,
quyền phòng, quản trị viên cuối cùng, báo cáo và chữ ký file xuất.

## 7. PWA/mobile

Manifest và service worker chỉ cache app shell/tài nguyên tĩnh; request `/api`
không được cache để tránh lưu dữ liệu tài khoản. Ở production HTTPS, trình duyệt
có thể cài hệ thống như ứng dụng. Bố cục chuyển một cột trên màn hình nhỏ, menu
dọc trở thành drawer, bảng báo cáo cuộn ngang và form không gây tràn trang.
