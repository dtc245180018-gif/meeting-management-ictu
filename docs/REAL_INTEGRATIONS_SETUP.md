# Cấu hình email và Google Calendar thật

Tài khoản tổ chức mặc định là `dtc245180018@ictu.edu.vn`. Hai tài khoản nhận lời
mời để nghiệm thu là `ngocthang18092006@gmail.com` và `tn9728160@gmail.com`.
Không commit Client Secret, refresh token hoặc mật khẩu ứng dụng lên Git.

## 1. Google Calendar OAuth

1. Mở Google Cloud Console, tạo/chọn project và bật **Google Calendar API**.
2. Cấu hình OAuth consent screen. Nếu ứng dụng ở chế độ Testing, thêm
   `dtc245180018@ictu.edu.vn` vào Test users.
3. Tạo OAuth Client ID loại **Web application**.
4. Thêm Authorized redirect URI chính xác:
   `http://localhost:8000/api/integrations/google/callback`.
5. Tạo hai khóa cục bộ:

```powershell
cd backend
.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

6. Điền vào `backend/.env`:

```ini
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=<OAuth Client ID>
GOOGLE_CLIENT_SECRET=<OAuth Client Secret>
GOOGLE_REDIRECT_URI=http://localhost:8000/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<kết quả lệnh Fernet>
GOOGLE_OAUTH_STATE_SECRET=<kết quả lệnh token_urlsafe>
GOOGLE_CALENDAR_ID=primary
```

Khởi động lại backend, mở trang Tổng quan và bấm **Kết nối Google Calendar**.
Đăng nhập đúng `dtc245180018@ictu.edu.vn` và cấp quyền quản lý sự kiện. Backend
lưu refresh token ở dạng mã hóa để worker có thể cập nhật/hủy lịch sau khi phiên
trình duyệt kết thúc.

Khi bấm **Đồng bộ Google Calendar**, backend gọi Calendar API để tạo hoặc cập
nhật sự kiện và dùng `sendUpdates=all`, vì vậy Google gửi lời mời/cập nhật tới
người tham dự. Khi hủy cuộc họp, sự kiện Google tương ứng cũng bị xóa và khách
mời nhận cập nhật hủy.

## 2. SMTP gửi email thật

Nếu hộp thư ICTU dùng Google Workspace và quản trị viên cho phép App Password,
bật xác minh hai bước, tạo App Password riêng rồi cấu hình:

```ini
EMAIL_BACKEND=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=dtc245180018@ictu.edu.vn
SMTP_PASSWORD=<App Password 16 ký tự>
SMTP_FROM_EMAIL=dtc245180018@ictu.edu.vn
SMTP_USE_TLS=true
```

Nếu ICTU không cho phép App Password, cần SMTP relay hoặc tài khoản SMTP do nhà
trường cấp; giữ nguyên giao diện nhưng thay các biến `SMTP_*` theo thông tin của
quản trị viên. Sau khi khởi động lại backend, trạng thái email trên thẻ Thông báo
sẽ chuyển từ **Đang chờ gửi** sang **Đã gửi** hoặc **Gửi thất bại** kèm lỗi.

## 3. Kiểm tra nghiệm thu thật

1. Kết nối Google bằng tài khoản ICTU và xác nhận thẻ hiển thị **Đã kết nối**.
2. Tạo cuộc họp có hai Gmail tham dự, đặt reminder 15 phút.
3. Bấm **Đồng bộ Google Calendar**; kiểm tra sự kiện trên lịch ICTU và email mời
   trong hai hộp thư Gmail.
4. Chuyển vai trò sang từng nhân viên, bấm **Chấp nhận** hoặc **Từ chối**; kiểm
   tra trạng thái người tham dự và email phản hồi gửi tới người tổ chức.
5. Sửa tên/giờ họp; kiểm tra sự kiện Google và email cập nhật.
6. Hủy họp; kiểm tra phòng/thiết bị được giải phóng, sự kiện Google bị xóa và
   email hủy được gửi.

