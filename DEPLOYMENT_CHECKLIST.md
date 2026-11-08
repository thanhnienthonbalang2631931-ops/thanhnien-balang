# Checklist triển khai hạ tầng production – chưa được tự ý bỏ qua

## 1. Máy chủ và HTTPS
- Máy chủ Linux/Windows Server 24/7, firewall chỉ mở 80/443; PostgreSQL chỉ cho phép kết nối từ backend/private network.
- Chạy Node.js LTS tương thích, process manager (systemd/PM2/Windows service), log rotation và cảnh báo lỗi.
- Reverse proxy TLS (Nginx/Caddy/IIS) và chứng chỉ hợp lệ cho domain; tự động gia hạn chứng chỉ.
- `NODE_ENV=production`, `CORS_ORIGINS` chỉ chứa domain thật, `PUBLIC_APP_URL=https://...`; không dùng `*`.
- `JWT_SECRET` sinh ngẫu nhiên >= 48 ký tự; không commit `.env`; quyền đọc file env chỉ dành cho service account.

## 2. PostgreSQL
- Database riêng cho production; user DB quyền tối thiểu, không chạy ứng dụng bằng superuser.
- TLS DB nếu kết nối qua mạng; firewall allowlist; bật log truy vấn lỗi và giám sát dung lượng.
- Chạy migration sau khi backup; kiểm tra migration ledger; diễn tập rollback trên staging.

## 3. SMTP
- Tài khoản gửi thư riêng cho ứng dụng; SMTP TLS; SPF/DKIM/DMARC cho domain gửi thư.
- Thử gửi reset password, xác minh link 30 phút, dùng một lần; không tiết lộ email có tồn tại hay không.

## 4. Kho tệp
- Chưa có object storage tích hợp trong V136. Trước production phải chọn S3-compatible object storage hoặc kho riêng có mã hóa, phân quyền, giới hạn loại/kích thước, quét malware, URL ký hạn ngắn và backup/versioning.
- Không lưu tệp lớn trong localStorage hoặc PostgreSQL JSONB.

## 5. Backup/restore
- Script `ops/backup_postgres.ps1` chỉ sao lưu PostgreSQL; chưa bao gồm kho tệp.
- `ops/install_backup_task.ps1` tạo tác vụ Windows hằng ngày lúc 02:00 theo tài khoản đang đăng nhập. Đây chỉ là tiện ích kiểm thử trên Windows, không thay thế backup production 24/7.
- Production phải có backup DB + object storage theo lịch, bản sao ngoài máy chủ, mã hóa, retention, cảnh báo thất bại và RPO/RTO được phê duyệt.
- Diễn tập restore vào database/bucket mới, kiểm tra số lượng bản ghi, file checksum và khả năng đăng nhập trước khi ký nghiệm thu.

## 6. Go-live gates
- Không mở cho người dùng thật khi còn module ghi `localStorage`.
- Không phát hành khi thiếu API server-side authorization, kiểm thử cross-tenant, backup file, restore drill, HTTPS và SMTP thật.
- Nghiệm thu riêng trên Edge Windows và Android; lưu biên bản, ảnh/video, log và kết quả test.
