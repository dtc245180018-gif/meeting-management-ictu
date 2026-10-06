# Kịch bản kiểm thử và nghiệm thu Sprint 2 (US09–US16)

Tài liệu này dùng để trình bày trực tiếp với mentor. Thời lượng đề xuất là
20–25 phút. Mỗi ca kiểm thử đều có thao tác, kết quả mong đợi và bằng chứng cần
chụp. Luồng đăng nhập thật thuộc Sprint 3; trong Sprint 2 dùng bộ chọn tài khoản
để kiểm tra quyền và dữ liệu của từng người.

## 1. Tài khoản và dữ liệu dùng để nghiệm thu

| Vai trò | Email | Mục đích |
| --- | --- | --- |
| Quản trị/người tổ chức | `dtc245180018@ictu.edu.vn` | Quản trị tài nguyên, tạo và đồng bộ lịch |
| Nhân viên 1 | `ngocthang18092006@gmail.com` | Nhận lời mời, chấp nhận, nhận thông báo |
| Nhân viên 2 | `tn9728160@gmail.com` | Nhận lời mời, từ chối, kiểm tra phân quyền |

Hệ thống có 10 nhân viên, 10 phòng và 6 thiết bị. Chỉ dùng ba email thật ở trên
cho các bước kiểm tra gửi thư/Google Calendar; bảy địa chỉ ICTU mẫu còn lại dùng
để kiểm tra gợi ý và nút **Mời tất cả mọi người**.

## 2. Chuẩn bị trước buổi đánh giá

Tại thư mục `backend`:

```powershell
python scripts/reset_demo_data.py
pytest -q
python -m uvicorn app.main:app --reload
```

Tại terminal thứ hai, trong thư mục `frontend`:

```powershell
npm install
npm run lint
npm run test
npm run build
npm run dev
```

Mở `http://localhost:5173`. Trước khi mentor đến, kiểm tra:

- thẻ Google Calendar trên Tổng quan hiển thị đã kết nối đúng tài khoản tổ chức;
- API `GET /api/integrations/email/status` cho biết SMTP đã cấu hình nếu muốn
  chứng minh thư đến hộp thư thật; chế độ `console` chỉ chứng minh hàng đợi và
  nội dung thư trong log;
- giờ máy đúng múi giờ Việt Nam;
- cơ sở dữ liệu vừa reset, chưa có cuộc họp.

## 3. Mở đầu và kiểm tra quyền (1 phút)

1. Mở **Tổng quan**, thu gọn rồi mở rộng thanh điều hướng.
2. Chuyển lần lượt **Nhân viên 1**, **Nhân viên 2**, **Quản trị viên**.
3. Xác nhận nhân viên không thấy menu **Quản trị**, quản trị viên thấy menu này.
4. Mở giao diện ở chiều rộng điện thoại hoặc DevTools responsive; thanh điều
   hướng, thông báo và nội dung không chồng lấn.

Kết quả đạt: dashboard chỉ thống kê lịch liên quan đến nhân viên hiện tại; phía
backend vẫn trả HTTP 403 nếu nhân viên tự gọi API quản trị.

## 4. US10 — Xem và lọc phòng theo sức chứa (1 phút)

Mã ca: `TC-S2-10-01`.

1. Mở **Phòng họp** và hiển thị toàn bộ danh sách mà không nhập thời gian.
2. Lọc theo khu nhà, tầng, loại phòng và thiết bị có sẵn.
3. Nhập số người `20`; kết quả không được có phòng dưới 20 chỗ.
4. Nhập một khung giờ tương lai, bấm tìm phòng trống theo thời gian.
5. Xóa thời gian; danh sách lại hoạt động như bộ lọc cơ bản.

Kết quả đạt: thời gian là điều kiện nâng cao, không bắt buộc; sức chứa và mọi bộ
lọc trả đúng dữ liệu.

## 5. US11 — Quản trị phòng và xóa mềm (2 phút)

Mã ca: `TC-S2-11-01`.

1. Chọn **Quản trị viên** → **Quản trị** → **Quản lý phòng**.
2. Thêm `Phòng E201`, sức chứa `14`, `Tầng 2 - Khu E`, khu `Khu E`, tầng `2`.
3. Thử thêm lại cùng tên: phải báo trùng tên.
4. Thử sức chứa `0`: form/API phải từ chối.
5. Sửa sức chứa thành `18` và lưu.
6. Khóa phòng; phòng còn trong trang quản trị nhưng biến mất khỏi danh sách có
   thể đặt. Kích hoạt lại để hoàn nguyên.
7. Chuyển sang **Nhân viên 1** và chứng minh không thể truy cập chức năng quản trị.

Kết quả đạt: CRUD đúng, dữ liệu không hợp lệ bị chặn, khóa là xóa mềm và quyền
được kiểm tra ở backend.

