# Tự làm nhân vật và đưa vào thế giới

> Kèm theo: [ASSET-PIPELINE.md](ASSET-PIPELINE.md)
> Dành cho: Blender + Illustrator, không dùng Houdini Apprentice
> Cập nhật: 03/08/2026

---

## 0. Đọc cái này trước khi mở Blender

**Đừng làm mô hình 3D cho cái đầu ngay.**

Marker nhân vật trên quả cầu được vẽ ở cỡ vài chục pixel. Ở cỡ đó, **một tấm
ảnh render quay mặt về camera nhìn gần như không khác gì hình học thật** — mà rẻ
hơn hàng chục lần cả về dung lượng lẫn công sức.

Hệ thống đã được sửa để chấp nhận điều này: slot `head` và `body` **nhận cả mô
hình lẫn ảnh**. Engine tự nhìn định dạng file mà quyết định vẽ kiểu nào. Nghĩa
là anh bắt đầu bằng ảnh render, sau này thay bằng `.glb` mà **không phải sửa gì
khác**.

Lộ trình đỡ nản nhất:

| Giai đoạn | Làm gì | Thời gian một nhân vật |
|---|---|---|
| **1** | Render một tấm bán thân từ Blender → dùng cho slot `head` | ~30 phút |
| **2** | Render 8 hướng toàn thân → sprite sheet cho slot `sprite` | ~1 giờ |
| **3** | Mô hình `.glb` toàn thân cho slot `body` | vài ngày |

Giai đoạn 3 chỉ đáng làm cho **nhân vật chính**, và chỉ khi anh muốn họ đi lại
mượt trên hành trình. Đừng làm cho cả 30 nhân vật.

---

## 1. Không cần nặn từ số không

Nặn nhân vật từ khối cầu là cách chậm nhất. Ba đường vào nhanh hơn, hợp pháp,
và cho ra kết quả đồng nhất hơn:

### Đường A — sửa từ base mesh CC0 *(khuyên dùng)*

