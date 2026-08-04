# Tạo và nhập Asset 3D cho thế giới Selorson

> Kèm theo: [WORLD-3D-PLAN.md](WORLD-3D-PLAN.md) · [WORLD-STUDIO-PLAN.md](WORLD-STUDIO-PLAN.md)
> Cập nhật: 03/08/2026

---

## 1. Hai thư viện, hai việc

| | Thư viện (`/admin/library`) | Thư viện Asset 3D (`/admin/world-assets`) |
|---|---|---|
| Ai thấy | **Độc giả** | **Chỉ mình anh** |
| Chứa gì | Tên, mô tả, lore, tranh 2D đẹp | `.glb`, sprite sheet, texture |
| Mục đích | Để đọc | Để dựng thế giới 3D |
| Nhịp cập nhật | Theo nội dung truyện | Theo lúc anh làm xong model |

Chúng nối với nhau bằng **slot**. Một mục thư viện khai báo asset nào lấp vào
vai trò nào:

```jsonc
// Nhân vật Aria
"assets": {
  "head":   "aria-head-chibi",   // đứng trên bản đồ
  "body":   "aria-full-chibi",   // đi trên hành trình
  "icon":   "aria-icon"          // ảnh nhỏ trên HUD
}
```

**Vì sao phải có slot chứ không phải một trường `model` duy nhất:** một file
hiếm khi đúng ở mọi chỗ. Trên bản đồ toàn cảnh, cả người sẽ nhỏ như hạt bụi —
cái đầu/bán thân mới đọc được. Trên hành trình thì ngược lại, phải thấy cả
dáng đi. Gán theo slot cho phép cả hai cùng đúng, và nâng cấp cái này không
đụng cái kia.

Bindings lưu **slug**, không lưu id hay URL. Đổi tên asset hay xuất lại file
đều không làm hỏng liên kết.

### Slot có sẵn

| Loại | Slot | Dùng ở đâu |
|---|---|---|
| Nhân vật | `head` | Marker trên bản đồ |
| | `body` | Hành trình |
| | `sprite` | Máy yếu — ảnh render sẵn 8 hướng |
| | `icon` | HUD, timeline |
| Vùng đất | `model` | Thay địa hình tự dựng |
| Địa điểm | `model` | Thay bộ dựng tự động |
| | `icon` | Danh sách |
| Vật phẩm | `model` | Khi nhân vật tìm được |
| | `icon` | Ô "Tìm được" |
| Truyền thuyết | `icon` | Cạnh đoạn lore |

Thêm slot mới là **một dòng** trong `src/lib/world-assets/types.ts` — cả bộ
chọn lẫn engine đều đọc từ bảng đó.

**Slot trống không phải lỗi.** Engine tự rơi xuống mức dưới: model → sprite →
ảnh thư viện → chấm sáng. Chưa có asset thì thế giới vẫn chạy, chỉ kém đẹp hơn.

---

## 2. Nguồn asset miễn phí dùng được thương mại

Ba nguồn dưới đây **đều CC0** — không cần ghi công, dùng thương mại thoải mái,
và **đã có sẵn định dạng glTF/GLB** nên bỏ thẳng vào được:

