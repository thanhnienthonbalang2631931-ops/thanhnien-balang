# Backend nền tảng – V135 (bản triển khai kỹ thuật thử nghiệm)

V135 bổ sung nền tảng backend cho sáu nhóm rủi ro. Đây **chưa phải bản phát hành chính thức**: giao diện V134 vẫn còn cơ chế demo/localStorage và chưa chuyển toàn bộ phân hệ sang API.

## Những gì đã bổ sung trong mã nguồn

1. **Đăng nhập và phiên máy chủ**
   - JWT có `sid`; mỗi request kiểm tra session còn hiệu lực trong PostgreSQL.
   - Đăng xuất thu hồi session; đổi mật khẩu sau reset sẽ thu hồi tất cả session.
   - Khôi phục mật khẩu dùng token ngẫu nhiên, chỉ lưu SHA-256 hash, hiệu lực 30 phút, dùng một lần; gửi email qua SMTP. SMTP chưa cấu hình thì API báo rõ chưa sẵn sàng.
   - Giới hạn tần suất đăng nhập và yêu cầu reset.
2. **Phân quyền backend**
   - Có catalog `permissions`, `role_permissions`, `user_permission_grants`.
   - Middleware `requirePermission(module, action)` kiểm tra quyền mặc định và ủy quyền còn hiệu lực từ DB.
   - Riêng chứng nhận chỉ Bí thư được cấp/xem toàn bộ/thu hồi; không nhận ủy quyền từ grant.
   - Các API cũ chưa được chuyển hết sang middleware mới; phải chuyển theo từng module trước phát hành.
3. **PostgreSQL và đa đơn vị**
   - Mở rộng session, quyền, chứng nhận, reset token; dùng `organization_id` và bảng closure tổ chức cha–con.
   - Trigger duy trì closure khi thêm/sửa quan hệ cha–con và chặn chu trình.
   - Backend QR hiện hữu tiếp tục dùng phạm vi organization_id.
   - Các bảng nghiệp vụ của toàn website chưa được chuyển hết khỏi localStorage.
4. **QR chứng nhận**
   - Token 256-bit ngẫu nhiên; chỉ lưu hash; endpoint công khai xác minh một token/một chứng nhận.
   - API công khai không có endpoint liệt kê/tìm kiếm; chứng nhận thu hồi trả trạng thái thu hồi, không trả nội dung chứng nhận.
   - Token thô chỉ trả một lần khi cấp; cần lưu QR/URL an toàn ngay sau khi cấp.
5. **Sao lưu/phục hồi**
   - Có quy trình PowerShell backup PostgreSQL và restore vào database kiểm thử riêng.
   - Đây là hướng dẫn vận hành, chưa có lịch backup tự động, mã hóa tự động hoặc kho tệp đính kèm dùng chung.
6. **Kiểm thử**
   - Bổ sung kiểm thử hợp đồng tĩnh cho các điểm nền tảng.
   - Cần chạy migration trên PostgreSQL thật, test API tích hợp, kiểm tra SMTP, backup/restore và kiểm thử trình duyệt trước nghiệm thu.

## Triển khai migration

1. Sao lưu database trước khi chạy migration.
2. Trước migration, kiểm tra email trùng không phân biệt hoa thường: `SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*)>1;` Nếu có kết quả, phải xử lý trùng có đối soát trước khi chạy. Sau đó cấu hình `.env` theo `.env.example`, đặc biệt `DATABASE_URL`, `JWT_SECRET` tối thiểu 48 ký tự, `PUBLIC_APP_URL`, `CORS_ORIGINS`.
3. Cấu hình SMTP thật để khôi phục mật khẩu. Không dùng tài khoản email cá nhân dùng chung.
4. Chạy `npm install`, sau đó `npm run migrate`. Migration runner ghi nhận từng migration trong `schema_migrations`.
5. Chạy `npm test`, `npm start`, kiểm tra `/health`.
6. Không trỏ website V134 đang dùng dữ liệu thật vào API này cho đến khi hoàn tất adapter/migration frontend và kiểm thử đối soát.

## API mới

- `POST /api/auth/password-reset/request` – gửi liên kết reset qua SMTP.
- `POST /api/auth/password-reset/confirm` – đặt mật khẩu mới (tối thiểu 12 ký tự), thu hồi các phiên cũ.
- `POST /api/auth/logout` – thu hồi phiên hiện tại.
- `GET /api/certificates/public/verify/:token` – xác minh đúng một chứng nhận.
- `GET /api/certificates/mine` – chứng nhận của tài khoản đang đăng nhập.
- `GET /api/certificates` – danh sách toàn đơn vị, chỉ Bí thư.
- `POST /api/certificates` – cấp chứng nhận, chỉ Bí thư.
- `POST /api/certificates/:id/revoke` – thu hồi, chỉ Bí thư.

## Hạn chế còn lại – không được bỏ qua

- Chưa tích hợp màn hình đăng nhập V134 với `/api/auth/login`; bộ chọn vai trò demo vẫn còn.
- Chưa di chuyển toàn bộ thành viên, hoạt động, nhiệm vụ, xin phép, thu/chi, thư viện, KPI, sổ kỳ sang PostgreSQL/API.
- Chưa có API quản trị cây đơn vị và màn hình quản lý grant; bảng và middleware nền đã có nhưng giao diện/quy trình quản trị chưa hoàn thiện.
- Chưa có dịch vụ lưu tệp đính kèm và backup tệp đồng bộ với backup DB.
- Chưa cấu hình/kiểm chứng SMTP, PostgreSQL production, HTTPS, backup định kỳ, restore thực tế.
- Chưa chạy kiểm thử tích hợp trên DB và kiểm thử Edge/Android thật.

**Kết luận:** V135 là nền móng backend, không phải bằng chứng rằng sáu rủi ro đã được đóng hoàn toàn. Chỉ được phát hành khi mọi dòng trong ma trận nghiệm thu V135+ đều đạt và frontend đã bỏ hoàn toàn xác thực demo/localStorage cho dữ liệu nghiệp vụ.

## Bổ sung V136
- Frontend auth adapter: `../V136_AUTH_INTEGRATION.js`; cấu hình API local mặc định `http://localhost:4000/api`.
- API quản trị đơn vị/grant: `/api/admin/organizations/*` và `/api/admin/permissions/grants*`.
- Migration `003_permission_catalog.sql` thêm danh mục quyền module/action, mặc định deny cho vai trò ngoài Bí thư, ngoại lệ quyền tạo/xem yêu cầu cá nhân.
- Xác minh QR giao diện dùng `?verify-certificate=<token>` hoặc `/verify-certificate?token=<token>`.
- Backup Windows: `ops/backup_postgres.ps1`; cài lịch thử nghiệm bằng `ops/install_backup_task.ps1`.
- Vẫn NO-GO: dữ liệu nghiệp vụ frontend chưa chuyển hết sang API; chưa có transfer profile; chưa backup object storage; chưa cấu hình HTTPS/SMTP production.
