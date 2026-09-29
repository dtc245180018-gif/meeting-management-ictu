# Kịch bản demo thủ công đầy đủ Sprint 1

## 1. Chuẩn bị trước khi trình diễn

Thực hiện tại thư mục dự án:

```powershell
cd backend
python scripts/reset_demo_data.py
python -m uvicorn app.main:app --reload
```

Mở terminal thứ hai:

```powershell
cd frontend
npm run dev
```

Mở `http://localhost:5173`, sau đó refresh trang một lần.

Kết quả sau khi reset:

- Chưa có cuộc họp, lời mời hoặc đặt phòng nào.
- Có 10 phòng và 10 nhân viên ICTU sẵn để chọn.
- Các lần chạy lại reset đều đưa hệ thống về cùng trạng thái sạch.

Danh sách email dùng khi demo:

| Nhân viên | Email | Đơn vị |
| --- | --- | --- |
| Nguyễn Ngọc Thắng | `leader@ictu.edu.vn` | Nhóm dự án ICTU |
| Trần Minh Anh | `minhanh@ictu.edu.vn` | Khoa Công nghệ thông tin |
| Lê Hoàng Nam | `hoangnam@ictu.edu.vn` | Phòng Đào tạo |
| Phạm Thu Hà | `thuha@ictu.edu.vn` | Phòng Hành chính |
| Đỗ Quang Huy | `quanghuy@ictu.edu.vn` | Trung tâm CNTT |
| Vũ Mai Linh | `mailinh@ictu.edu.vn` | Khoa Hệ thống thông tin |
| Nguyễn Thu Trang | `trangnt@ictu.edu.vn` | Khoa Truyền thông đa phương tiện |
| Bùi Đức Long | `longbd@ictu.edu.vn` | Khoa Kỹ thuật và Công nghệ |
| Hoàng Lan Phương | `phuonghl@ictu.edu.vn` | Phòng Khoa học Công nghệ |
| Trịnh Quốc Việt | `viettq@ictu.edu.vn` | Phòng Khảo thí và Đảm bảo chất lượng |

## 2. Thông điệp mở đầu (30 giây)

> Đây là hệ thống quản lý lịch họp nội bộ ICTU. Sprint 1 tập trung vào tạo cuộc họp, mời người tham dự, gợi ý thời gian, tìm/đặt phòng và quản lý lịch lặp. Hiện hệ thống chưa có đăng nhập nên người tổ chức được chọn từ danh sách nhân viên ICTU.

## 3. Demo giao diện và điều hướng (1 phút)

1. Trên thanh **Chế độ trình diễn**, chọn **Nhân viên** để bắt đầu. Giao diện
   hiển thị email `minhanh@ictu.edu.vn`, chỉ có các luồng nhân viên và không có
   menu Quản trị. Chọn **Quản trị viên** bất kỳ lúc nào để chuyển sang
   `leader@ictu.edu.vn`; menu Quản trị xuất hiện và mở được US11/US14.
2. Từ sidebar, lần lượt mở **Tổng quan**, **Tạo lịch họp**, **Lịch họp** và **Phòng họp**.
3. Bấm nút thu gọn sidebar để chỉ còn icon, sau đó bấm mở rộng lại.
4. Bấm **Đăng xuất** ở góc phải và ở cuối sidebar. Cả hai nơi đều hiển thị thông báo chức năng đang được cập nhật.

### Kiểm chứng reminder và thông báo (US16)

1. Tạo một cuộc họp có `Nhắc lịch` (15 phút hoặc 1 ngày) và email
   `minhanh@ictu.edu.vn` trong danh sách tham dự.
2. Quay về **Tổng quan** ở vai trò Nhân viên. Thẻ **Thông báo của bạn** hiển thị
   reminder theo đúng email, số lượng chưa đọc và trạng thái `Đang chờ gửi`.
3. Bấm **Làm mới** để gọi lại API; worker nền sẽ chuyển reminder đến hạn sang
   `Đã gửi` (email demo ghi ra console). Bấm dòng thông báo để chuyển số chưa đọc
   về 0.

## 4. Demo luồng chính (khoảng 14 phút)

### Bước 1 — Tổng quan (30 giây)

