# Đóng góp cho Meeting Management ICTU

Repository sử dụng Gitflow để tách phiên bản ổn định, nhánh tích hợp và công
việc của từng User Story. Không push trực tiếp vào `main` hoặc `develop`.

## Vai trò của các nhánh

- `main`: phiên bản ổn định đã được kiểm thử và sẵn sàng bàn giao.
- `develop`: nhánh tích hợp chung cho Sprint đang phát triển.
- `feature/USxx-ten-chuc-nang`: phát triển một User Story hoặc phần việc của
  User Story; luôn tạo từ `develop` và hợp nhất lại `develop` bằng Pull Request.
- `release/<phien-ban>`: chuẩn bị phát hành; tạo từ `develop`, chỉ nhận sửa lỗi
  phát hành, sau đó mở Pull Request vào cả `main` và `develop`.
- `hotfix/<ten-loi>`: sửa lỗi khẩn cấp trên bản ổn định; tạo từ `main`, sau đó
  mở Pull Request vào cả `main` và `develop`.

Ví dụ:

```text
feature/US22-room-usage-report
feature/US24-export-report
release/1.0.0
hotfix/calendar-sync-timezone
```

## Quy trình phát triển User Story

1. Đồng bộ nhánh tích hợp:

   ```bash
   git switch develop
   git pull --ff-only origin develop
   ```

2. Tạo nhánh tính năng:

   ```bash
   git switch -c feature/USxx-ten-chuc-nang
   ```

3. Thực hiện thay đổi đúng phạm vi User Story, bổ sung kiểm thử và cập nhật tài
   liệu liên quan.
4. Commit nhỏ, có ý nghĩa và push nhánh lên `origin`.
5. Mở Pull Request vào `develop`, liên kết mã Jira và mô tả cách kiểm thử.
6. Chỉ merge khi có ít nhất một người duyệt và tất cả kiểm thử bắt buộc đã đạt.
7. Không force push, không xóa lịch sử commit và không tự merge khi review chưa
   hoàn tất.

## Quy ước commit

Sử dụng cấu trúc:

```text
<type>(USxx): mô tả ngắn ở thể mệnh lệnh
```

Các `type` thường dùng:

- `feat`: thêm chức năng.
- `fix`: sửa lỗi.
- `test`: thêm hoặc sửa kiểm thử.
- `docs`: cập nhật tài liệu.
- `refactor`: cải tổ mã nhưng không đổi hành vi.
- `chore`: công việc cấu hình hoặc bảo trì.

Ví dụ:

```text
feat(US22): add room usage filters
test(US20): cover forbidden role transitions
docs(US24): document report export flow
```

Không đưa mật khẩu, token, khóa OAuth, dữ liệu cá nhân hoặc file `.env` thật vào
commit.

## Yêu cầu Pull Request

Mỗi Pull Request phải:

- Chỉ có một mục tiêu rõ ràng và ghi mã Jira liên quan.
- Nêu thay đổi chính, phạm vi ảnh hưởng và các bước kiểm thử.
- Có kiểm thử mới hoặc lý do hợp lý nếu không cần bổ sung kiểm thử.
- Không chứa file sinh tự động, thông tin bí mật hoặc thay đổi ngoài phạm vi.
- Nhận ít nhất một approval từ người không phải tác giả.
- Vượt qua các kiểm tra `Backend tests` và `Frontend checks` trước khi merge.

Mẫu mô tả ngắn:

```markdown
## Jira
USxx / SCRUM-xx

## Thay đổi
- ...

## Kiểm thử
- [ ] Backend tests
- [ ] Frontend lint, tests và build

## Rủi ro và hoàn tác
- ...
```

## Kiểm thử cục bộ

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest -q
```

Frontend:

```bash
cd frontend
npm ci
npm run lint
npm run test
npm run build
```

Pull Request chạy lại các bước này bằng GitHub Actions. Không merge khi một kiểm
tra bắt buộc đang lỗi hoặc chưa chạy.

## Release và hotfix

### Release

1. Tạo `release/<phien-ban>` từ `develop`.
2. Chỉ sửa lỗi phát hành, tài liệu và thông tin phiên bản trên nhánh này.
3. Mở Pull Request từ release vào `main`.
4. Sau khi được duyệt và kiểm thử đạt, merge vào `main` và gắn tag phiên bản.
5. Mở Pull Request cùng nhánh release vào `develop` để đồng bộ mọi sửa đổi.

### Hotfix

1. Tạo `hotfix/<ten-loi>` từ `main`.
2. Bổ sung kiểm thử tái hiện lỗi và bản sửa tối thiểu.
3. Mở Pull Request vào `main`; sau khi phát hành, mở Pull Request vào `develop`.

Không merge trực tiếp giữa các nhánh bảo vệ và không dùng `git reset --hard`
hoặc force push để giải quyết xung đột.

## Jira, Story Point và Worklog

- Story Point chỉ đặt ở User Story, dùng dãy Fibonacci `1, 2, 3, 5, 8` sau khi
  cả nhóm đọc mô tả và Acceptance Criteria.
- Subtask không đặt Story Point; chỉ ghi thời gian dự kiến và Worklog khi cần.
- Cập nhật trạng thái và Worklog hằng ngày theo công việc thực tế.
- Không tự thay đổi Story Point sau khi User Story đã bắt đầu; mọi thay đổi phải
  được nhóm thống nhất và ghi lại trong Jira.

## Bảo vệ nhánh

Ruleset cho `main` và `develop` phải bật:

- Chặn push trực tiếp; mọi thay đổi đi qua Pull Request.
- Ít nhất một approval và hủy approval cũ khi có commit mới.
- Yêu cầu giải quyết toàn bộ hội thoại review.
- Yêu cầu `Backend tests` và `Frontend checks` thành công.
- Chặn force push và xóa nhánh.
- Chỉ quản trị viên được bypass trong tình huống khẩn cấp có ghi nhận lý do.
