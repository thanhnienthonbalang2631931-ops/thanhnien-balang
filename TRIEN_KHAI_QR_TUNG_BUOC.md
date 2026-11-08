# Triển khai phân hệ QR từng bước (dành cho người mới)

> Không đưa dữ liệu đoàn viên thật vào hệ thống cho đến khi hoàn thành kiểm thử và có backup có thể phục hồi.

## A. Chạy thử trên máy tính

1. Cài Node.js 22 LTS và Docker Desktop (hoặc PostgreSQL 15+).
2. Mở Terminal tại thư mục `backend`.
3. Chạy `docker compose up -d` để bật PostgreSQL local.
4. Sao chép `.env.example` thành `.env`.
5. Tạo `JWT_SECRET` ngẫu nhiên dài ít nhất 48 ký tự. Không dùng chuỗi ví dụ.
6. Chạy `npm install`.
7. Chạy `npm run migrate`.
8. Tạo tài khoản Bí thư bằng biến môi trường:
   - Windows PowerShell:
     ```powershell
     $env:ADMIN_EMAIL='bi.thu@example.vn'
     $env:ADMIN_PASSWORD='MatKhauMoiDaiHon12KyTu'
     npm run create-admin
     ```
   - macOS/Linux:
     ```bash
     ADMIN_EMAIL='bi.thu@example.vn' ADMIN_PASSWORD='MatKhauMoiDaiHon12KyTu' npm run create-admin
     ```
9. Nạp dữ liệu tổ chức, đoàn viên và hoạt động theo `DATA_IMPORT_GUIDE.md`.
10. Tạo tài khoản cho đoàn viên/cán bộ bằng `npm run create-user`, gắn chính xác `USER_MEMBER_ID`.
11. Chạy `npm start`, mở `http://localhost:4000/health`; phải thấy `database: connected`.
12. Chạy website bằng một web server local (ví dụ VS Code Live Server trên `http://localhost:5500`). Mở `QR_CONFIG.js`, điền `apiBaseUrl: 'http://localhost:4000'`.
13. Đăng nhập website bằng tài khoản Backend, mở **Điểm danh QR**, tạo phiên thử với dữ liệu giả.

## B. Kiểm thử bắt buộc trước khi dùng thật

- Tài khoản Bí thư tạo phiên được; tài khoản Phó Bí thư/Ủy viên/Đoàn viên không tạo được kể cả gọi API trực tiếp.
- Đoàn viên đăng nhập và xác nhận được nếu hồ sơ thuộc danh sách tham gia.
- Đổi memberId trong DevTools hoặc payload không làm thay đổi danh tính ghi nhận.
- QR hết hạn, token cũ sau khi đổi mã, token bị thu hồi đều bị từ chối.
- Quét sai hoạt động vẫn chỉ ghi vào hoạt động gắn với token; không thể tự sửa activityId.
- Quét hai lần hoặc gửi hai request đồng thời chỉ có một bản ghi.
- Bảng điểm danh đã khóa thì QR và thao tác thủ công đều bị từ chối.
- Bí thư/Phó Bí thư xem được toàn danh sách; Đoàn viên/Ủy viên chỉ xem lịch sử cá nhân.
- Kiểm tra Android Chrome và iPhone Safari qua HTTPS; kiểm tra từ chối quyền camera và đường mở QR bằng camera mặc định.
- Kiểm tra backup và restore PostgreSQL trên một database thử nghiệm riêng.

## C. Trước khi đưa lên mạng

- Cấu hình domain HTTPS cho website và API.
- Đặt `NODE_ENV=production`, `CORS_ORIGINS` chỉ chứa domain website, `JWT_SECRET` riêng.
- Dùng PostgreSQL quản lý; không công khai cổng database.
- Bật backup tự động, lưu ngoài máy chủ chính và thử phục hồi.
- Bật giám sát uptime, log lỗi và dung lượng database.
- Đổi toàn bộ mật khẩu tài khoản thử; cấp tài khoản cá nhân, không dùng chung.
- Chốt quy trình xử lý quên mật khẩu, khóa tài khoản, thu hồi phiên và điều chỉnh điểm danh.
