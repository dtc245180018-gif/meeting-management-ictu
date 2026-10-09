# Meeting Management ICTU

Hệ thống quản lý lịch họp nội bộ ICTU được phát triển theo Agile Scrum. Sprint 3
mở rộng Sprint 1–2 bằng đăng nhập thật, phân quyền, chính sách phòng, báo cáo và
trải nghiệm mobile/PWA mà không làm mất dữ liệu cũ.

## Phạm vi Sprint 1

- US01: Tạo lịch họp mới.
- US02: Chỉnh sửa hoặc hủy lịch họp.
- US03: Đặt lịch họp định kỳ theo tuần hoặc tháng.
- US04: Mời người tham dự.
- US05: Gợi ý thời gian khi mọi người cùng rảnh.
- US06: Xem lịch sử cuộc họp.
- US07: Xem danh sách phòng đang trống.
- US08: Đặt phòng theo khung giờ và chống đặt trùng.

## Phạm vi Sprint 2

- US09: Hủy cuộc họp và giải phóng phòng, thiết bị, reminder trong cùng giao dịch.
- US10: Xem và lọc phòng theo sức chứa.
- US11: Quản trị danh sách phòng, kiểm tra trùng tên và ngừng sử dụng bằng xóa mềm.
- US12: Đặt nhiều thiết bị cùng cuộc họp/lịch lặp với kiểm tra xung đột và rollback.
- US13: Xem trạng thái thiết bị theo loại, trạng thái và khung thời gian.
- US14: Quản trị thiết bị, bảo trì, kích hoạt và khóa bằng xóa mềm.
- US15: Xuất ICS và đồng bộ tạo/cập nhật/hủy sự kiện qua Google Calendar OAuth.
- US16: Thông báo trong ứng dụng, vòng đời lời mời và gửi email nền qua SMTP.

## Phạm vi Sprint 3

- US17: Giao diện responsive và PWA có thể cài đặt, hỗ trợ cache app shell.
- US18: Đăng nhập, đăng xuất, đổi mật khẩu lần đầu và quản lý trạng thái tài khoản.
- US19: Danh sách tài khoản có tìm kiếm, lọc, phân trang, khóa và mở khóa.
- US20: RBAC phía backend cho `admin`, `organizer`, `participant`; thu hồi phiên khi đổi quyền.
- US21: Quyền đặt từng phòng theo từng tài khoản, áp dụng đồng nhất ở tìm kiếm và đặt phòng.
- US22: Báo cáo sử dụng phòng theo thời gian, phòng, tầng và khu nhà.
- US23: Báo cáo hủy cuộc họp theo ngày, lý do, phòng và người tổ chức.
- US24: Xuất báo cáo theo cùng bộ lọc ra Excel và PDF tiếng Việt, chỉ dành cho quản trị viên.

Chi tiết cấu hình, API và kiểm thử xem [hướng dẫn Sprint 3](docs/SPRINT3_GUIDE.md).
Kịch bản nghiệm thu thủ công US17–US24 nằm tại [docs/DEMO_SPRINT3.md](docs/DEMO_SPRINT3.md).

## Công nghệ

- Frontend: React, TypeScript, Vite.
- Backend: FastAPI, SQLAlchemy, Pydantic.
- Cơ sở dữ liệu: PostgreSQL; SQLite được hỗ trợ để chạy test và phát triển nhanh.
- Triển khai cục bộ: Docker Compose.

## Chạy nhanh bằng Docker

```bash
cp .env.example .env
# Điền AUTH_SECRET_KEY bằng chuỗi ngẫu nhiên riêng trước khi chạy.
docker compose up --build
```

- Giao diện: http://localhost:5173
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

Trong Docker, frontend dùng `/api` và Nginx proxy request tới service `backend`;
không cần trỏ trình duyệt trực tiếp tới hostname `backend`. Có thể đổi
`VITE_API_URL` trong `.env` khi frontend được triển khai tách khỏi Docker Compose.

Để mở bản production HTTPS trên iPhone và cài dưới dạng PWA, chạy thêm profile
`iphone`. Hướng dẫn đầy đủ nằm tại [docs/IPHONE_PWA_SETUP.md](docs/IPHONE_PWA_SETUP.md).

```powershell
docker compose --profile iphone up -d --build
docker compose logs cloudflared
```

