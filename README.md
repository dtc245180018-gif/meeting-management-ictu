# Meeting Management ICTU

Hệ thống quản lý lịch họp được xây dựng cho Sprint 1 theo Agile Scrum.

## Phạm vi Sprint 1

- US01: Tạo lịch họp mới.
- US02: Chỉnh sửa hoặc hủy lịch họp.
- US03: Đặt lịch họp định kỳ theo tuần hoặc tháng.
- US04: Mời người tham dự.
- US05: Gợi ý thời gian khi mọi người cùng rảnh.
- US06: Xem lịch sử cuộc họp.
- US07: Xem danh sách phòng đang trống.
- US08: Đặt phòng theo khung giờ và chống đặt trùng.

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

## Nạp dữ liệu demo và kịch bản trình diễn

Để thêm các cuộc họp, lời mời và đặt phòng mẫu vào cơ sở dữ liệu phát triển:

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

## Quy ước Git

- Mỗi User Story hoặc task được phát triển trên nhánh riêng.
- Tên nhánh ví dụ: `feature/us01-create-meeting`.
- Commit cần nêu rõ mã User Story và nội dung thay đổi.
- Chỉ hợp nhất khi code đã review và test liên quan chạy đạt.
