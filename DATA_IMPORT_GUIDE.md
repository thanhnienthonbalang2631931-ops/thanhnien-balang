# Hướng dẫn chuẩn bị dữ liệu để chuyển V131.3 sang QR API

Không nhập thẳng toàn bộ JSON localStorage vào cơ sở dữ liệu mới. Cần đối soát mã định danh trước.

## Bảng ánh xạ tối thiểu

| Dữ liệu V131.3 | Bảng API | Quy tắc |
|---|---|---|
| Mã đơn vị | organizations.id | Dùng mã ổn định, ví dụ `BA-LANG` |
| `db.members[].id` | members.id | Giữ nguyên mã hồ sơ, không tạo mã mới |
| `db.members[].name` | members.full_name | Chuẩn hóa khoảng trắng; không đổi tên tùy tiện |
| `db.activities[].id` | activities.id | Giữ nguyên ID hoạt động để khớp liên kết |
| `db.activities[].name` | activities.name | Giữ tên hiển thị |
| `date`, `time`, `endTime` | `activity_date`, `start_time`, `end_time` | Chuẩn hóa về YYYY-MM-DD và HH:MM:SS |
| `requiredMode`, `requiredMembers` | `required_mode`, `required_member_ids` | required_member_ids là JSON array |
| Tài khoản thật sau xác minh | users | Không chuyển mật khẩu demo/localStorage; cấp mật khẩu mới |

## SQL ví dụ (chạy sau migration)

```sql
INSERT INTO organizations(id,name) VALUES ('BA-LANG','Chi đoàn thôn Ba Lăng')
ON CONFLICT(id) DO NOTHING;

INSERT INTO members(id,organization_id,full_name,member_status)
VALUES ('DV001','BA-LANG','Nguyễn Văn A','ACTIVE');

INSERT INTO activities(id,organization_id,name,activity_date,start_time,end_time,place,status,required_mode,required_member_ids)
VALUES ('HD001','BA-LANG','Sinh hoạt Chi đoàn','2026-11-20','19:00:00','20:30:00','Nhà văn hóa thôn','Đang mở đăng ký','Tất cả đoàn viên phải đi','[]'::jsonb);
```

Đây chỉ là ví dụ cấu trúc, không phải dữ liệu thật của Chi đoàn. Trước import cần backup, chạy thử trên database rỗng, đối chiếu tổng số đoàn viên/hoạt động, kiểm tra ID trùng và xác nhận bằng người quản lý dữ liệu.