| Nguồn | Hợp với | Ghi chú |
|---|---|---|
| [Kenney](https://kenney.nl) | Vật phẩm, UI, kit dựng nhà cửa | Hơn 40.000 asset, tất cả CC0, không cần đăng ký. Phong cách đồng nhất nên trộn được với nhau |
| [Quaternius](https://quaternius.com) | **Nhân vật, vũ khí, cây cối, quái** | Low-poly cách điệu, **có sẵn rig và animation**. Đây là nguồn hợp nhất với thế giới của anh |
| [Poly Haven](https://polyhaven.com) | Texture, HDRI, đồ vật thực tế | Thiên về tả thực, hợp làm chất liệu hơn là nhân vật |

Thêm hai nguồn nữa, nhưng **phải đọc licence từng món**:

- [Sketchfab](https://sketchfab.com) — lọc "Downloadable" + "CC0" hoặc "CC-BY".
  Rất nhiều món CC-BY, **dùng được nhưng bắt buộc ghi công**.
- [KayKit](https://kaylousberg.itch.io) — bộ dungeon/character CC0, phong cách
  chibi rất hợp nếu anh muốn hướng đó.

> **Cơ chế chống quên trong hệ thống**: form nhập asset bắt điền giấy phép và
> nguồn. Món nào cần ghi công sẽ có dấu **©** trên thẻ, và nút **📜 Ghi công**
> xuất ra danh sách đầy đủ để dán vào trang credit. Món nào bỏ trống giấy phép
> sẽ bị liệt kê riêng như một lỗi cần sửa — vì sau vài tháng thì không ai nhớ
> nổi món đó lấy từ đâu, mà không rõ giấy phép là không phát hành được.

---

## 3. Tận dụng phần mềm anh đang có

| Phần mềm | Dùng được cho asset web? | Cụ thể |
|---|---|---|
| **Blender** | ✅ **Công cụ chính** | Model, sculpt, retopo, UV, bake, rig, xuất `.glb`. Toàn bộ quy trình §4 |
| **Illustrator** | ✅ Có | Vẽ vector → SVG → Blender import → extrude. Rất hợp làm **biểu tượng, huy hiệu, phù văn, bản đồ giấy** |
| **Unreal Engine 5** | ⚠️ Gián tiếp | **MetaHuman dùng được** — licence hiện cho phép dùng với bất kỳ engine/phần mềm nào, miễn phí dưới ngưỡng 1 triệu USD doanh thu. Nhưng MetaHuman **quá nặng cho web**, phải đưa qua Blender giảm poly mạnh. Còn asset Nanite của UE5 thì không mang sang web được |
| **Houdini Apprentice** | ❌ **Không** | Licence **phi thương mại**, render có watermark, **không xuất được FBX**, lưu ra `.hipnc/.hdanc` không mở được bằng licence thương mại. Giữ cho việc học và phim cá nhân |
| **DaVinci Resolve / After Effects** | ✅ Gián tiếp | Xử lý **sprite sheet** render từ Blender (§5), làm texture động, ghép ảnh thumbnail |
| **RIFE AI** | ✅ Gián tiếp | Nội suy khung hình cho sprite sheet — render 4 hướng rồi nội suy lên 8 |
| **Google Flow (Veo 3)** | ❌ Không | Sinh video, không sinh hình học 3D |

**Điểm đáng chú ý nhất**: bộ phần mềm làm phim của anh có một chỗ dùng được
thật cho web — **render sprite sheet**. Xem §5.

---

## 4. Quy trình Blender → web

### Ngân sách phải giữ

| Hạng mục | Marker trên bản đồ | Địa điểm | Nhân vật hành trình |
|---|---|---|---|
| Tam giác | < 2.000 | < 20.000 | < 15.000 |
| Texture | 512² | 1024² | 1024² |
| Vật liệu | 1–2 | ≤ 4 | ≤ 3 |
| File `.glb` | < 300 KB | < 3 MB | < 2 MB |

Đây không phải con số tuỳ tiện: mục tiêu là **dưới 100 draw call trên desktop,
dưới 50 trên di động**. Mỗi vật liệu là một draw call.

### Các bước

1. **Dựng hình** — thoải mái ở mức cao.
2. **Giảm poly** — `Decimate` modifier, hoặc retopo tay cho nhân vật.
3. **Gộp vật liệu** — nhiều vật liệu là nhiều draw call. Gộp về một atlas nếu
   được.
4. **Bake** — nướng ánh sáng và chi tiết vào texture (`Bake` → Diffuse /
   Normal). Web không kham nổi shader phức tạp.
5. **Đặt gốc toạ độ đúng chỗ** — chân nhân vật ở `(0,0,0)`, không phải giữa
   người. Sai chỗ này thì nhân vật lún xuống đất hoặc lơ lửng.
6. **Đặt tên các phần** — với công trình tháo lắp được, tên node trong Blender
   **chính là** `id` của bộ phận. Dùng đúng bộ từ vựng: `roof`, `towers`,
   `foundation`, `keep`, `finial`… (xem bảng ở WORLD-3D-PLAN §11).
7. **Xuất** — `File → Export → glTF 2.0 (.glb)`:
   - Format: **glTF Binary (.glb)**
   - Include: Selected Objects
   - Transform: **+Y Up** ✅ *(bỏ qua bước này là model nằm ngang)*
   - Geometry: Apply Modifiers ✅, UVs ✅, Normals ✅
   - Compression: **Draco** ✅ (giảm 5–10 lần)
   - Animation: chỉ bật khi thật sự có animation

8. **Nén texture** (tuỳ chọn, hiệu quả lớn):
   ```bash
   npx @gltf-transform/cli optimize input.glb output.glb --texture-compress ktx2
   ```
   KTX2 giảm bộ nhớ GPU 4–6 lần so với PNG/JPG.

### Nếu xuất sai chiều hay sai cỡ

Không cần sửa lại file. Điền **Transform mặc định** khi nhập asset:

```json
{ "scale": 0.01, "rotation": [-90, 0, 0], "offset": [0, 0.5, 0] }
```

- `rotation: [-90, 0, 0]` — sửa file xuất Z-up
- `scale: 0.01` — model dựng theo đơn vị cm
- `offset` — nâng model có gốc toạ độ ở giữa thân

Engine áp phần chỉnh này **trước khi đo kích thước**, nên model xoay xong mới
được chuẩn hoá cỡ. Sửa một lần, đúng ở mọi nơi dùng.

---

## 5. Sprite sheet — chỗ bộ phần mềm làm phim của anh dùng được

Nhân vật dạng model `.glb` nặng. Với máy yếu, engine có mức **sprite**: ảnh
render sẵn theo nhiều hướng, nhẹ hơn hàng chục lần mà nhìn vẫn ra hình.

Cách làm, tận dụng đúng thứ anh đã có:

1. **Blender** — đặt nhân vật ở gốc, camera orthographic, nền trong suốt.
2. Xoay nhân vật `360° / N` mỗi khung (N = 8), render ra 8 ảnh PNG.
3. **RIFE AI** — nếu muốn 16 hướng mà lười render, nội suy từ 8 lên 16.
4. **After Effects / DaVinci** — ghép 8 ảnh thành **một hàng ngang** duy nhất.
5. Nhập vào thư viện asset với `kind = sprite`, gán vào slot `sprite`, và ghi
   số hướng vào ô Transform:
   ```json
   { "scale": 1 }
   ```
   rồi đặt `sprite_dirs` ở phần nâng cao của mục thư viện.

Engine cắt đúng cột theo hướng nhân vật đang đi.

---

## 6. Nhập hàng loạt

Làm xong một đợt trong Blender thì đừng nhập từng cái. Đẩy hết file lên R2
(rclone, Cloudflare dashboard, hay script), rồi dán manifest vào nút
**📦 Nhập hàng loạt**:

```json
[
  {
    "slug": "kiem-bac-annam",
    "name": "Kiếm bạc Annam",
    "kind": "model",
    "file_url": "https://assets.selorson.com/world/assets/kiem-bac.glb",
    "file_format": "glb",
    "license": "own",
    "tags": ["vũ khí", "kiếm", "annamland"],
    "transform": { "scale": 1, "rotation": [0, 0, 0] }
  },
  {
    "slug": "aria-head-chibi",
    "name": "Aria — đầu chibi",
    "kind": "model",
    "file_url": "https://assets.selorson.com/world/assets/aria-head.glb",
    "license": "own",
    "tags": ["nhân vật", "chibi", "đầu"]
  }
]
```

**Slug đã tồn tại sẽ được cập nhật, không nhân bản.** Nên xuất lại vài model
rồi nhập lại nguyên manifest là an toàn — đúng với cách anh sẽ làm việc theo
tháng năm.

---

## 7. Thứ tự nên làm

Đừng dựng cả thế giới bằng model tự làm ngay. Thứ tự đỡ nản nhất:

1. **Bây giờ** — không cần asset nào. Bộ dựng kit-bash đã lo mọi địa điểm.
2. **Tuần đầu** — tải một bộ Quaternius (CC0), nhập hàng loạt, gán vào vài vật
   phẩm và nhân vật. Thấy thế giới có hình ngay mà chưa tốn công vẽ.
3. **Sau đó** — làm **đầu/bán thân** cho 3–5 nhân vật chính trước. Đây là thứ
   thay đổi cảm giác nhiều nhất so với công sức bỏ ra, vì marker trên bản đồ là
   thứ độc giả nhìn nhiều nhất.
4. **Dần dần** — thay từng địa điểm chủ lực bằng model riêng. Kit-bash lo phần
   còn lại, và nó không bao giờ "hỏng" — chỉ là chưa được nâng cấp.

Cách này giữ cho thế giới **luôn chạy được ở mọi thời điểm**, thay vì phải đợi
đủ asset mới bật lên được.
