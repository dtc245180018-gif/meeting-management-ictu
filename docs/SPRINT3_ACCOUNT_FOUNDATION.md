# Tài khoản đăng nhập Sprint 3

Nền móng tài khoản của Sprint 2 đã được hoàn thiện thành luồng xác thực/RBAC
Sprint 3. Tài liệu vận hành hiện hành nằm tại [SPRINT3_GUIDE.md](SPRINT3_GUIDE.md).

## Chuẩn bị tài khoản

```powershell
cd backend
python scripts/prepare_sprint3_accounts.py
```

Script tạo idempotent một `user_accounts` cho mỗi nhân viên đang hoạt động.
Admin được xác định từ `ADMIN_EMAILS`/`LEADER_EMAIL` trong lần seed đầu; các tài
khoản còn lại nhận vai trò `organizer`. Mật khẩu tạm mặc định là `ICTU123`, mỗi
tài khoản có PBKDF2-HMAC-SHA256 hash và salt riêng, đồng thời bật
`must_change_password=true`.

File `backend/sprint3_credentials.local.csv` chỉ dùng bàn giao cục bộ và bị Git
bỏ qua. Không chụp màn hình, commit hoặc chia sẻ công khai file này.

## Trạng thái hoàn thành

- API đăng nhập, lấy phiên hiện tại, đổi mật khẩu và đăng xuất.
- Bearer token ký HMAC, có hạn dùng và `token_version` để thu hồi.
- Vai trò `admin`, `organizer`, `participant` được backend kiểm tra.
- Khóa/mở tài khoản, đặt lại mật khẩu, tìm kiếm/lọc/phân trang.
- Audit log cho thay đổi tài khoản và quyền phòng.
- Không còn bộ chuyển tài khoản kiểm thử trên frontend; danh tính nghiệp vụ lấy
  từ token, không lấy từ `requester_email` của trình duyệt.

Hệ thống hiện dùng access token có thời hạn, chưa triển khai refresh token hay
quên mật khẩu qua email. Khi hết hạn, người dùng đăng nhập lại.