## Chạy Backend không dùng Docker

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Trên Windows PowerShell, kích hoạt môi trường bằng:

```powershell
.venv\Scripts\Activate.ps1
```

Nếu chạy frontend bằng Vite ở máy local, hãy để backend chạy đồng thời tại cổng
8000. Frontend sẽ proxy các request `/api` tới backend, nên có thể mở giao diện
bằng cả `http://localhost:5173` và `http://127.0.0.1:5173`.

## Chạy Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Kiểm thử Backend

```bash
cd backend
pytest -q
```

## Kiểm thử Frontend

```bash
cd frontend
npm run lint
npm run test
npm run build
```

## Cấu hình xác thực và tích hợp

- `AUTH_REQUIRED=true`: bật xác thực Bearer cho API nghiệp vụ.
- `AUTH_SECRET_KEY`: khóa ký phiên bí mật, tối thiểu 32 ký tự, không đưa lên Git.
- `AUTH_TOKEN_MINUTES`: thời gian sống của phiên; mặc định 480 phút.
- `INITIAL_ACCOUNT_PASSWORD=ICTU123`: mật khẩu tạm được băm riêng từng tài khoản;
  người dùng bắt buộc đổi ở lần đăng nhập đầu.
- `ADMIN_EMAILS` chỉ còn phục vụ migration/tương thích dữ liệu Sprint 2. Quyền
  quản trị khi chạy thật được đọc từ `user_accounts.role`, không tin email do frontend gửi.
- `EMAIL_BACKEND=console`: chế độ phát triển, ghi email vào log và đánh dấu đã gửi.
- `EMAIL_BACKEND=smtp`: gửi thật lời mời, cập nhật, hủy, phản hồi và reminder bằng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
  `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` và `SMTP_USE_TLS`.
- Google Calendar dùng OAuth Web application, refresh token được mã hóa bằng
  `GOOGLE_TOKEN_ENCRYPTION_KEY`. Xem hướng dẫn cấu hình và nghiệm thu thật tại
  [docs/REAL_INTEGRATIONS_SETUP.md](docs/REAL_INTEGRATIONS_SETUP.md).
- Không đưa mật khẩu, token hoặc OAuth Client Secret thật vào Git.

Mọi thời điểm được lưu và trả về API ở UTC có offset rõ ràng, kể cả khi dùng
SQLite. Giao diện luôn nhập và hiển thị theo múi giờ `Asia/Ho_Chi_Minh`, vì vậy
kết quả không phụ thuộc múi giờ của máy đang mở trình duyệt.

Trang **Thông báo** riêng tự làm mới mỗi 15 giây, nhóm nội dung theo ngày và hiển
thị mốc ngày/giờ cho lời mời, thay đổi, hủy lịch, phản hồi và reminder của tài
khoản đang đăng nhập. Trạng thái `Đang chờ gửi`/`Đã gửi`/`Gửi thất bại` phản ánh
hàng đợi email; bấm từng dòng để đánh dấu đã đọc. Thông báo cũ tự động bị xóa
sau 30 ngày. Thanh điều hướng hiển thị dấu chấm đỏ khi có thông báo chưa đọc hoặc lịch
họp mới; thông báo của cuộc họp đã hủy/hết giờ không cho phép bấm **Vào họp**.

`EMAIL_BACKEND=console` chỉ mô phỏng việc gửi bằng cách ghi nội dung vào log.
Muốn gửi email thật phải cấu hình `EMAIL_BACKEND=smtp` cùng các biến SMTP nêu
trên. Worker sử dụng khóa hàng khi PostgreSQL hỗ trợ để giảm nguy cơ hai worker
xử lý cùng một reminder.

US15 đồng bộ một chiều từ hệ thống sang Google Calendar bằng OAuth: tạo, cập
nhật và xóa sự kiện thật, kèm `sendUpdates=all` để Google thông báo khách mời.
File ICS vẫn được giữ làm phương án tương thích Outlook. Thay đổi thực hiện trực
tiếp trên Google không được kéo ngược về hệ thống.

## API chính

