# Tài nguyên Vũ trụ 3D Cơ Bản (`/world`)

Thư mục này chứa duy nhất gói dữ liệu bề mặt hành tinh nhẹ (`data/` ~`12.4 MB`) phục vụ **Quả cầu Vũ trụ 3D (`Tinh Vực Akunalia` & `Hệ Mặt Trời`)** và **Bản đồ Atlas 2D** trên Web.

Toàn bộ khâu chế tác mô hình kiến trúc `.glb` nặng, Clockwork Intro kiểu *Game of Thrones*, thế giới mở 3D kiểu *Final Fantasy* và sân khấu Visual Novel / Dựng phim đã được tách sang **Ứng dụng Desktop Studio riêng của hệ sinh thái Selorson** và đẩy sang Selorson qua **Cổng Mở Đồng Bộ (`POST /api/v1/admin/sync/world-studio`)**.

## Cấu trúc thư mục

- `data/` — Bản đồ màu, độ cao, mây và đường bờ biển lục địa (`earth_continents.geojson`, `akunalia-*-2k/4k`, `earth-*-2k/4k`, các hành tinh Hệ Mặt Trời).
- `regions.geojson` — Ranh giới vùng đất dự phòng tĩnh khi chưa có bản vẽ động từ `/api/v1/world/borders.geojson`.

