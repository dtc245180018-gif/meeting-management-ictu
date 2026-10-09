# Chạy Meeting Management ICTU trên iPhone

Tài liệu này dùng cho môi trường phát triển và trình diễn. Toàn bộ database,
backend và frontend vẫn chạy trên máy Windows; iPhone truy cập qua một địa chỉ
HTTPS tạm thời do Cloudflare Quick Tunnel cung cấp.

## 1. Điều kiện

- Docker Desktop đang ở trạng thái **Engine running**.
- Máy tính có kết nối Internet và không chuyển sang chế độ ngủ.
- File `.env` đã được tạo từ `.env.example`; `AUTH_SECRET_KEY` phải là một chuỗi
  riêng dài ít nhất 32 ký tự.

## 2. Khởi động hệ thống và tunnel

Tại thư mục gốc repository, chạy:

```powershell
docker compose --profile iphone up -d --build
docker compose ps
docker compose logs cloudflared
```

Trong log `cloudflared`, tìm địa chỉ có dạng:

```text
https://ten-ngau-nhien.trycloudflare.com
```

Mỗi lần tạo Quick Tunnel mới có thể nhận một địa chỉ khác. Không dùng địa chỉ
này làm môi trường production hoặc lưu OAuth secret trong mã nguồn.

## 3. Cài trên iPhone

1. Mở địa chỉ `trycloudflare.com` bằng **Safari**.
2. Đăng nhập vào hệ thống.
3. Chạm nút **Chia sẻ** của Safari.
4. Chọn **Thêm vào Màn hình chính**.
5. Xác nhận **Thêm**, sau đó mở biểu tượng **ICTU Meeting** trên màn hình chính.

Nút **Cài ứng dụng** trong hệ thống cũng hiển thị đúng các bước này khi phát
hiện iPhone hoặc iPad. Khi ứng dụng đang chạy ở chế độ standalone, nút cài đặt
sẽ tự ẩn.

## 4. Kiểm tra

- `http://localhost:5173` vẫn mở được trên máy tính.
- Địa chỉ HTTPS mở được trên iPhone bằng 4G hoặc Wi-Fi.
- Đăng nhập và các request `/api` hoạt động mà không báo lỗi CORS.
- Sau khi thêm vào màn hình chính, ứng dụng mở độc lập không có thanh địa chỉ.
- Dữ liệu nghiệp vụ không được service worker cache; khi mất mạng chỉ app shell
  có thể hiển thị, các thao tác cần backend sẽ yêu cầu kết nối lại.

## 5. Dừng hệ thống

```powershell
docker compose --profile iphone down
```

Không thêm tùy chọn `-v` nếu muốn giữ nguyên dữ liệu PostgreSQL.

## 6. Giới hạn của Quick Tunnel

Quick Tunnel phù hợp để kiểm thử hoặc demo. Google OAuth cần redirect URI cố
định, vì vậy để đồng bộ Google Calendar ổn định trên iPhone cần dùng một domain
HTTPS cố định hoặc Cloudflare Named Tunnel rồi cập nhật `FRONTEND_URL`,
`GOOGLE_REDIRECT_URI` và Google Cloud Console tương ứng.
