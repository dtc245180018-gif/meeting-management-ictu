# Kịch bản demo thủ công cho mentor

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
- Danh mục phòng và danh sách nhân viên ICTU vẫn có sẵn để chọn.
- Các lần chạy lại reset đều đưa hệ thống về cùng trạng thái sạch.

## 2. Thông điệp mở đầu (30 giây)

> Đây là hệ thống quản lý lịch họp nội bộ ICTU. Sprint 1 tập trung vào tạo cuộc họp, mời người tham dự, gợi ý thời gian, tìm/đặt phòng và quản lý lịch lặp. Hiện hệ thống chưa có đăng nhập nên người tổ chức được chọn từ danh sách nhân viên ICTU.

## 3. Demo luồng chính (khoảng 8 phút)

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
5. Cho mentor thấy người tổ chức không xuất hiện trong các chip người tham dự.
6. Xóa một người khỏi chip để minh họa việc chỉnh sửa danh sách.
7. Có thể gõ một phần tên/email để chọn gợi ý nhân viên.

Điểm cần nói:

- Người tổ chức chắc chắn tham dự nên không bị thêm lại vào danh sách mời.
- Số người dự kiến được hệ thống tự tính bằng người tổ chức cộng người tham dự.

### Bước 3 — Tìm phòng và tạo lịch (2 phút)

1. Chọn thời gian trong tương lai, ví dụ một giờ họp vào ngày mai.
2. Bấm **Tìm phòng phù hợp**.
3. Chọn một phòng có sức chứa phù hợp, ví dụ `Phòng A203`.
4. Bấm **Tạo lịch họp**.
5. Quay về **Tổng quan** để chỉ ra số lịch sắp tới và số phòng đã đặt đã tăng.
6. Mở **Lịch họp** để cho mentor xem cuộc họp, người tổ chức, người tham dự và phòng.

Điểm cần nói:

- Tạo cuộc họp và đặt phòng được gửi trong cùng một yêu cầu.
- Nếu đặt phòng thất bại, form không bị xóa để người dùng không phải nhập lại.

### Bước 4 — Lọc phòng cơ bản và tra cứu nâng cao (1 phút)

1. Chọn **Phòng họp**.
2. Bấm **Xem danh sách phòng**.
3. Thử các lựa chọn trong **Danh sách phòng**:
   - `Tất cả phòng`.
   - `Phòng đang trống`.
   - `Phòng đã đặt`.
4. Lọc tiếp theo tòa/khu vực và tầng 2 hoặc tầng 3.
5. Nhập thời gian + sức chứa rồi bấm **Xem phòng đang trống** để minh họa tra cứu chính xác theo khung giờ.

### Bước 5 — Tìm lịch bằng email (1 phút)

1. Quay lại **Lịch họp**.
2. Gõ `minhanh` vào ô email người tham gia.
3. Chọn gợi ý `minhanh@ictu.edu.vn`.
4. Bấm **Tìm**.
5. Đổi trạng thái hoặc khoảng ngày nếu cần, sau đó bấm **Xóa** để bỏ bộ lọc.

Điểm cần nói:

- Hệ thống chỉ thực hiện tìm khi bấm nút **Tìm**, không gọi API liên tục trong lúc gõ.
- Lịch sử có phân trang khi số kết quả nhiều.

## 4. Demo lịch lặp và chống trùng (2–3 phút, tùy chọn)

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

## 5. Demo trạng thái đăng xuất (15 giây)

1. Bấm **Đăng xuất** ở góc phải hoặc cuối sidebar.
2. Hiển thị thông báo: `Chức năng đăng xuất đang được cập nhật.`
3. Giải thích đăng nhập và phân quyền sẽ được bổ sung ở giai đoạn sau.

## 6. Kết luận (30 giây)

> Sprint 1 đã hoàn thiện luồng cốt lõi: tạo và chỉnh sửa lịch, mời người tham dự, tìm thời gian/phòng phù hợp, đặt phòng theo lịch lặp và ngăn dữ liệu trùng. Các phần chưa thuộc Sprint 1 gồm đăng nhập, phân quyền và gửi email lời mời thực tế.

## 7. Nếu mentor hỏi về dữ liệu

- Muốn làm sạch lại trước khi demo: chạy `python scripts/reset_demo_data.py`.
- Muốn nạp sẵn dữ liệu mẫu để trình diễn nhanh: chạy `python scripts/seed_demo_data.py`.
- Hai script không dùng trong test tự động; test vẫn tạo database riêng.
