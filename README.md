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

## Chạy Backend không dùng Docker

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Trên Windows PowerShell, kích hoạt môi trường bằng:

```powershell
.venv\Scripts\Activate.ps1
```

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

## Quy ước Git

- Mỗi User Story hoặc task được phát triển trên nhánh riêng.
- Tên nhánh ví dụ: `feature/us01-create-meeting`.
- Commit cần nêu rõ mã User Story và nội dung thay đổi.
- Chỉ hợp nhất khi code đã review và test liên quan chạy đạt.