## 6. US14 và US13 — Quản trị, bảo trì và trạng thái thiết bị (3 phút)

Mã ca: `TC-S2-14-01`, `TC-S2-13-01`.

1. Trong **Quản trị**, mở **Quản lý thiết bị**.
2. Thêm `TB-DEMO-01 | Thiết bị demo | display | Kho thiết bị`.
3. Thử lại cùng mã để nhận lỗi trùng mã.
4. Sửa thiết bị sang **Bảo trì**, lưu, rồi mở trang **Thiết bị**.
5. Kiểm tra thiết bị bảo trì không thể chọn khi tạo lịch.
6. Chuyển về **Sẵn sàng**, tìm theo loại và khung giờ.
7. Khóa thiết bị; thiết bị còn lịch sử nhưng không còn khả dụng. Kích hoạt lại.
8. Chỉ ra `TB-VC-01` được chuẩn bị ở trạng thái bảo trì để so sánh rõ các trạng thái.

Kết quả đạt: backend tính đúng `available`, `booked`, `maintenance`, `inactive`;
không chỉ đổi nhãn ở frontend.

## 7. US12 — Đặt nhiều thiết bị trong cùng transaction (3 phút)

Mã ca: `TC-S2-12-01`.

1. Mở **Tạo lịch họp** và nhập:
   - tiêu đề: `Nghiệm thu Sprint 2 - Tài nguyên`;
   - người tổ chức: `dtc245180018@ictu.edu.vn`;
   - người tham dự: hai email Gmail thật;
   - số người dự kiến: `3`;
   - thời gian: một giờ tương lai;
   - nhắc trước: `30 phút`.
2. Tìm và chọn một phòng đủ sức chứa.
3. Tìm và chọn `TB-MC-01` cùng `TB-MIC-01`.
4. Tạo lịch, ghi lại ID cuộc họp, mở **Lịch họp** để kiểm tra phòng, hai thiết bị
   và hai người tham dự.
5. Tạo lịch thứ hai trùng thời gian và dùng lại `TB-MC-01`.

Kết quả đạt: lần đầu HTTP 201; lần hai HTTP 409; không có cuộc họp, booking phòng
hay booking thiết bị rác từ request thất bại.

## 8. US12 — Lịch lặp kiểm tra toàn bộ trước khi ghi (2 phút)

Mã ca: `TC-S2-12-02`.

1. Tạo một lịch đơn chiếm `TB-MC-02` ở tuần sau.
2. Tạo lịch lặp hằng tuần hai lần bắt đầu trong tuần này và chọn `TB-MC-02`.
3. Xác nhận request bị từ chối vì lần lặp thứ hai xung đột.
4. Thực hiện thêm ca không chọn phòng/thiết bị: `recurrence=weekly`, số lần `2`,
   thời lượng `8 ngày`.

Kết quả đạt: cả hai ca trả HTTP 409 và không tạo bất kỳ lần lặp nào. Ca thời
lượng 8 ngày phải báo **Các lần lặp của cuộc họp bị chồng chéo thời gian**.

## 9. US16 — Lời mời, phản hồi, email và thông báo vào họp (4 phút)

Mã ca: `TC-S2-16-01`, `TC-S2-16-02`.

1. Tạo cuộc họp bắt đầu sau thời điểm hiện tại khoảng 4 phút, mời hai tài khoản
   Gmail thật. Chọn nhắc trước `15 phút` để reminder đến hạn ngay.
2. Chuyển sang **Nhân viên 1**; trên Tổng quan kiểm tra lời mời/thông báo, mở lịch
   và bấm **Chấp nhận**.
3. Chuyển sang **Nhân viên 2**, bấm **Từ chối**.
4. Chuyển về người tổ chức; kiểm tra hai thông báo phản hồi với trạng thái khác nhau.
5. Trong vòng tối đa 30 giây, **Nhân viên 1** phải thấy thông báo **Sắp đến giờ
   họp** và nút **Vào họp**. Nhân viên đã từ chối không nhận thông báo vào họp.
6. Bấm **Vào họp**; hệ thống chuyển tới đúng cuộc họp và đánh dấu thông báo đã đọc.
7. Nếu SMTP đang ở chế độ `smtp`, mở hai hộp thư thật để chứng minh thư mời,
   reminder và thay đổi đã được gửi. Nếu trạng thái là `console`, trình bày rõ đây
   là kiểm thử hàng đợi/log, không gọi là gửi email thật.

Kết quả đạt: vòng đời `invited → accepted/declined` đúng; người tổ chức nhận phản
hồi; thông báo tự động trước 5 phút chỉ dành cho người còn tham dự.

## 10. US15 — Google Calendar OAuth và Outlook/ICS (4 phút)

Mã ca: `TC-S2-15-01`, `TC-S2-15-02`.

