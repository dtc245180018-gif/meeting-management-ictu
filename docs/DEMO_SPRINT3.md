# Kịch bản demo Sprint 3 — US17 đến US24

Thời lượng đề xuất: 15–20 phút. Chuẩn bị backend tại cổng 8000, frontend tại
5173, một tài khoản `admin`, một `organizer` và một `participant`. Tài khoản mới
dùng mật khẩu tạm `ICTU123`.

## 1. US17 — Responsive và PWA

1. Mở hệ thống trên desktop, thu gọn/mở thanh điều hướng.
2. Mở DevTools, chọn kích thước điện thoại 390×844.
3. Kiểm tra menu drawer, form, thông báo, danh sách phòng và bảng báo cáo không
   tràn ngang toàn trang.
4. Ở bản production HTTPS, mở mục Install app và chỉ ra manifest/icon ICTU.

Kỳ vọng: thao tác chính dùng được trên mobile; request API không bị service
worker cache.

## 2. US18 — Đăng nhập và đổi mật khẩu lần đầu

1. Đăng nhập một tài khoản mới bằng `ICTU123`.
2. Hệ thống chuyển thẳng sang màn hình đổi mật khẩu và không cho vào nghiệp vụ.
3. Nhập sai mật khẩu hiện tại hoặc xác nhận không khớp để xem lỗi.
4. Đổi sang mật khẩu mới đủ 8 ký tự; đăng nhập lại bằng mật khẩu mới.
5. Bấm Đăng xuất và thử quay lại trang cũ.

Kỳ vọng: token cũ bị thu hồi; email/mật khẩu sai trả thông báo chung, không lộ
tài khoản có tồn tại hay không.

## 3. US19–US20 — Quản lý tài khoản và RBAC

1. Đăng nhập Admin → Quản trị → Tài khoản & phân quyền.
2. Tạo tài khoản, thử tạo lại cùng email để nhận lỗi trùng.
3. Tìm theo tên/email/đơn vị, lọc vai trò/trạng thái và chuyển trang.
4. Đổi tài khoản mới sang `organizer`, đặt lại mật khẩu, khóa rồi mở khóa.
5. Đăng nhập `participant`: menu Tạo lịch và Quản trị không xuất hiện.
6. Gọi URL/API quản trị bằng tài khoản participant để chứng minh backend trả
   `403`, không chỉ ẩn nút.
7. Thử hạ quyền/khóa quản trị viên cuối cùng.

Kỳ vọng: API trả `409` ở bước 7; đổi quyền/khóa làm token cũ mất hiệu lực.

## 4. US21 — Hạn chế đặt phòng theo tài khoản

1. Admin mở “Quyền phòng” của organizer, khóa một phòng và nhập lý do.
2. Đăng nhập organizer → Phòng họp: phòng vẫn thấy nhưng có trạng thái/lý do hạn chế.
3. Tạo lịch, nhập khung giờ và tìm phòng: phòng bị khóa không xuất hiện.
4. Thử gửi request tạo lịch/đặt phòng trực tiếp với ID phòng đó.
5. Admin mở lại quyền và organizer tìm/đặt lại.

Kỳ vọng: bước 4 trả `403`; bước 5 đặt được nếu không có xung đột/sức chứa phù hợp.

## 5. US22 — Báo cáo sử dụng phòng

1. Admin → Báo cáo & xuất file.
2. Chọn khoảng ngày bao gồm dữ liệu Sprint 1–2.
3. Lần lượt lọc theo phòng, tầng và khu nhà.
4. Đối chiếu tổng meeting, lượt đặt, giờ sử dụng, trạng thái và biểu đồ phòng.

Kỳ vọng: mọi thẻ, biểu đồ và bảng thay đổi theo cùng bộ lọc; không dùng số liệu giả.

## 6. US23 — Thống kê hủy

1. Organizer tạo hai cuộc họp có phòng.
2. Hủy một cuộc họp và nhập “Trùng lịch công tác”; hủy một bản dữ liệu cũ không có lý do nếu có.
3. Admin tải lại báo cáo.

Kỳ vọng: số/tỷ lệ hủy, xu hướng ngày, người tổ chức và lý do cập nhật; bản không
có lý do nằm ở “Không ghi lý do”.

## 7. US24 — Xuất Excel/PDF

1. Giữ nguyên bộ lọc ở bước báo cáo.
2. Bấm Xuất Excel, mở file và kiểm tra tiêu đề, khoảng ngày, múi giờ, số liệu phòng/hủy.
3. Bấm Xuất PDF và kiểm tra tiếng Việt, bảng, tên file có thời điểm xuất.
4. Thử endpoint xuất bằng participant.

Kỳ vọng: hai file khớp bộ lọc; participant nhận `403`.

## 8. Hồi quy Sprint 1–2

1. Organizer tạo lịch đơn và lịch lặp kèm người tham dự, phòng, thiết bị, reminder.
2. Tạo xung đột ở một lần lặp để xác nhận toàn bộ transaction rollback.
3. Sửa lịch, phản hồi lời mời, tải ICS, đồng bộ Google Calendar và kiểm tra email/thông báo.
4. Hủy lịch, xác nhận phòng/thiết bị/reminder được giải phóng và thông báo không còn nút Vào họp.
5. Kiểm tra danh mục/quản trị phòng, thiết bị và lịch sử cuộc họp.

Kỳ vọng cuối: US01–US24 hoạt động trong cùng dữ liệu thật; không dùng bộ chuyển
tài khoản giả và không có cách thay email payload để chiếm quyền người khác.
