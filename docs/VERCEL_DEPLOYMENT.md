# Triển khai Meeting Management ICTU trên Vercel

Dự án sử dụng Vercel Services để triển khai frontend Vite và backend FastAPI
trong cùng một project và cùng một tên miền:

- `/` và tài nguyên tĩnh được phục vụ bởi frontend.
- `/api/*` được chuyển tới backend FastAPI.
- `VITE_API_URL=/api` giữ cho trình duyệt gọi API cùng nguồn, không phụ thuộc
  địa chỉ máy local.

## Hạ tầng bắt buộc

Production phải dùng PostgreSQL được quản lý bên ngoài, ví dụ Neon hoặc
Supabase. Không dùng SQLite vì filesystem của Vercel Function không phải nơi
lưu dữ liệu bền vững.

## Biến môi trường tối thiểu

Thiết lập các biến sau cho Production, Preview và Development trên Vercel:

```dotenv
DATABASE_URL=postgresql+psycopg://...
VITE_API_URL=/api
FRONTEND_URL=https://<ten-project>.vercel.app
CORS_ORIGINS=https://<ten-project>.vercel.app
AUTH_REQUIRED=true
AUTH_SECRET_KEY=<random-secret>
INITIAL_ACCOUNT_PASSWORD=<temporary-password>
SPRINT3_CREDENTIALS_FILE=/tmp/sprint3_credentials.local.csv
```

Các tích hợp thật cần bổ sung biến tương ứng trong `.env.example`, gồm Google
Calendar, SMTP và Gemini. Chỉ lưu giá trị secret trong Vercel Environment
Variables; không commit vào GitHub và không đặt secret trong biến `VITE_*`.

## Google Calendar

Sau khi có URL production, thêm URI sau vào OAuth Client trên Google Cloud:

```text
https://<ten-project>.vercel.app/api/integrations/google/callback
```

Sau đó đặt `GOOGLE_REDIRECT_URI` bằng đúng URI trên. `FRONTEND_URL` cũng phải
trỏ tới URL production để OAuth quay lại đúng giao diện.

## Kiểm tra sau triển khai

1. Mở `/api/health` và xác nhận HTTP 200.
2. Đăng nhập bằng tài khoản quản trị đã được seed.
3. Tạo một cuộc họp, đặt phòng và tải lại trang để xác nhận dữ liệu còn tồn tại.
4. Kiểm tra manifest, service worker và chức năng cài PWA.
5. Trên iPhone, mở bằng Safari rồi chọn **Chia sẻ → Thêm vào Màn hình chính**.
6. Kiểm tra QR trên HTTPS, Google Calendar, email và chatbot nếu đã cấu hình
   credential production.

## Lưu ý về tác vụ nền

Các API chính hoạt động trên FastAPI service. Worker nhắc lịch chạy liên tục ở
môi trường Docker không nên được xem là tiến trình thường trú trên serverless.
Khi triển khai lâu dài, cần chuyển lịch quét reminder sang Vercel Cron hoặc một
worker/daemon riêng.
