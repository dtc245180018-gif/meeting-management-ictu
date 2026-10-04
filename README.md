# Meeting Management ICTU

Hệ thống quản lý lịch họp nội bộ ICTU được phát triển theo Agile Scrum. Nhánh
`sprint-2` mở rộng luồng Sprint 1 mà không thay đổi các chức năng cốt lõi đã ổn định.

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

Không thuộc Sprint 2: đăng nhập, quản lý tài khoản, phân quyền đầy đủ, báo cáo,
mobile, chatbot, QR check-in và tích hợp HRM/ERP.

Nền móng dữ liệu đăng nhập cho Sprint 3 đã được chuẩn bị: mỗi nhân viên có một
tài khoản, mật khẩu chỉ lưu dạng băm và phải đổi ở lần đăng nhập đầu. Sprint 2
chưa có endpoint đăng nhập/token; xem [docs/SPRINT3_ACCOUNT_FOUNDATION.md](docs/SPRINT3_ACCOUNT_FOUNDATION.md).

## Công nghệ

- Frontend: React, TypeScript, Vite.
- Backend: FastAPI, SQLAlchemy, Pydantic.
- Cơ sở dữ liệu: PostgreSQL; SQLite được hỗ trợ để chạy test và phát triển nhanh.
- Triển khai cục bộ: Docker Compose.

## Chạy nhanh bằng Docker

```bash
cp .env.example .env
docker compose up --build
```

- Giao diện: http://localhost:5173
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

Trong Docker, frontend dùng `/api` và Nginx proxy request tới service `backend`;
không cần trỏ trình duyệt trực tiếp tới hostname `backend`. Có thể đổi
`VITE_API_URL` trong `.env` khi frontend được triển khai tách khỏi Docker Compose.

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

## Cấu hình Sprint 2

- `ADMIN_EMAILS`: danh sách email quản trị tạm thời, phân tách bằng dấu phẩy.
  API quản trị nhận email người thao tác và đối chiếu cấu hình này. Đây chỉ là
  cơ chế tạm thời trước Sprint 3, chưa thay thế xác thực/phân quyền.
- `VITE_CURRENT_USER_EMAIL`: email quản trị viên mà giao diện gửi tới API quản trị/thông báo.
- Trên giao diện có bộ chọn **Kiểm thử phân quyền** cho `Nhân viên 1`
  (`employee.one@example.com`), `Nhân viên 2` (`employee.two@example.com`) và
  `Quản trị viên` (`leader@example.com`). Bộ chọn này phục vụ nghiệm thu
  Sprint 1–2, không thay thế xác thực; vai trò nhân viên không hiển thị menu
  Quản trị và API trả `403` khi nhân viên gọi chức năng quản trị.
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

Ở trang Tổng quan, thẻ **Thông báo của bạn** tự làm mới mỗi 15 giây và hiển thị
lời mời, thay đổi, hủy lịch, phản hồi và reminder của vai trò đang chọn. Trạng
thái `Đang chờ gửi`/`Đã gửi`/`Gửi thất bại` phản ánh hàng đợi email; bấm từng
dòng để đánh dấu đã đọc.

`EMAIL_BACKEND=console` chỉ mô phỏng việc gửi bằng cách ghi nội dung vào log.
Muốn gửi email thật phải cấu hình `EMAIL_BACKEND=smtp` cùng các biến SMTP nêu
trên. Worker sử dụng khóa hàng khi PostgreSQL hỗ trợ để giảm nguy cơ hai worker
xử lý cùng một reminder.

US15 đồng bộ một chiều từ hệ thống sang Google Calendar bằng OAuth: tạo, cập
nhật và xóa sự kiện thật, kèm `sendUpdates=all` để Google thông báo khách mời.
File ICS vẫn được giữ làm phương án tương thích Outlook. Thay đổi thực hiện trực
tiếp trên Google không được kéo ngược về hệ thống.

## API Sprint 2

| Nhóm | API |
| --- | --- |
| Phòng quản trị | `GET/POST /api/admin/rooms`, `PATCH/DELETE /api/admin/rooms/{id}` |
| Thiết bị | `GET /api/equipment`, `GET /api/equipment/available` |
| Thiết bị quản trị | `GET/POST /api/admin/equipment`, `PATCH/DELETE /api/admin/equipment/{id}` |
| Lịch ngoài | `GET /api/meetings/{id}/calendar.ics`, `GET /api/integrations/google/status`, `GET /api/integrations/google/connect`, `GET /api/integrations/google/callback`, `DELETE /api/integrations/google`, `POST /api/meetings/{id}/google-calendar/sync` |
| Lời mời | `POST /api/meetings/{id}/invitations/respond` |
| Thông báo | `GET /api/integrations/email/status`, `GET /api/notifications?email=...`, `POST /api/notifications/{id}/read` |

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
```

Kịch bản demo thủ công theo từng thao tác nằm tại [docs/DEMO_MANUAL_SCRIPT.md](docs/DEMO_MANUAL_SCRIPT.md).
Kịch bản nghiệm thu đầy đủ US09–US16 nằm tại [docs/DEMO_SPRINT2.md](docs/DEMO_SPRINT2.md).

Để tạo tài khoản và mật khẩu tạm cho toàn bộ nhân viên trước Sprint 3:

```powershell
cd backend
python scripts/prepare_sprint3_accounts.py
```

Danh sách mật khẩu được lưu trong `backend/sprint3_credentials.local.csv` và bị
Git bỏ qua; repository chỉ chứa mật khẩu đã băm trong database local.

## Quy ước Git

- Mỗi User Story hoặc task được phát triển trên nhánh riêng.
- Tên nhánh ví dụ: `feature/us01-create-meeting`.
- Commit cần nêu rõ mã User Story và nội dung thay đổi.
- Chỉ hợp nhất khi code đã review và test liên quan chạy đạt.