Tải một nhân vật [Quaternius](https://quaternius.com) (CC0), mở trong Blender,
rồi **sửa thành nhân vật của anh**: đổi tỉ lệ đầu/thân, sửa tóc, đổi trang phục,
đổi màu.

Vì sao đây là đường tốt nhất cho anh:
- CC0 nên **sửa thoải mái, không phải ghi công, dùng thương mại được**
- Đã có sẵn **rig và animation đi/đứng** — thứ mất nhiều thời gian nhất
- Topology đã sạch và nhẹ, không phải retopo
- Các nhân vật cùng gốc sẽ **đồng nhất phong cách** — điều rất khó đạt khi nặn tay từng người

### Đường B — dựng khối cơ bản (chibi)

Nếu anh muốn phong cách chibi: nhân vật chibi chỉ là **vài khối cầu và trụ**.
Đầu to, thân nhỏ, tay chân đơn giản. Dựng bằng `Mirror` modifier + `Subdivision`
là ra. Không cần sculpt.

Đây là đường hợp nhất nếu anh muốn phong cách riêng mà không muốn học sculpt.

### Đường C — MetaHuman rồi giảm poly

Chỉ dùng khi cần nhân vật tả thực. MetaHuman (miễn phí, dùng được ngoài Unreal)
cho ra người rất đẹp nhưng **quá nặng cho web** — phải qua Blender giảm poly
mạnh, và kết quả thường lệch phong cách với phần còn lại của thế giới.

Tôi không khuyên đường này cho Selorson.

---

## 2. Giai đoạn 1 — ảnh bán thân cho slot `head`

Đây là thứ đáng làm đầu tiên, vì marker trên bản đồ là thứ độc giả nhìn nhiều
nhất.

### Trong Blender

1. Mở nhân vật (từ đường A hoặc B).
2. Ẩn phần thân dưới, chỉ để lại **đầu + vai**.
3. Camera:
   - Chọn camera → `Object Data Properties` → Type = **Orthographic**
   - Đặt chính diện, hơi chếch xuống ~10° cho có chiều sâu
4. Ánh sáng: một `Area` light chếch trái trên, một `Area` yếu chếch phải làm
   sáng viền. Đừng dùng HDRI phức tạp — nền phải trong suốt.
5. Nền trong suốt:
   - `Render Properties` → `Film` → **Transparent** ✅
6. Đầu ra:
   - `Output Properties` → Resolution **512 × 512**
   - `Output` → File Format = **PNG**, Color = **RGBA**
7. `Render → Render Image` → `Image → Save As` → `aria-head.png`

### Đưa vào hệ thống

1. **Admin → Thư Viện → 🧰 Asset 3D → + Thêm asset**
2. **📤 Tải file lên** → chọn `aria-head.png`
3. Điền:
   - Tên: `Aria — bán thân`
   - Loại: **Biểu tượng 2D**
   - Giấy phép: **Tự làm** *(hoặc **CC-BY** nếu anh sửa từ asset CC-BY)*
   - Thẻ: `nhân vật, bán thân, aria`
4. **Thêm**

### Gán vào nhân vật

1. **Admin → 🌍 World Studio**
2. Chọn Aria ở danh sách trái
3. Panel phải → khối **Asset 3D** → slot **Đầu / bán thân** → **+ Chọn asset**
4. Chọn `Aria — bán thân`
5. Bấm **👁 Xem 3D** để kiểm tra ngay
6. **Publish** khi ưng

Xong. Aria đã có mặt trên bản đồ.

---

## 3. Giai đoạn 2 — sprite 8 hướng cho slot `sprite`

Dùng khi anh muốn nhân vật đi trên hành trình mà chưa muốn làm mô hình.

1. Nhân vật đứng ở gốc toạ độ `(0,0,0)`, camera orthographic chếch xuống ~30°.
2. Xoay **nhân vật** (không xoay camera) `45°` mỗi lần, render 8 lần:
   `0° 45° 90° 135° 180° 225° 270° 315°`
   - Mẹo: đặt keyframe xoay 360° trong 8 frame rồi `Render Animation`
3. Ghép 8 ảnh thành **một hàng ngang** trong After Effects hoặc DaVinci.
   - Kết quả: một PNG rộng `8 × 256 = 2048`, cao `256`
4. Nhập với **Loại = Sprite sheet**, gán vào slot **Sprite nhiều hướng**
5. Ở panel Inspector, phần nâng cao của mục thư viện, đặt `sprite_dirs: 8`

Engine cắt đúng cột theo hướng nhân vật đang đi.

> Nếu lười render 8 lần: render 4 hướng rồi dùng **RIFE AI** nội suy lên 8.

---

## 4. Giai đoạn 3 — mô hình `.glb` cho slot `body`

Chỉ làm cho nhân vật chính.

### Ngân sách

| Hạng mục | Giới hạn |
|---|---|
| Tam giác | **< 15.000** |
| Texture | **1024 × 1024**, tối đa 2 tấm |
| Vật liệu | **≤ 3** — mỗi vật liệu là một draw call |
| File `.glb` | **< 2 MB** |

### Chuẩn bị trước khi xuất

1. **Gốc toạ độ ở giữa hai bàn chân**, không phải giữa người.
   `Object → Set Origin → Origin to 3D Cursor` sau khi đặt con trỏ 3D xuống sàn.
   *Sai chỗ này là nhân vật lún xuống đất hoặc lơ lửng.*
2. **Nhân vật nhìn về hướng −Y** trong Blender (mặc định của glTF là nhìn về +Z
   sau khi đổi trục).
3. **Áp hết modifier**: `Ctrl+A → Visual Geometry to Mesh` hoặc bật *Apply
   Modifiers* lúc xuất.
4. **Gộp vật liệu**: nhiều vật liệu là nhiều draw call. Nếu được, gộp về một
   texture atlas.
5. **Bake ánh sáng** vào texture nếu dùng shader phức tạp — web không kham nổi
   node tree của Blender.
6. **Xoá rig nếu không cần animation.** Armature làm file nặng lên đáng kể mà
   nhân vật đứng yên thì chẳng dùng tới.

### Xuất

`File → Export → glTF 2.0 (.glb)`

| Mục | Đặt |
|---|---|
| Format | **glTF Binary (.glb)** |
| Include | Selected Objects ✅ |
| Transform | **+Y Up** ✅ *(bỏ qua là model nằm ngang)* |
| Geometry | Apply Modifiers ✅ · UVs ✅ · Normals ✅ |
| Compression | **Draco** ✅ |
| Animation | chỉ bật khi thật sự có |

### Nén thêm (đáng làm)

```bash
npx @gltf-transform/cli optimize aria.glb aria-web.glb --texture-compress ktx2
```

Giảm bộ nhớ GPU 4–6 lần. Chạy được ngay, không cần cài gì trước.

### Nhập

Giống §2 nhưng **Loại = Mô hình 3D (.glb)**, gán vào slot **Toàn thân**.

---

## 5. Khi model vào rồi mà nhìn sai

**Đừng sửa lại file Blender.** Điền ô **Transform mặc định** lúc nhập asset —
engine áp phần chỉnh này *trước khi* đo kích thước, nên sửa một lần là đúng ở
mọi nơi dùng.

| Triệu chứng | Sửa |
|---|---|
| Model **nằm ngang** | `{ "rotation": [-90, 0, 0] }` — quên bật +Y Up lúc xuất |
| Model **to/nhỏ quá đáng** | `{ "scale": 0.01 }` — dựng theo đơn vị cm |
| Model **lún xuống đất** | `{ "offset": [0, 0.9, 0] }` — gốc toạ độ ở giữa người |
| Model **quay lưng lại** | `{ "rotation": [0, 180, 0] }` |
| Model **đen thui** | Chưa bake, hoặc dùng shader web không hiểu — bake lại thành texture |
| Texture **mất trắng** | Xuất `.gltf` thay vì `.glb` — `.glb` nhúng texture vào trong |

Kết hợp được, ví dụ vừa xoay vừa nâng:

```json
{ "rotation": [-90, 0, 0], "scale": 0.01, "offset": [0, 0.9, 0] }
```

---

## 6. Illustrator dùng vào việc gì

Illustrator không làm được nhân vật, nhưng làm rất tốt hai thứ:

- **Biểu tượng phẳng** (slot `icon`): vẽ vector → xuất PNG 256×256 nền trong
  suốt → nhập với Loại = Biểu tượng 2D.
- **Huy hiệu, phù văn, hoa văn nổi**: vẽ vector → lưu **SVG** → Blender
  `File → Import → Scalable Vector Graphics` → `Extrude` trong `Object Data
  Properties → Geometry`. Ra khối 3D nổi trong vài phút, không cần model gì cả.

Cách thứ hai rất hợp làm **ấn triện, biểu tượng vùng đất, chữ khắc trên đá**
trong thế giới của anh.

---

## 7. Thứ tự tôi khuyên cho 5 nhân vật đầu tiên

1. Chọn **1 nhân vật chính**. Làm §2 (ảnh bán thân). Gán, publish, nhìn thử.
2. Nếu ưng phong cách → làm §2 cho **4 nhân vật còn lại**. Nửa ngày là xong cả 5.
3. Chỉ khi cả 5 đã lên bản đồ và trông đồng nhất, mới bắt đầu §4 cho nhân vật
   chính nhất.

Lý do: phong cách sai thì sai ở cả 5, và phát hiện sớm ở tấm ảnh 30 phút rẻ hơn
nhiều so với phát hiện sau khi đã nặn xong một mô hình.
