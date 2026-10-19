# Kịch bản demo Sprint 4 — US25 đến US28

## 1. Chuẩn bị

Tại thư mục dự án:

```powershell
docker compose up -d --build
docker compose exec backend python scripts/reset_demo_data.py --full --shared-demo-password ICTU123
```

Đăng nhập bằng tài khoản Organizer để demo US25–US27 và tài khoản Admin để demo
US28. Với QR trên điện thoại, mở hệ thống qua HTTPS/Cloudflare Tunnel để trình
duyệt được cấp quyền camera. Chuẩn bị thêm một tài khoản Participant thuộc cuộc
họp và một tài khoản Participant không được mời để kiểm tra phân quyền.

## 2. US25 — đặt lịch qua chatbot

1. Đăng nhập Organizer và mở **Trợ lý AI**.
2. Nhập: `Đặt phòng cho 6 người ngày mai từ 9:00 đến 10:00, cần máy chiếu`.
3. Xác nhận chatbot hỏi bổ sung các trường còn thiếu; trả lời tên cuộc họp và người tham dự.
4. Chọn một phòng trong danh sách đã xếp hạng.
5. Kiểm tra bản tóm tắt rồi bấm xác nhận.
6. Mở **Lịch họp**, xác nhận có đúng một cuộc họp, đúng phòng, thời gian và người mời.

Kết quả mong đợi: trả ID cuộc họp, tạo lịch và đặt phòng cùng lúc. Nếu phòng vừa
bị tài khoản khác đặt trước khi xác nhận, hệ thống báo xung đột và không tạo dữ liệu một phần.

## 3. US26 — gợi ý phòng thông minh

1. Mở **Tạo lịch họp**, nhập thời gian tương lai, 6 người và chọn máy chiếu.
2. Bấm **Gợi ý phòng thông minh**.
3. Kiểm tra mỗi phòng có điểm và lý do; phòng không đủ chỗ/không có quyền/đang bận không xuất hiện.
4. Chọn một phòng, sau đó đổi số người hoặc thời gian.
5. Xác nhận lựa chọn phòng cũ bị xóa và hệ thống yêu cầu tìm lại.
6. Thử số người rất lớn để nhận thông báo không có phòng phù hợp.

Kết quả mong đợi: xếp hạng ổn định, có phân trang và giải thích rõ kết quả rỗng.

## 4. US27 — check-in/check-out bằng QR

1. Dùng cuộc họp bắt đầu trong vòng 30 phút, đã có phòng và Participant được mời.
2. Organizer mở **Check-in QR**, chọn cuộc họp và tạo mã.
3. Participant đăng nhập trên điện thoại, mở cùng trang, cấp quyền camera và quét mã.
4. Kiểm tra tên cuộc họp/phòng/thời gian rồi bấm **Check-in**; bấm lại lần nữa.
5. Bấm **Check-out**; bấm lại lần nữa.
6. Thử quét bằng tài khoản không được mời, hoặc hủy cuộc họp rồi quét lại.

Kết quả mong đợi: thao tác lặp báo đã ghi nhận nhưng không tạo trùng; người ngoài,
mã sửa, sai thời gian và cuộc họp hủy bị từ chối.

## 5. US28 — đồng bộ HRM/ERP

1. Đăng nhập Admin, mở **Quản trị → Đồng bộ HRM/ERP**.
2. Kiểm tra trạng thái connector `mock` sẵn sàng và bấm chạy đồng bộ.
3. Xem số bản ghi tạo/cập nhật/bỏ qua/lỗi và lịch sử chạy.
4. Chạy lại cùng dữ liệu; xác nhận không tạo tài khoản trùng.
5. Chuyển sang nhập JSON thủ công, thêm một bản ghi hợp lệ và một email sai định dạng.
6. Chạy đồng bộ và kiểm tra bản ghi hợp lệ vẫn được lưu, bản ghi lỗi xuất hiện trong chi tiết.
7. Đăng nhập Participant và thử mở endpoint/trang quản trị để xác nhận bị chặn.

Kết quả mong đợi: chỉ Admin thao tác; đồng bộ idempotent, từng phần, có audit và
không hiển thị bí mật kết nối. Adapter doanh nghiệp thật chỉ được cấu hình khi có
API/credential từ đơn vị triển khai.

## 6. Kết thúc demo

Mở lại **Lịch họp**, **Check-in QR** và **Quản trị** để tổng kết dữ liệu vừa tạo.
Nếu cần trả hệ thống về sạch cho lượt demo tiếp theo, chạy lại lệnh reset ở mục 1.