1. Ở sidebar, chọn **Tổng quan**.
2. Chỉ ra trạng thái ban đầu sạch: tổng lịch, lịch sắp tới, phòng đã đặt và lịch chưa có phòng đều bằng 0.
3. Giới thiệu khu vực **Lịch gần nhất** đang trống vì chưa tạo cuộc họp.

### Bước 2 — Tạo cuộc họp và mời người tham dự (2 phút)

1. Chọn **Tạo lịch họp**.
2. Nhập:
   - Tên: `Họp kế hoạch Sprint 1 - Demo`.
   - Mô tả: `Thống nhất tiến độ và phân công công việc.`
3. Tại **Người tổ chức**, chọn `leader@ictu.edu.vn`.
4. Bấm **Mời tất cả mọi người**.
5. Cho mentor thấy có 9 người được mời và người tổ chức không xuất hiện trong các chip người tham dự.
6. Xóa một người khỏi chip để minh họa việc chỉnh sửa danh sách.
7. Gõ `trang` hoặc `phuong` để minh họa gợi ý nhân viên, sau đó chọn email tương ứng.

Điểm cần nói:

- Người tổ chức chắc chắn tham dự nên không bị thêm lại vào danh sách mời.
- Số người dự kiến được hệ thống tự tính bằng người tổ chức cộng người tham dự.

### Bước 3 — Gợi ý thời gian (1 phút)

1. Trên form tạo lịch, nhập người tổ chức `leader@ictu.edu.vn`.
2. Nhập một người tham dự, ví dụ `minhanh@ictu.edu.vn`.
3. Chọn khoảng thời gian rộng trong tương lai, ví dụ từ 08:00 đến 17:00.
4. Bấm **Gợi ý giờ trống**.
5. Chọn một khung giờ được đề xuất; form tự điền lại thời gian bắt đầu và kết thúc.

Điểm cần nói:

- Backend tính thời gian chung mọi người cùng rảnh.
- Nếu không có khung giờ phù hợp, hệ thống hiển thị thông báo thay vì tạo lịch sai.

### Bước 4 — Tìm phòng và tạo lịch (2 phút)

1. Chọn thời gian trong tương lai, ví dụ một giờ họp vào ngày mai.
2. Bấm **Tìm phòng phù hợp**.
3. Chọn một phòng có sức chứa phù hợp, ví dụ `Phòng A203`.
4. Bấm **Tạo lịch họp**.
5. Quay về **Tổng quan** để chỉ ra số lịch sắp tới và số phòng đã đặt đã tăng.
6. Mở **Lịch họp** để cho mentor xem cuộc họp, người tổ chức, người tham dự và phòng.

Điểm cần nói:

- Tạo cuộc họp và đặt phòng được gửi trong cùng một yêu cầu.
- Nếu đặt phòng thất bại, form không bị xóa để người dùng không phải nhập lại.

### Bước 5 — Xem chi tiết, chỉnh sửa và hủy lịch (2 phút)

1. Tại trang **Lịch họp**, bấm **Xem chi tiết** trên cuộc họp vừa tạo.
2. Kiểm tra tiêu đề, thời gian, quy mô, phòng và danh sách người tham dự.
3. Đóng cửa sổ chi tiết.
4. Bấm menu `⋯` của cuộc họp, chọn **Chỉnh sửa**.
5. Đổi mô tả hoặc thêm một người tham dự, sau đó bấm **Lưu thay đổi**.
6. Mở lại **Xem chi tiết** để xác nhận dữ liệu đã cập nhật.
7. Với một cuộc họp riêng không cần giữ lại, mở menu `⋯`, chọn **Hủy lịch** và xác nhận.
8. Cuộc họp chuyển sang trạng thái **Đã hủy**, không bị xóa khỏi lịch sử.

Điểm cần nói:

- Chỉ người tổ chức mới được sửa hoặc hủy cuộc họp.
- Cuộc họp đã hủy vẫn được lưu để tra cứu lịch sử.

### Bước 6 — Lọc phòng cơ bản và tra cứu nâng cao (1 phút)

1. Chọn **Phòng họp**.
2. Bấm **Xem danh sách phòng**.
3. Thử các lựa chọn trong **Danh sách phòng**:
   - `Tất cả phòng`.
   - `Phòng đang trống`.
   - `Phòng đã đặt`.
4. Lọc tiếp theo tòa/khu vực và tầng 2 hoặc tầng 3.
5. Nhập thời gian + sức chứa rồi bấm **Xem phòng đang trống** để minh họa tra cứu chính xác theo khung giờ.