| Nhóm | API |
| --- | --- |
| Phòng quản trị | `GET/POST /api/admin/rooms`, `PATCH/DELETE /api/admin/rooms/{id}` |
| Thiết bị | `GET /api/equipment`, `GET /api/equipment/available` |
| Thiết bị quản trị | `GET/POST /api/admin/equipment`, `PATCH/DELETE /api/admin/equipment/{id}` |
| Lịch ngoài | `GET /api/meetings/{id}/calendar.ics`, `GET /api/integrations/google/status`, `GET /api/integrations/google/connect`, `GET /api/integrations/google/callback`, `DELETE /api/integrations/google`, `POST /api/meetings/{id}/google-calendar/sync` |
| Lời mời | `POST /api/meetings/{id}/invitations/respond` |
| Thông báo | `GET /api/integrations/email/status`, `GET /api/notifications?email=...`, `POST /api/notifications/{id}/read` |
| Xác thực | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/logout` |
| Tài khoản | `GET/POST /api/admin/users`, `PATCH /api/admin/users/{id}` |
| Quyền phòng | `GET /api/admin/users/{id}/room-permissions`, `PUT /api/admin/users/{id}/room-permissions/{room_id}` |
| Báo cáo | `GET /api/admin/reports/overview`, `GET /api/admin/reports/export?format=xlsx|pdf` |

Khi tạo cuộc họp, request có thể gửi thêm `equipment_ids` và
`reminder_minutes` (`15`, `30`, `60` hoặc `1440`). Tạo cuộc họp, đặt phòng,
đặt thiết bị và tạo reminder dùng chung một transaction.

## Nạp dữ liệu demo và kịch bản trình diễn

Để thêm các cuộc họp, lời mời, phòng, thiết bị và reminder mẫu vào cơ sở dữ liệu phát triển:

```powershell
cd backend
python scripts/seed_demo_data.py
```

Script có tính idempotent: không xóa dữ liệu hiện có và bỏ qua nhóm dữ liệu demo đã được nạp. Kịch bản trình diễn đầy đủ nằm tại [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

Để xóa toàn bộ cuộc họp, lời mời và đặt phòng trước khi demo thủ công, đồng thời khôi phục danh mục phòng/nhân viên mẫu:

```powershell
cd backend
python scripts/reset_demo_data.py
# Hoặc đưa toàn bộ dữ liệu và tài khoản về cùng trạng thái trước mỗi lần demo:
python scripts/reset_demo_data.py --full --shared-demo-password ICTU123
```

Nếu hệ thống đang chạy bằng Docker, dùng lệnh tương đương tại thư mục gốc dự án:

```powershell
docker compose exec backend python scripts/reset_demo_data.py --full --shared-demo-password ICTU123
```

Sau khi mới cập nhật mã nguồn có thay đổi `backend/Dockerfile`, cần build lại
backend một lần bằng `docker compose up -d --build backend`. Chế độ `--full`
xóa toàn bộ dữ liệu nghiệp vụ, kết nối Google Calendar đã lưu và tài khoản cũ,
sau đó tạo lại 10 nhân viên/tài khoản mẫu với mật khẩu được truyền vào. Các bí
mật OAuth/SMTP trong file `.env` không bị xóa.

Kịch bản demo thủ công theo từng thao tác nằm tại [docs/DEMO_MANUAL_SCRIPT.md](docs/DEMO_MANUAL_SCRIPT.md).
Kịch bản nghiệm thu đầy đủ US09–US16 nằm tại [docs/DEMO_SPRINT2.md](docs/DEMO_SPRINT2.md).

Để tạo tài khoản và mật khẩu tạm cho toàn bộ nhân viên:

```powershell
cd backend
python scripts/prepare_sprint3_accounts.py
```

Mặc định tài khoản mới dùng mật khẩu tạm `ICTU123`, chỉ lưu dạng băm trong cơ sở
dữ liệu và bắt buộc đổi ở lần đăng nhập đầu. File
`backend/sprint3_credentials.local.csv` bị Git bỏ qua.

## Quy ước Git

- Repository áp dụng Gitflow với `main` là nhánh ổn định và `develop` là nhánh
  tích hợp.
- Mỗi User Story được phát triển trên nhánh `feature/USxx-ten-chuc-nang` tạo từ
  `develop` và hợp nhất bằng Pull Request.
- Quy trình release, hotfix, commit, Pull Request và kiểm thử bắt buộc được mô tả
  trong [CONTRIBUTING.md](CONTRIBUTING.md).
