# Hệ thống Quản lý Lịch họp ICTU

[![CI](https://github.com/dtc245180018-gif/meeting-management-ictu/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dtc245180018-gif/meeting-management-ictu/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/dtc245180018-gif/meeting-management-ictu?label=release)](https://github.com/dtc245180018-gif/meeting-management-ictu/releases/latest)

Hệ thống quản lý lịch họp nội bộ dành cho ICTU: tạo lịch và lịch lặp, mời người
tham dự, tìm và đặt phòng, quản lý thiết bị, thông báo, đồng bộ Google Calendar,
điểm danh QR, báo cáo quản trị và trợ lý AI hỗ trợ đặt lịch.

**Stack:** FastAPI + Python 3.12 · React + TypeScript + Vite · SQLAlchemy ·
PostgreSQL (Docker/production) hoặc SQLite (phát triển và kiểm thử) · JWT ·
Gemini API · Google Calendar OAuth · Docker Compose · PWA.

| Tài liệu | Nội dung |
| --- | --- |
| [Hướng dẫn Sprint 4](docs/SPRINT4_GUIDE.md) | Cấu hình và quy tắc nghiệp vụ US25–US28 |
| [Kịch bản demo Sprint 4](docs/DEMO_SPRINT4.md) | Các bước nghiệm thu chatbot, gợi ý phòng, QR và HRM/ERP |
| [Kịch bản demo toàn hệ thống](docs/DEMO_MANUAL_SCRIPT.md) | Luồng demo thủ công trước mentor |
| [Tích hợp thật](docs/REAL_INTEGRATIONS_SETUP.md) | Google Calendar, email và Gemini |
| [PWA trên iPhone](docs/IPHONE_PWA_SETUP.md) | Chạy HTTPS bằng Cloudflare Tunnel và cài lên màn hình chính |
| [Triển khai Vercel](docs/VERCEL_DEPLOYMENT.md) | Triển khai frontend, FastAPI và PostgreSQL cloud cho production |
| [Quy trình đóng góp](CONTRIBUTING.md) | Gitflow, quy ước commit, Pull Request và kiểm thử bắt buộc |

---

## Tính năng theo vai trò

| Vai trò | Chức năng chính |
| --- | --- |
| Quản trị viên (`admin`) | Quản lý tài khoản, phân quyền, quyền đặt từng phòng, danh mục phòng, tài sản thiết bị, báo cáo, xuất Excel/PDF và đồng bộ HRM/ERP |
| Người tổ chức (`organizer`) | Tạo/sửa/hủy lịch, lịch lặp, mời người tham dự, tìm giờ trống, gợi ý phòng, đặt phòng/thiết bị, Google Calendar, chatbot và tạo QR |
| Người tham dự (`participant`) | Xem lịch được mời, chấp nhận/từ chối, báo bận, nhận thông báo, mở lịch ngoài và check-in/check-out bằng QR |

### Chức năng nổi bật

- Tạo cuộc họp một lần hoặc lặp theo tuần/tháng; kiểm tra toàn bộ lần lặp trước
  khi ghi dữ liệu.
- Đặt phòng và thiết bị trong cùng transaction với cuộc họp; có xung đột thì
  toàn bộ thao tác bị hủy.
- Gợi ý giờ trống chung và xếp hạng phòng theo sức chứa, quyền đặt, khu vực,
  tiện ích và trạng thái thực tế.
- Chatbot Gemini thu thập yêu cầu bằng ngôn ngữ tự nhiên nhưng chỉ tạo lịch sau
  khi người dùng xem lại và xác nhận.
- Lời mời, nhắc lịch, phản hồi, hủy lịch và thông báo check-in/check-out được
  quản lý theo từng tài khoản.
- Google Calendar OAuth tạo/cập nhật/hủy sự kiện, gửi lời mời cho người tham dự;
  ICS được giữ làm phương án tương thích Outlook.
- QR ký số, có hạn dùng, kiểm tra thành viên cuộc họp và chống ghi nhận trùng.
- Quản lý từng tài sản bằng mã riêng, trạng thái sẵn sàng/bảo trì/ngừng sử dụng.
- Báo cáo sử dụng phòng, cuộc họp bị hủy và xuất Excel/PDF theo nhận diện ICTU.
- PWA responsive, có thể cài trên máy tính và iPhone.

## Quy tắc nghiệp vụ chính

- Backend quyết định danh tính người tổ chức từ tài khoản đăng nhập; không tin
  email do frontend tự gửi.
- Số người dự kiến bao gồm người tổ chức và không được nhỏ hơn số người đã mời.
- Lịch lặp phải được kiểm tra chồng chéo nội bộ trước khi tạo, kể cả khi không
  chọn phòng.
- Phòng phải hoạt động, đủ sức chứa, còn trống ở mọi lần lặp và tài khoản phải
  có quyền đặt.
- Tạo lịch, người tham dự, phòng, thiết bị và reminder dùng chung một transaction.
- Chỉ người tổ chức hoặc Admin được tạo QR; chỉ thành viên cuộc họp được điểm danh.
- Đồng bộ HRM/ERP ưu tiên `external_id`, đối chiếu thêm email và chạy lại không
  tạo tài khoản trùng.
- Thời gian API có offset rõ ràng; giao diện nhập và hiển thị theo
  `Asia/Ho_Chi_Minh`.

---

## Chạy trên máy local bằng Docker

Đây là cách khuyến nghị vì PostgreSQL, backend và frontend được khởi động cùng
một lệnh.

### Yêu cầu cài sẵn

- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Bước 1 — Clone dự án

```powershell
git clone https://github.com/dtc245180018-gif/meeting-management-ictu.git
cd meeting-management-ictu
```

### Bước 2 — Tạo cấu hình môi trường

```powershell
Copy-Item .env.example .env
docker run --rm python:3.12-alpine python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Sao chép chuỗi vừa tạo vào `AUTH_SECRET_KEY` trong `.env`. Các tích hợp bên ngoài
có thể để trống khi chạy thử; chức năng quản lý cốt lõi vẫn hoạt động.

> Không commit `.env`, mật khẩu SMTP, OAuth Client Secret, refresh token hoặc API
> key. Không đặt secret trong biến frontend có tiền tố `VITE_`.

### Bước 3 — Khởi động hệ thống

```powershell
docker compose up -d --build
docker compose ps
```

| Dịch vụ | Địa chỉ |
| --- | --- |
| Giao diện | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger/OpenAPI | http://localhost:8000/docs |
| Health check | http://localhost:8000/api/health |

Xem log khi cần:

```powershell
docker compose logs -f backend frontend
```

Dừng hệ thống nhưng giữ dữ liệu:

```powershell
docker compose down
```

Không thêm `-v` nếu muốn giữ PostgreSQL volume.

### Chạy trên iPhone dưới dạng PWA

Camera và PWA trên iOS cần HTTPS. Khởi động profile Cloudflare Tunnel:

```powershell
docker compose --profile iphone up -d --build
docker compose logs cloudflared
```

Mở URL `https://...trycloudflare.com` bằng Safari, chọn **Chia sẻ → Thêm vào màn
hình chính**. Quick Tunnel tạo URL mới khi container được tạo lại.

---

## Chạy thủ công không dùng Docker

Yêu cầu Python 3.12+ và Node.js 20+.

### Backend

```powershell
cd backend
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Mặc định `backend/.env.example` dùng SQLite nên không cần cài PostgreSQL khi chạy
thủ công.

### Frontend

Mở terminal khác:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend Vite proxy `/api` tới backend ở cổng 8000.

---

## Dữ liệu và tài khoản demo

Đưa toàn bộ dữ liệu về trạng thái sạch, tạo lại 10 nhân viên/tài khoản và đặt
mật khẩu tạm chung:

```powershell
docker compose exec backend python scripts/reset_demo_data.py --full --shared-demo-password ICTU123
```

Khi chạy backend thủ công:

```powershell
cd backend
python scripts/reset_demo_data.py --full --shared-demo-password ICTU123
```

Sau reset:

- Email Admin mặc định lấy từ `LEADER_EMAIL`/`ADMIN_EMAILS` trong `.env`.
- Các tài khoản nhân viên còn lại mặc định là `organizer`; Admin có thể đổi vai
  trò thành `participant` trong **Quản trị → Người dùng**.
- Mật khẩu tạm là `ICTU123` và tài khoản được yêu cầu đổi mật khẩu ở lần đăng
  nhập đầu.
- Danh sách credential tạo ra nằm trong
  `backend/sprint3_credentials.local.csv`; file này bị Git bỏ qua.

Không dùng mật khẩu chung trong môi trường thật.

### Kịch bản demo nhanh

1. Đăng nhập Admin, mở **Quản trị** để kiểm tra người dùng, phòng, thiết bị, báo
   cáo và HRM/ERP.
2. Đăng nhập Organizer, tạo cuộc họp có người tham dự, thiết bị và phòng được
   gợi ý.
3. Mở **Trợ lý AI**, yêu cầu: `Đặt phòng cho 6 người ngày mai từ 9 đến 10 giờ,
   cần máy chiếu`, hoàn thiện thông tin rồi xác nhận.
4. Dùng Participant chấp nhận lời mời và kiểm tra thông báo.
5. Organizer tạo QR; Participant quét để check-in/check-out; xem thời gian trong
   chi tiết cuộc họp.
6. Admin xuất báo cáo Excel/PDF và chạy lại HRM mock hai lần để chứng minh không
   tạo dữ liệu trùng.

---

## Cấu hình tích hợp

### Gemini

```ini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_SECONDS=20
```

Key chỉ nằm ở backend. Không có key thì các chức năng quản lý khác vẫn chạy;
chatbot hiển thị trạng thái chưa sẵn sàng.

### Google Calendar

```ini
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_OAUTH_STATE_SECRET=
GOOGLE_ALLOWED_DOMAIN=ictu.edu.vn
```

OAuth chỉ áp dụng cho liên kết Google Calendar. Tài khoản đăng nhập hệ thống vẫn
do Admin tạo và phân quyền. Callback trong Google Cloud phải trùng tuyệt đối với
`GOOGLE_REDIRECT_URI`.

### Email

`EMAIL_BACKEND=console` ghi email vào log để phát triển. Muốn gửi thật:

```ini
EMAIL_BACKEND=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_USE_TLS=true
```

### HRM/ERP

```ini
HRM_CONNECTOR=mock
HRM_MOCK_DATA_FILE=data/hrm_mock.json
HRM_DEFAULT_ROLE=participant
HRM_SYNC_INTERVAL_MINUTES=0
```

Connector `mock` hoạt động thật với dữ liệu cục bộ để demo. Khi doanh nghiệp cung
cấp API và credential, thay adapter nguồn nhưng giữ nguyên logic kiểm tra/upsert.

---

## Chạy kiểm thử

### Backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

### Frontend

```powershell
cd frontend
npm test -- --run
npm run lint
npm run build
```

Nhánh `main` chỉ nhận Pull Request khi **Backend tests** và **Frontend checks**
đều đạt và có ít nhất một reviewer độc lập phê duyệt.

---

## API chính

| Nhóm | Endpoint tiêu biểu |
| --- | --- |
| Xác thực | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Cuộc họp | `GET/POST /api/meetings`, `PATCH /api/meetings/{id}`, `POST /api/meetings/{id}/cancel` |
| Gợi ý | `POST /api/meetings/suggest-times`, `POST /api/rooms/recommendations` |
| Phòng và thiết bị | `GET /api/rooms/available`, `POST /api/rooms/bookings`, `GET /api/equipment/available` |
| Lời mời/thông báo | `POST /api/meetings/{id}/invitations/respond`, `GET /api/notifications` |
| Google Calendar | `GET /api/integrations/google/connect`, `POST /api/meetings/{id}/google-calendar/sync` |
| Chatbot | `POST /api/chatbot/conversation`, `POST /api/chatbot/bookings/preview`, `POST /api/chatbot/bookings/confirm` |
| QR | `GET /api/bookings/{id}/qr`, `POST /api/bookings/qr/check-in`, `POST /api/bookings/qr/check-out` |
| Quản trị | `/api/admin/users`, `/api/admin/rooms`, `/api/admin/equipment` |
| Báo cáo/HRM | `/api/admin/reports/*`, `/api/admin/integrations/hrm/*` |

Danh sách và schema đầy đủ có tại Swagger: http://localhost:8000/docs.

---

## Lỗi thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
| --- | --- |
| Frontend báo `ECONNREFUSED 127.0.0.1:8000` | Backend chưa chạy hoặc chưa sẵn sàng; kiểm tra `docker compose ps` và log backend |
| `WinError 10013` hoặc cổng 8000 bị chiếm | Dừng tiến trình đang giữ cổng hoặc chạy backend ở cổng khác |
| `ModuleNotFoundError` | Chưa kích hoạt đúng `.venv` hoặc chưa `pip install -r requirements.txt` |
| Đăng nhập luôn trả 401 | Đang dùng database/container khác hoặc mật khẩu đã đổi; chạy full reset cho môi trường demo |
| Google OAuth báo `org_internal` | OAuth app đang giới hạn nội bộ một tổ chức Google Workspace; kiểm tra loại người dùng và domain trong Google Cloud |
| Google Calendar báo chưa cấu hình | Thiếu Client ID/Secret, token encryption key hoặc callback không trùng |
| Chatbot báo chưa sẵn sàng | Thiếu `GEMINI_API_KEY` ở backend hoặc container chưa được recreate |
| HRM mock trả 503 | Kiểm tra `HRM_MOCK_DATA_FILE=data/hrm_mock.json` và rebuild backend image |
| Camera QR không mở trên iPhone | Phải dùng HTTPS, cấp quyền camera và mở bằng Safari/PWA |
| Thay đổi code chưa xuất hiện trong Docker | Chạy lại `docker compose up -d --build` |

---

## Cấu trúc thư mục

```text
meeting-management-ictu/
├── backend/
│   ├── app/                 FastAPI, nghiệp vụ, models, schemas và integrations
│   ├── data/                Dữ liệu HRM mock an toàn
│   ├── scripts/             Seed/reset dữ liệu và chuẩn bị tài khoản
│   ├── tests/               Pytest cho Sprint 1–4
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── public/              Manifest, service worker và nhận diện ICTU
│   ├── src/components/      Dashboard, lịch, chatbot, QR, quản trị và báo cáo
│   ├── src/services/        API client
│   ├── Dockerfile
│   └── nginx.conf
├── docs/                    Hướng dẫn vận hành và kịch bản demo
├── .github/workflows/       CI backend/frontend
├── docker-compose.yml
├── CONTRIBUTING.md
└── README.md
```

## Gitflow và phát hành

- `main`: phiên bản ổn định đã nghiệm thu.
- `develop`: nhánh tích hợp chung.
- `feature/USxx-ten-chuc-nang`: phát triển từ `develop`, merge bằng Pull Request.
- `release/*`: chuẩn bị bản phát hành từ `develop`, merge vào `main` và đồng bộ
  lại `develop` khi có release fix.
- `hotfix/*`: sửa khẩn cấp từ `main`, sau đó đưa lại cả `main` và `develop`.

Bản ổn định hiện tại: [v1.0.0](https://github.com/dtc245180018-gif/meeting-management-ictu/releases/tag/v1.0.0).

## Bảo mật

- Không commit `.env`, database, credential CSV, API key, OAuth token hoặc mật
  khẩu thật.
- Đổi `AUTH_SECRET_KEY`, mật khẩu database và mật khẩu tài khoản trước khi triển
  khai ngoài môi trường demo.
- Chỉ backend được truy cập Gemini, SMTP, Google OAuth và HRM/ERP credential.
- File `.env.example` chỉ là mẫu cấu hình; mọi giá trị thật phải được cấp riêng
  cho từng môi trường.