### Bước 7 — Đặt phòng cho cuộc họp chưa có phòng (1 phút)

1. Tạo thêm một cuộc họp nhưng không chọn phòng.
2. Tại danh sách **Lịch họp**, mở menu `⋯` của cuộc họp đó.
3. Chọn **Tìm phòng trống**.
4. Chọn một phòng trong danh sách kết quả.
5. Xác nhận phòng được hiển thị trên thẻ cuộc họp và số phòng đã đặt trên Tổng quan được cập nhật.

### Bước 8 — Tìm lịch bằng email và phân trang (2 phút)

1. Quay lại **Lịch họp**.
2. Gõ `minhanh` vào ô email người tham gia.
3. Chọn gợi ý `minhanh@ictu.edu.vn`.
4. Bấm **Tìm**.
5. Đổi trạng thái hoặc khoảng ngày nếu cần, sau đó bấm **Xóa** để bỏ bộ lọc.

6. Để demo phân trang, tạo một lịch lặp hằng tuần 6 lần với `minhanh@ictu.edu.vn` là người tham dự. Sáu lần lặp sẽ tạo đủ dữ liệu cho hai trang, mỗi trang 5 lịch.
7. Tìm lại email đó và kiểm tra nút **Trước/Sau**, số trang và việc chuyển trang không làm mất bộ lọc.

Điểm cần nói:

- Hệ thống chỉ thực hiện tìm khi bấm nút **Tìm**, không gọi API liên tục trong lúc gõ.
- Lịch sử có phân trang khi số kết quả nhiều.

## 9. Demo lịch lặp và chống trùng (2–3 phút)

1. Vào **Tạo lịch họp**.
2. Tạo lịch với:
   - Lặp lại: `Hằng tuần`.
   - Số lần: `2`.
   - Chọn cùng một phòng.
3. Bấm tạo và cho mentor thấy hai lần lặp được tạo cùng nhau.
4. Tạo một lịch lặp khác sao cho một lần lặp trùng với phòng vừa đặt.
5. Hệ thống phải trả lỗi `409` và không tạo bất kỳ lần lặp nào của yêu cầu thứ hai.

Điểm cần nói:

- Backend kiểm tra tất cả lần lặp trước khi ghi dữ liệu.
- Tạo lịch và đặt phòng nằm trong cùng transaction, nên không xảy ra trạng thái đặt được một phần.

## 10. Demo trạng thái đăng xuất (15 giây)

1. Bấm **Đăng xuất** ở góc phải hoặc cuối sidebar.
2. Hiển thị thông báo: `Chức năng đăng xuất đang được cập nhật.`
3. Giải thích đăng nhập và phân quyền sẽ được bổ sung ở giai đoạn sau.

## 11. Đối chiếu User Story Sprint 1

| User Story | Cách demo |
| --- | --- |
| US01 — Tạo lịch họp | Bước 2 và Bước 4 |
| US02 — Chỉnh sửa/hủy lịch | Bước 5 |
| US03 — Lịch lặp tuần/tháng | Bước 2 hoặc Bước 5, sau đó Bước 9 |
| US04 — Mời người tham dự | Bước 2, gồm gợi ý email và mời tất cả |
| US05 — Gợi ý giờ chung | Bước 3 |
| US06 — Xem lịch sử | Bước 8 |
| US07 — Xem phòng trống | Bước 6 và Bước 7 |
| US08 — Đặt phòng/chống trùng | Bước 4, Bước 7 và Bước 9 |

## 12. Kết luận (30 giây)

> Sprint 1 đã hoàn thiện luồng cốt lõi: tạo, xem, chỉnh sửa và hủy lịch; mời người tham dự; gợi ý thời gian; tìm và đặt phòng; lịch lặp; lịch sử/phân trang; và ngăn dữ liệu trùng. Các phần chưa thuộc Sprint 1 gồm đăng nhập, phân quyền và gửi email lời mời thực tế.

## 13. Nếu mentor hỏi về dữ liệu

- Muốn làm sạch lại trước khi demo: chạy `python scripts/reset_demo_data.py`.
- Muốn nạp sẵn dữ liệu mẫu để trình diễn nhanh: chạy `python scripts/seed_demo_data.py`.
- Hai script không dùng trong test tự động; test vẫn tạo database riêng.
