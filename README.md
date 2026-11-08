# THANH NIÊN BA LĂNG – QR Attendance API v1

Phân hệ QR chạy trên Node.js + Express + PostgreSQL. Đây là Backend API; không tự coi là đã triển khai chỉ vì mã nguồn có mặt trong ZIP.

## Chức năng
- Đăng nhập tài khoản và xác định danh tính từ JWT do máy chủ ký.
- Bí thư tạo phiên QR theo hoạt động, thời gian mở/đóng.
- Token ngẫu nhiên 256-bit, chỉ lưu SHA-256 hash trong DB; QR token tự hết hạn (30–300 giây, mặc định 90 giây) và có thể xoay/thu hồi.
- Quét/mở QR yêu cầu đăng nhập; member_id lấy từ tài khoản, không nhận từ trình duyệt.
- Chống trùng bằng unique constraint `(organization_id, activity_id, member_id)` và transaction/row lock.
- Ghi giờ máy chủ, trạng thái đúng giờ/trễ, phương thức, người thao tác và audit log.
- Bí thư xem danh sách; Phó Bí thư được xem danh sách; Bí thư tạo/đổi mã/tạm dừng/đóng/thu hồi phiên và chốt bảng.
- Điểm danh thủ công dùng chung bảng dữ liệu; endpoint riêng có audit.

## Cài đặt local
1. Cài Node.js 22+, PostgreSQL 15+.
2. Tạo database `thanh_nien_ba_lang`.
3. Sao chép `.env.example` thành `.env`; điền `DATABASE_URL`, `JWT_SECRET` (ít nhất 48 ký tự), `PUBLIC_APP_URL` và `CORS_ORIGINS`.
4. `npm install`
5. `npm run migrate`
6. Tạo tài khoản quản trị lần đầu:
   - PowerShell: `$env:ADMIN_EMAIL='...'; $env:ADMIN_PASSWORD='...'; npm run create-admin`
   - macOS/Linux: `ADMIN_EMAIL='...' ADMIN_PASSWORD='...' npm run create-admin`
7. Tạo tài khoản đoàn viên/cán bộ sau khi đã nạp hồ sơ vào `members`: đặt `USER_EMAIL`, `USER_PASSWORD`, `USER_ROLE`, `USER_MEMBER_ID` rồi chạy `npm run create-user`. Script kiểm tra member thuộc đúng tổ chức trước khi gắn tài khoản.
8. `npm start`; kiểm tra `GET http://localhost:4000/health`.

## Dữ liệu bắt buộc trước khi chạy QR
Cần nạp đúng tổ chức, đoàn viên và hoạt động vào các bảng `organizations`, `members`, `activities`; tạo tài khoản cho từng người trong `users` và gắn `member_id` đúng. Schema và ràng buộc nằm trong `migrations/001_qr_attendance.sql`. Không tự động nhập dữ liệu localStorage để tránh ghép sai mã đoàn viên/hoạt động. Hãy xuất backup V131.3, lập bảng đối soát ID rồi import có kiểm tra.

`activities.id` phải khớp mã hoạt động mà giao diện hiện tại đang dùng. `members.id` phải khớp mã hồ sơ. `required_member_ids` là JSON array mã đoàn viên; `required_mode` giữ giá trị `Chỉ một số đoàn viên phải đi` để áp dụng danh sách giới hạn.

## Kết nối giao diện V131.3
Mở `QR_CONFIG.js`, đặt `apiBaseUrl` thành địa chỉ Backend, ví dụ `https://api.example.vn`. `publicAppUrl` phải là URL website được triển khai HTTPS. Không đặt mật khẩu hoặc JWT secret ở frontend.

Mở mục **Điểm danh QR** trong website, đăng nhập bằng tài khoản Backend. Bí thư tạo phiên QR. QR được xoay định kỳ; đoàn viên quét bằng camera điện thoại hoặc camera trong giao diện, đăng nhập và xác nhận. Trình duyệt cần HTTPS để truy cập camera.

## API
- `POST /api/auth/login` `{email,password}`
- `GET /api/auth/me` (Bearer token)
- `GET /api/qr/public/:token` (chỉ thông tin hoạt động công khai tối thiểu)
- `POST /api/qr/sessions` (Bí thư)
- `GET /api/qr/sessions?activityId=...` (Bí thư/Phó Bí thư)
- `POST /api/qr/sessions/:id/rotate` (Bí thư)
- `POST /api/qr/sessions/:id/pause|resume|close|revoke` (Bí thư)
- `POST /api/qr/check-in` `{token}` (đoàn viên đã đăng nhập; không gửi memberId)
- `GET /api/qr/activities/:activityId/attendance` (Bí thư/Phó Bí thư)
- `POST /api/qr/activities/:activityId/manual` (Bí thư)
- `POST /api/qr/activities/:activityId/lock` (Bí thư)

Mọi endpoint nội bộ cần `Authorization: Bearer <JWT>`.

## Kiểm thử
`npm test` chạy test đơn vị cho token và tính trễ. Kiểm thử tích hợp DB cần môi trường PostgreSQL và tài khoản test; trước nghiệm thu phải chạy ma trận 5 vai trò, token hết hạn/thu hồi, replay, quét sai hoạt động, hoạt động khóa, hai yêu cầu đồng thời, đa thiết bị, camera denied và backup/restore.

## An toàn vận hành
- Bắt buộc HTTPS; đặt `NODE_ENV=production`, secret riêng và backup PostgreSQL tự động.
- Không mở PostgreSQL ra Internet; chỉ Backend truy cập.
- CORS chỉ cho domain website chính thức.
- Dùng tài khoản DB quyền tối thiểu; bật TLS tới DB khi dùng dịch vụ quản lý.
- QR không phải chứng minh danh tính: người dùng phải đăng nhập tài khoản cá nhân. Bí thư cần giữ màn hình quản lý phiên QR hoạt động để giao diện tự xoay mã theo chu kỳ; nếu tắt màn hình phát, mã cuối sẽ tự hết hạn và cần mở lại/phát hành mã mới.
- Thời gian được tính theo `Asia/Ho_Chi_Minh` (UTC+7) cho nghiệp vụ hoạt động; thời điểm lưu dùng timestamptz.
- Chưa tích hợp hệ thống này với toàn bộ tài khoản localStorage V131.3; cần kế hoạch chuyển dữ liệu và cấp tài khoản trước khi vận hành thật.

---

## V135 – nền tảng dùng chung (đang thử nghiệm)

Xem `README_PLATFORM_FOUNDATION.md` và `../BAO_CAO_V135_NEN_TANG_BAO_MAT.md` để biết migration 002, session có thể thu hồi, khôi phục mật khẩu SMTP, permission/grant, cây tổ chức, API chứng nhận và quy trình backup/restore. Không đưa vào production cho đến khi hoàn tất tích hợp frontend và kiểm thử PostgreSQL thật.
