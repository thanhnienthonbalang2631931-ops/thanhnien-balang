# API hồ sơ đoàn viên (giai đoạn 4 – phân hệ 1)
Nguồn dữ liệu chính thức: PostgreSQL (bảng `members`, `member_history`). Cần đăng nhập (Bearer token). Quyền do máy chủ kiểm tra (`members.read/create/update/archive`); Bí thư có đủ, vai trò khác cần được cấp quyền riêng.

| Phương thức | Đường dẫn | Ý nghĩa |
|---|---|---|
| GET | `/api/members/me` | Hồ sơ của chính mình (mọi tài khoản có gắn hồ sơ) |
| GET | `/api/members?q=&status=&kind=&archived=&limit=&offset=` | Danh sách (tìm theo tên/mã/SĐT) |
| GET | `/api/members/:id`, `/api/members/:id/history` | Chi tiết, lịch sử |
| POST | `/api/members` | Tạo hồ sơ; mã tự sinh `DV0001-<đơn vị>`; trùng tên+ngày sinh hoặc SĐT → 409 `DUPLICATE_CANDIDATE` (gửi `confirmNotDuplicate:true` nếu là người khác) |
| PATCH | `/api/members/:id` | Sửa; **bắt buộc** `expectedVersion`; người khác sửa trước → 409 `VERSION_CONFLICT` |
| POST | `/api/members/:id/status` | Chuyển đến/đi, ngừng sinh hoạt (ghi lịch sử, không xóa) |
| POST | `/api/members/:id/archive` | Lưu trữ thay cho xóa; khóa tài khoản và thu hồi phiên của người đó |
| POST | `/api/members/import` | Chỉ Bí thư. Nhập hàng loạt (tối đa 500) từ bản sao lưu cũ `{members:[…], memberHistory:[…]}`; chạy lại không nhân đôi; trả báo cáo cảnh báo |

Ràng buộc ở cơ sở dữ liệu (kể cả khi chạy SQL trực tiếp): không xóa được `members`; `member_history` chỉ thêm, không sửa/xóa.
Giới hạn đã biết: mã hồ sơ là duy nhất toàn hệ thống (không riêng từng đơn vị); số điện thoại/địa chỉ chưa có phân quyền riêng theo trường.
Giao diện hiện tại CHƯA dùng API này: trang Đoàn viên vẫn đọc/ghi localStorage cho tới khi chuyển xong.