1. Chọn tài khoản tổ chức. Nếu chưa kết nối, dùng thẻ **Lịch Google của bạn** để
   cấp quyền OAuth.
2. Tại cuộc họp đã tạo, bấm **Đồng bộ Google Calendar**.
3. Bấm **Mở trên Google Calendar** và kiểm tra tiêu đề, giờ, phòng, mô tả và hai
   khách mời. Kiểm tra hai tài khoản Gmail nhận lời mời của Google.
4. Quay lại hệ thống, sửa tiêu đề hoặc thời gian, rồi bấm **Đồng bộ lại Google
   Calendar**. Sự kiện cũ phải được cập nhật, không tạo bản sao.
5. Bấm **Tải lịch Outlook/ICS**; mở file và kiểm tra `UID`, `DTSTART`, `DTEND`,
   `ORGANIZER`, `ATTENDEE`, phòng và múi giờ.

Kết quả đạt: trạng thái sync là `synced`, link Google được lưu, sự kiện có khách
mời và file ICS chứa đủ dữ liệu.

## 11. US09 — Hủy lịch và giải phóng tài nguyên (3 phút)

Mã ca: `TC-S2-09-01`.

1. Ghi lại phòng và hai thiết bị của cuộc họp nghiệm thu.
2. Ở vai trò nhân viên, thử hủy lịch: backend phải trả HTTP 403.
3. Chuyển về người tổ chức, bấm **Hủy lịch** và xác nhận.
4. Bấm **Đồng bộ trạng thái hủy** để xóa sự kiện Google và gửi cập nhật hủy.
5. Tìm lại đúng phòng/thiết bị trong khung giờ cũ: tất cả phải sẵn sàng.
6. Tải lại ICS: phải có `METHOD:CANCEL` và `STATUS:CANCELLED`.
7. Hủy lại cùng cuộc họp: thao tác idempotent, không lỗi 500 và không tạo thông
   báo hủy trùng.
8. Mở trang **Thông báo**: reminder cũ của cuộc họp đã hủy không còn nút **Vào
   họp**; thông báo được nhóm theo ngày và có mốc ngày/giờ rõ ràng.

Kết quả đạt: meeting, phòng, thiết bị, reminder và Google Calendar cùng phản ánh
trạng thái hủy; tài nguyên được giải phóng.

## 12. Kiểm tra hồi quy Sprint 1 (2 phút)

1. Tạo lịch không có phòng/thiết bị; dùng gợi ý email và **Mời tất cả mọi người**.
2. Xác nhận người tổ chức không bị thêm lại vào danh sách người tham dự.
3. Dùng gợi ý giờ trống, tạo lịch, sau đó sửa tiêu đề/thời gian/người tham dự.
4. Chọn phòng rồi đổi thời gian hoặc số người; phòng đã chọn phải bị xóa và yêu
   cầu tìm lại.
5. Mở **Lịch họp**, thử gợi ý email, nút **Tìm**, trạng thái, khoảng ngày, lịch
   của người tham gia và phân trang.
6. Kiểm tra lịch lặp không phòng với thời lượng 8 ngày vẫn rollback toàn bộ.

Kết quả đạt: US01–US08 không bị hồi quy sau các thay đổi Sprint 2.

## 13. Bảng ký xác nhận

| Ca kiểm thử | User Story | Kết quả | Bằng chứng/ghi chú |
| --- | --- | --- | --- |
| TC-S2-09-01 | US09 | Pass / Fail | |
| TC-S2-10-01 | US10 | Pass / Fail | |
| TC-S2-11-01 | US11 | Pass / Fail | |
| TC-S2-12-01 | US12 | Pass / Fail | |
| TC-S2-12-02 | US12 | Pass / Fail | |
| TC-S2-13-01 | US13 | Pass / Fail | |
| TC-S2-14-01 | US14 | Pass / Fail | |
| TC-S2-15-01 | US15 | Pass / Fail | |
| TC-S2-15-02 | US15 | Pass / Fail | |
| TC-S2-16-01 | US16 | Pass / Fail | |
| TC-S2-16-02 | US16 | Pass / Fail | |
| TC-REG-01 | US01–US08 | Pass / Fail | |

Tiêu chí chấp nhận Sprint 2: toàn bộ ca nghiệp vụ Pass; test backend, frontend,
lint và build đều đạt; không còn dữ liệu rác sau request 409; nếu tuyên bố gửi
email thật thì trạng thái SMTP phải là `configured=true` và có thư trong hộp thư.

## 14. Làm sạch sau khi tập demo

```powershell
cd backend
python scripts/reset_demo_data.py
```

Lệnh này xóa cuộc họp, lời mời, booking và reminder; khôi phục danh mục phòng,
thiết bị; đồng thời giữ nguyên tài khoản Sprint 3 và mật khẩu đã phát cho nhân viên.
