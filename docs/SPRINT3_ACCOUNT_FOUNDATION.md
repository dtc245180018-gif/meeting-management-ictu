# Nền móng tài khoản đăng nhập Sprint 3

Repository đã chuẩn bị một tài khoản cho mỗi nhân viên đang hoạt động. Đây là
dữ liệu nền để Sprint 3 xây API đăng nhập, phiên đăng nhập và phân quyền; Sprint 2
chưa hiển thị form đăng nhập và chưa phát hành token.

## Cách tạo tài khoản

Tại thư mục `backend`:

```powershell
python scripts/prepare_sprint3_accounts.py
```

Khi cần một mật khẩu chung cho buổi demo có giám sát, có thể chủ động xoay toàn
bộ tài khoản bằng tùy chọn sau (thay giá trị mẫu bằng mật khẩu đã thống nhất):

```powershell
python scripts/prepare_sprint3_accounts.py --shared-demo-password "<mật-khẩu-demo>"
```

Không ghi mật khẩu demo thật vào tài liệu được commit. Tùy chọn này chỉ dành cho
máy demo; mọi tài khoản vẫn có `must_change_password=true` và mỗi hash dùng salt
riêng. Không sử dụng một mật khẩu chung khi triển khai thật.

Kết quả:

- bảng `user_accounts` có một bản ghi tương ứng với mỗi nhân viên;
- email trong `ADMIN_EMAILS` và `LEADER_EMAIL` nhận vai trò `admin`, các tài khoản
  còn lại nhận vai trò `employee`;
- mật khẩu trong database chỉ là PBKDF2-HMAC-SHA256 có salt riêng;
- mọi tài khoản bật `must_change_password=true`;
- mật khẩu tạm thời được ghi vào
  `backend/sprint3_credentials.local.csv` (hoặc đường dẫn cấu hình bằng
  `SPRINT3_CREDENTIALS_FILE`).

Tệp CSV chứa mật khẩu rõ để bàn giao nội bộ nên đã bị Git bỏ qua. Không chụp màn
hình, gửi lên repository hoặc chia sẻ công khai tệp này. Nếu tệp bị mất, không
thể khôi phục mật khẩu từ hash; Sprint 3 cần bổ sung luồng quản trị đặt lại mật khẩu.

## Trạng thái bảo mật và việc còn lại ở Sprint 3

Đã có: email đăng nhập duy nhất, hash mật khẩu, vai trò, trạng thái hoạt động,
cờ buộc đổi mật khẩu và thời điểm tạo/cập nhật.

Chưa có và không được coi là đã hoàn thành: API đăng nhập, access/refresh token,
cookie bảo mật, đăng xuất, đổi/quên mật khẩu, giới hạn đăng nhập sai, audit log,
middleware phân quyền và thay thế bộ chọn tài khoản kiểm thử trên frontend.

Khi Sprint 3 triển khai đăng nhập, phải dùng hàm `verify_password` hiện có để
kiểm tra mật khẩu, phát phiên ở backend và lấy danh tính từ phiên; không tiếp tục
tin vào `requester_email` do frontend tự gửi.
