# Tài nguyên thế giới 3D

Thư mục này là **nguồn mặc định** cho tài nguyên bản đồ 3D khi chạy local.
Trên production, đặt biến môi trường `PUBLIC_WORLD_ASSET_BASE` trỏ sang bucket
R2 và toàn bộ đường dẫn bên dưới sẽ tự chuyển sang đó — không phải sửa code.

```
PUBLIC_WORLD_ASSET_BASE=https://assets.selorson.com/world
```

## `textures/`

Bề mặt hành tinh Akunalia, dạng chiếu equirectangular (tỉ lệ 2:1).

| File | Kích thước | Dùng cho |
|---|---|---|
| `akunalia-color-4k.jpg` | 4096×2048 | Tầng chất lượng **high** |
| `akunalia-color-2k.jpg` | 2048×1024 | Tầng **medium** và **low** |
| `akunalia-bump-2k.jpg` | 2048×1024 | Nổi khối địa hình (bump + displacement) |
| `akunalia-clouds-2k.jpg` | 2048×1024 | Lớp mây, blend cộng |

Nguồn gốc: chuyển đổi từ `E:\Selorson\chaldeas-fgo-demo\*.png` (22,5 MB PNG →
4,2 MB JPG). Thay ảnh mới thì giữ nguyên tên file, hoặc đổi đường dẫn trong
`src/lib/world/config.ts`.

> Bước tối ưu tiếp theo (mốc M5): chuyển sang KTX2/BasisU, giảm thêm 4–6 lần
> bộ nhớ GPU. Cloudflare Pages chặn file trên 25 MiB nên các asset lớn phải
> nằm trên R2.

## `regions.geojson`

Ranh giới các vùng đất. **Tải lúc chạy, không nhúng vào bundle** — vẽ lại bản
đồ chỉ cần thay file này, không build lại, không deploy lại.

Định dạng: `FeatureCollection`, mỗi feature là một vùng, toạ độ `[lng, lat]`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "region": "annamland", "name": "Annamland" },
      "geometry": { "type": "MultiPolygon", "coordinates": [ [ [ [108.1, 14.2], ... ] ] ] }
    }
  ]
}
```

`properties.region` phải khớp với `extra_data.world.slug` của mục thư viện có
`kind: "region"`.

**Hiện đang rỗng.** Vùng nào chưa có ranh giới thì cảnh vùng đất vẫn chạy — nền
đất hiện dạng đĩa tròn, các địa điểm vẫn đứng đúng vị trí tương đối, chỉ thiếu
đường bờ. Đây là trạng thái hợp lệ, không phải lỗi.

Cách tạo dữ liệu thật: lấy ranh giới quốc gia thế giới (Natural Earth /
world-atlas), gộp các quốc gia thành từng vùng Akunalia theo bảng ánh xạ, rồi
đổi `properties.region` thành slug tương ứng. Các vùng hư cấu thuần (Skyland,
Dragonland, Devilland) phải vẽ tay.

## `models/`

Mô hình `.glb` cho các địa điểm chủ lực. Đường dẫn ghi trong
`extra_data.world.model` của từng mục thư viện, ví dụ
`world/models/sindark-castle.glb`. Địa điểm không có mô hình sẽ được dựng tự
động từ `terrain` bằng bộ builder kit-bash.
