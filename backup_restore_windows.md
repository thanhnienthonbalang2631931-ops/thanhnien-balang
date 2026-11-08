# Quy trình sao lưu và phục hồi PostgreSQL (Windows PowerShell)

> Không chạy lệnh phục hồi trên cơ sở dữ liệu đang sử dụng. Luôn phục hồi vào database thử nghiệm riêng, đối soát xong mới lập kế hoạch chuyển đổi.

## 1. Sao lưu

```powershell
$env:PGPASSWORD = "MAT_KHAU_DB"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path .\backups | Out-Null
pg_dump --format=custom --no-owner --no-acl --file ".\backups\tnbl_$stamp.dump" --host "DB_HOST" --port 5432 --username "DB_USER" --dbname "thanh_nien_ba_lang"
if ($LASTEXITCODE -ne 0) { throw "Backup thất bại" }
Get-FileHash ".\backups\tnbl_$stamp.dump" -Algorithm SHA256
Remove-Item Env:\PGPASSWORD
```

## 2. Phục hồi vào database kiểm thử riêng

```powershell
$env:PGPASSWORD = "MAT_KHAU_DB"
createdb --host "DB_HOST" --port 5432 --username "DB_USER" "tnbl_restore_test"
if ($LASTEXITCODE -ne 0) { throw "Không tạo được database kiểm thử; dừng tại đây" }
pg_restore --verbose --no-owner --no-acl --host "DB_HOST" --port 5432 --username "DB_USER" --dbname "tnbl_restore_test" ".\backups\FILE_BACKUP.dump"
if ($LASTEXITCODE -ne 0) { throw "Restore thất bại; giữ nguyên backup và điều tra" }
psql --host "DB_HOST" --port 5432 --username "DB_USER" --dbname "tnbl_restore_test" --command "SELECT current_database(), count(*) FROM organizations;"
Remove-Item Env:\PGPASSWORD
```

## 3. Điều kiện vận hành
- Tài khoản DB backup có quyền đọc/backup; tài khoản restore chỉ dùng trong môi trường khôi phục.
- Mã hóa backup khi lưu ngoài máy chủ; không gửi file `.dump` qua nhóm chat.
- Lưu ít nhất một bản backup tách biệt máy chủ chính; quy định retention theo chính sách đơn vị.
- Tệp đính kèm phải được backup riêng theo cùng mốc thời gian và có manifest/checksum. V134 chưa có kho tệp máy chủ nên chưa thể tuyên bố đã backup được tệp.
- Diễn tập restore định kỳ; ghi lại thời gian khôi phục (RTO), điểm dữ liệu gần nhất (RPO), số bản ghi đối soát và checksum.
- Lệnh trên là quy trình thao tác, không tự động hóa lịch chạy, mã hóa hay kiểm tra integrity toàn diện.
