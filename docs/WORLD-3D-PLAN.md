# Thế Giới 3D Selorson — Phương án triển khai

> Nhánh làm việc: `feature/world-3d` (frontend-v3 + backend-v3)
> Ngày lập: 03/08/2026
> Mục tiêu: biến mục **Thư viện** (`/library`) từ danh sách thẻ tĩnh thành một
> thế giới 3D khám phá được — nhiều bản đồ, mỗi địa điểm gắn với truyền thuyết /
> nhân vật, có hành trình nhân vật (story map), có tháo lắp công trình, và có
> chế độ đi bộ góc nhìn thứ nhất.

---

## 1. Kết luận trước — phương án đề xuất

Xây **một thế giới 4 tầng độ sâu**, dữ liệu lấy thẳng từ bảng `library_items`
đã có, dựng bằng **Threlte 8 + Three.js**, và gắn với một cơ chế sản phẩm quan
trọng: **thế giới mở khoá dần theo tiến độ đọc truyện của độc giả**.

Ba lý do chọn hướng này:

1. **Không phải làm lại dữ liệu.** Bảng `library_items` đã có sẵn `category`
   (location / main_character / side_character / item / lore), `coordinates`,
   `terrain`, `extra_data` (JSONB). Bảng `chapter_library_entry` đã nối
   chương ↔ địa điểm/nhân vật kèm `role`. Bảng `library_item_links` đã là một
   đồ thị quan hệ. Nói cách khác: **story map và mối liên hệ địa điểm–truyền
   thuyết gần như đã nằm sẵn trong DB**, chỉ thiếu lớp hiển thị.
2. **Không phải làm lại art nền.** Bản đồ Akunalia 4096×4096 đã có, và
   `chaldeas-fgo-demo/` đã chứa bản **equirectangular 2048×1024 + bump
   4096×2048 + clouds** — tức là khâu chiếu bản đồ lên quả cầu đã xong.
3. **Ba repo mẫu bổ sung nhau chứ không trùng nhau**, mỗi cái phụ trách đúng
   một tầng (xem §3).

Một quan sát quan trọng: **các lục địa của Akunalia chính là hình dạng lục địa
Trái Đất được vẽ lại** (Canaland ≈ Canada, Meriland ≈ Mỹ, Mexiland ≈ Mexico,
Rusland ≈ Nga, Chinland ≈ Trung Quốc, Afriland ≈ châu Phi, Ausland ≈ Úc,
Italand/Scandiland ≈ châu Âu, Annamland ≈ Đông Dương). Hệ quả: **ranh giới
vùng đất có thể lấy từ GeoJSON thế giới có sẵn rồi đổi tên**, đúng kỹ thuật của
`vietnam-3d-map`. Tiết kiệm hàng trăm giờ vẽ tay. Chỉ Skyland, Dragonland,
Devilland và Sindark là phải dựng thủ công vì chúng là vùng đất bay / hư cấu
thuần.

---

## 2. Ý tưởng cốt lõi: thế giới là phần thưởng của việc đọc

Đây là điểm tôi đề xuất thêm, không có trong tư liệu gốc, và tôi cho là quan
trọng nhất:

**Một bản đồ phơi bày toàn bộ thế giới sẽ spoil truyện.** Nếu độc giả chưa đọc
tới Sindark mà đã thấy lâu đài đen và đọc được mô tả "hiện thân của bóng tối bất
diệt", cảm giác khám phá khi đọc tới chương đó bị giết chết.

Đề xuất: dùng bảng `user_chapters` (tiến độ đọc đã có sẵn) để quyết định trạng
thái hiển thị từng địa điểm:

| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| `hidden` | Chưa đọc chương giới thiệu | Vùng phủ sương / giấy da trắng, không click được |
| `rumored` | Địa điểm được nhắc gián tiếp | Chấm mờ, chỉ có tên, không có mô tả |
| `revealed` | Đã đọc chương có `chapter_library_entry` | Đầy đủ mô hình 3D + lore + link chương |
| `explored` | Người dùng đã vào scene chi tiết | Có huy hiệu, tính vào % khám phá |

Lợi ích: thế giới 3D trở thành **động lực đọc tiếp** thay vì một thư viện ảnh
tách rời. Có thanh "Đã khám phá 34% Akunalia" trên hồ sơ người dùng. Khách chưa
đăng nhập xem chế độ demo (mở sẵn 3–4 vùng khởi đầu).

*Đây là quyết định sản phẩm, không phải kỹ thuật — cần anh xác nhận trước khi
tôi code, vì nó ảnh hưởng tới API và cả cách nhập liệu ở admin.*

---

## 2b. Bốn nguyên tắc bắt buộc (chốt ngày 03/08/2026)

### N1 — Không hardcode bất cứ nội dung nào

Art nhân vật và bản đồ hiện mới ở mức demo, sẽ còn nâng cấp nhiều lần. Vì vậy
**mọi thứ nhìn thấy được trong thế giới 3D đều phải đến từ DB hoặc manifest**,
thay được mà không cần sửa code, không cần deploy lại:

- Mô hình, texture, ảnh nhân vật → URL trên R2, ghi trong `extra_data.world`.
  Đổi art = sửa một dòng trong admin, không đụng code.
- Toạ độ, độ cao, màu vùng, tên vùng → DB.
- Ranh giới vùng → file GeoJSON tải lúc chạy (`/world/regions.geojson` trên R2),
  không nhúng vào bundle. Vẽ lại bản đồ = thay file.
- Trong code chỉ được phép hardcode **hành vi** (cách camera bay, cách dựng khối
  từ tham số), tuyệt đối không hardcode **nội dung** (tên vùng, số liệu, lore).
- Asset có `?v=` theo `updated_at` để cache CDN tự vỡ khi thay art.

Cụ thể: file `akunalia-regions.ts` trong §4 **không chứa dữ liệu**, chỉ chứa
loader + kiểu dữ liệu. Danh sách vùng nằm trong DB.

### N2 — Hành trình nhân vật là tính năng hạng nhất

Không phải phần phụ của bản đồ. Độc giả chọn một nhân vật (từ `main_character`
/ `side_character` đã có trong `library_items`) và **xem họ di chuyển qua các
vùng đất theo đúng thứ tự chương**, dừng ở từng chặng, mỗi chặng mở ra: họ đã
làm gì, lore nào hé lộ, vật phẩm nào tìm được.

Dữ liệu đã có đủ: `chapter_library_entry(chapter_id, library_item_id, role)`
cho biết nhân vật X xuất hiện ở chương N cùng địa điểm Y với vai trò gì.
Sắp theo `chapters.chapter_number` là ra hành trình. Vật phẩm tìm được lấy từ
`library_item_links` (nhân vật → item, `role = "found_at"`).

**Thang độ chi tiết của hình ảnh nhân vật** — thiết kế để nâng cấp dần mà không
phải viết lại:

| Mức | Nguồn art | Hiển thị | Khi nào |
|---|---|---|---|
| 0 | không có gì | Chấm sáng + tên, có màu riêng | Mặc định, luôn chạy |
| 1 | `image_url` (đã có sẵn trong DB) | Billboard sprite luôn quay mặt về camera, có viền sáng | **Mức làm ngay ở M4** |
| 2 | `extra_data.world.sprite_sheet` | Sprite 4–8 hướng, đổi frame theo hướng di chuyển | Khi có art xoay hướng |
| 3 | `extra_data.world.model` (`.glb`) | Mô hình 3D thật, có animation đi bộ | Khi có model nhân vật |

Engine đọc trường nào có sẵn thì dùng mức cao nhất, không có thì rơi xuống mức
dưới. Nâng cấp art = điền thêm một trường trong admin, **không sửa một dòng code
nào**. Đây là lý do phải thiết kế thang này ngay từ đầu chứ không chắp vá sau.

### N3 — Thế giới có chiều cao thật

Skyland là vùng đất trên mây, phải **thật sự lơ lửng phía trên** mặt đất trong
không gian 3D, có bóng đổ xuống, có thác nước rơi xuống từ rìa đảo, nhìn từ dưới
lên thấy đáy đảo — chứ không phải một mảng phẳng dán trên bản đồ.

Thêm trường `alt` (độ cao, đơn vị bán kính hành tinh) vào `extra_data.world`:

| Vùng | `alt` | Thể hiện |
|---|---|---|
| Skyland | `+0.18` | Đảo bay trên tầng mây, thác đổ xuống, cầu ánh sáng nối xuống đất |
| Dragonland | `+0.10` | Đỉnh núi pha lê vượt tầng mây |
| Mặt đất (đa số) | `0` | Nằm trên bề mặt |
| Vực thẳm / hầm ngục | `-0.05` | Khoét xuống dưới bề mặt, nhìn thấy khi camera hạ thấp |

Ở tầng L1 marker được đặt tại `radius * (1 + alt)`; ở tầng L2 diorama của vùng
bay được dựng trên một mặt phẳng nâng cao, có cột sáng/thác nối xuống mặt đất
để mắt người đọc hiểu được quan hệ độ cao.

### N4 — Không ép điểm hạ cánh

Vào `/world` là thấy toàn cảnh quả cầu, độc giả tự chọn vùng đầu tiên. Điểm bắt
đầu của hành trình do **nhân vật** quyết định chứ không do hệ thống áp đặt.

---

## 3. Kiến trúc 4 tầng trải nghiệm

Ý tưởng "nhìn như quả địa cầu rồi đi thẳng vào bên trong bằng góc nhìn thứ nhất"
được tách thành 4 tầng, mỗi tầng là một mức thu phóng, chuyển tầng bằng camera
bay liền mạch chứ không cắt cảnh.

```
L1  QUẢ CẦU AKUNALIA          ← chaldeas-fgo-demo
    toàn thế giới, mây, khí quyển, marker vùng, cung bay hành trình
         │  click vùng → camera lao xuống
         ▼
L2  BẢN ĐỒ VÙNG (diorama)     ← vietnam-3d-map
    địa hình đùn khối, hover thì công trình low-poly mọc lên, thẻ thông tin
         │  click địa điểm → camera hạ cánh
         ▼
L3  ĐỊA ĐIỂM                  ← aircraft-assembly-demo
    3a. Xoay ngắm + THÁO LẮP (exploded view), mỗi bộ phận mang một mảnh lore
    3b. Đi bộ góc nhìn thứ nhất (pointer-lock + WASD) cho vài địa điểm chủ lực
         │
         ▼
L4  HÀNH TRÌNH NHÂN VẬT (xuyên tầng)
    chọn nhân vật → đường đi sáng dần theo thứ tự chương, dừng ở từng nút,
    click nút → nhảy thẳng vào chương tương ứng trong trình đọc
```

### Lấy gì từ từng repo mẫu

| Repo | Kỹ thuật tái sử dụng | Dùng ở tầng |
|---|---|---|
| `chaldeas-fgo-demo` | Sphere + equirect map + `bumpMap`/`displacementMap`, vỏ mây quay lệch tốc độ, shader fresnel khí quyển, `latLngToVector3`, marker vòng + cột sáng, cung great-circle nét đứt chạy, `focusOnSector` camera lerp, HUD kính mờ | L1 |
| `vietnam-3d-map` | `ExtrudeGeometry` từ ranh giới GeoJSON, hover nâng khối + đổi vật liệu, **`ensureLandmark()` dựng mô hình lazy lần đầu chạm tới**, thẻ thông tin, `flyTo` easing, chế độ tour tự động `?demo=1`, **"hành trình" chạy dọc `CatmullRomCurve3` có ga dừng** | L2, L4 |
| `aircraft-assembly-demo` | Mảng `parts` có `explodeDir`, slider tháo rời 0–100%, tháo/lắp từng bộ phận, raycast chọn bộ phận, X-ray wireframe, tiếng click tổng hợp bằng WebAudio | L3a |

### Về `scroll-world` — khuyến nghị KHÔNG dùng làm lõi

`scroll-world` sinh video AI (Seedance/Kling) rồi tua theo scroll. Nó đẹp nhưng:
tốn tiền thật cho mỗi clip (~$27 cho chuỗi 6 cảnh 1080p), **không tương tác
được** (chỉ tua tới lui một đường ống cố định), và không mở rộng nổi cho "rất
rất nhiều bản đồ".

Nhưng ý tưởng của nó có chỗ dùng tốt, ở hai nơi:
- **Prologue vào thế giới**: một đoạn bay từ vũ trụ xuống quả cầu Akunalia,
  render sẵn 1 lần, phát khi độc giả bấm "Bước vào thế giới". Rẻ, chỉ 1 chuỗi.
- **Fallback máy yếu**: máy không có WebGL2 / mobile cấu hình thấp thì xem
  chuỗi video + bản đồ 2D có hotspot thay vì scene 3D.

---

## 4. Stack kỹ thuật

### Thư viện 3D: Threlte 8 (khuyến nghị)

```bash
npm i three @threlte/core @threlte/extras
```

| Gói | Bản mới nhất (kiểm tra 03/08/2026) |
|---|---|
| `three` | 0.185.1 |
| `@threlte/core` | 8.5.16 — peer: `svelte >=5`, `three >=0.160` |
| `@threlte/extras` | 9.21.0 |

**Vì sao Threlte chứ không phải Three.js thuần:**
- Dự án đã **ép runes mode** trong `svelte.config.js`. Threlte 8 viết bằng runes,
  không chống nhau.
- Bài toán này là *dữ liệu đổ ra cảnh*: `{#each locations as loc}<Marker …/>{/each}`.
  Với three thuần phải tự viết vòng đời tạo/hủy/đồng bộ cho từng object khi
  danh sách thay đổi (mở khoá thêm địa điểm, đổi filter, đổi ngôn ngữ) — đây
  chính là chỗ code three thuần hay rò rỉ bộ nhớ.
- `@threlte/extras` cho sẵn: `useGltf`, `<InstancedMesh>` (rừng cây), `<HTML>`
  (thẻ lore neo vào toạ độ 3D), `<Text>`, `<Environment>`, `<Grid>`, controls.
- Đường lùi rõ ràng: Threlte không giấu Three — `<T.Mesh>` là `THREE.Mesh` thật,
  cần thì `bind:ref` rồi thao tác imperative như bình thường. Không có khoá chân.

Rủi ro cần chốt: bundle. Xử lý bằng **code-split tuyệt đối** — toàn bộ 3D nằm
sau `await import()` trong route `/world`, các trang đọc truyện / nhạc / video
không tải một byte nào của Three.

### Chỗ đặt trong app

```
src/routes/(app)/world/
├── +page.svelte                 L1 — quả cầu Akunalia
├── +page.ts                     load /api/v1/world (một request duy nhất)
├── [region]/+page.svelte        L2 — diorama vùng đất
├── [region]/[slug]/+page.svelte L3 — địa điểm (orbit / assembly / fps)
└── journey/[character]/+page.svelte  L4 — hành trình nhân vật

src/lib/world/
├── engine/       GlobeScene, RegionScene, LocationScene, FirstPersonRig
├── builders/     kitbash: castle.ts, forest.ts, volcano.ts, ruins.ts, …
├── data/         akunalia-regions.ts (GeoJSON đã đổi tên), projection.ts
├── ui/           Hud.svelte, LoreCard.svelte, ExplodeSlider.svelte, Timeline.svelte
└── quality.ts    dò thiết bị → high / medium / low / fallback-2d
```

Trang `/library` hiện tại **giữ nguyên**, thêm một nút lớn "Bước vào thế giới
Selorson" ở hero. Hai chế độ xem cùng một dữ liệu.

---

## 5. Mô hình dữ liệu — mở rộng cái đã có, không tạo bảng mới

`library_items.extra_data` là `JsonBinary` nên **không cần migration** để đọc.
Quy ước một khoá `world`:

```jsonc
// ĐỊA ĐIỂM / VÙNG ĐẤT
{
  "world": {
    "kind": "region",              // region | landmark | poi | legend
    "slug": "sindark",             // dùng cho URL /world/annamland/sindark
    "region": "annamland",         // slug vùng cha (null nếu chính nó là vùng)
    "lat": 14.2, "lng": 108.3,     // toạ độ trên quả cầu
    "alt": 0,                      // N3 — độ cao; Skyland +0.18, vực thẳm -0.05
    "terrain": "dead_forest",      // khớp builder kit-bash
    "model": "world/models/sindark-castle.glb",   // R2, bỏ trống thì dùng builder
    "scene": "assembly",           // orbit | assembly | fps
    "unlock_chapter": 34,          // null = mở sẵn
    "palette": ["#0b1a12", "#2fe36b"],
    "parts": [                     // chỉ cho scene = assembly
      { "id": "spire", "label": "Tháp nhọn", "dir": [0, 7.5, 0],
        "lore": "Kẻ nào dựng tháp này đã…", "chapter": 41 }
    ]
  }
}

// NHÂN VẬT (main_character / side_character) — N2, thang độ chi tiết
{
  "world": {
    "kind": "character",
    "color": "#2fe36b",            // màu đường hành trình, mức 0 luôn dùng được
    "sprite_sheet": null,          // mức 2 — điền sau khi có art xoay hướng
    "sprite_dirs": 8,
    "model": null,                 // mức 3 — điền sau khi có .glb
    "model_scale": 1.0,
    "anim": { "idle": "Idle", "walk": "Walk" },
    "home": "annamland"            // gợi ý vùng xuất phát, không bắt buộc
  }
}
```

Engine luôn đọc từ dưới lên: `model` → `sprite_sheet` → `image_url` → chấm sáng.
Trường nào `null` thì rơi xuống mức dưới. **Điền thêm trường = nâng cấp hình
ảnh, không đụng code** (nguyên tắc N1).

Cột `coordinates` (String) hiện có: giữ làm nguồn dự phòng dạng `"lat,lng"`,
backend đọc `extra_data.world.lat/lng` trước, rơi về `coordinates` nếu thiếu.

**Lỗ hổng phải vá ở admin:** `LibraryInput` trong
`backend-v3/src/handlers/admin_cms.rs:659` hiện chỉ nhận `name`, `category`,
`description`, `image_url`, `image_ratio`, `display_order`, `is_active` —
**không nhận `coordinates`, `terrain`, `extra_data`, `story_link`**. Nghĩa là
hiện tại không có đường nào để admin nhập toạ độ. Phải mở rộng struct này và
form admin tương ứng (kèm một widget chọn điểm trên bản đồ cho đỡ phải gõ số).

### API mới

| Endpoint | Việc |
|---|---|
| `GET /api/v1/world` | Toàn bộ vùng + địa điểm + link + trạng thái mở khoá của user hiện tại. **Một request**, không N+1. Cache Redis theo `user_id` bucket (đã có `cache::invalidate_prefix`). |
| `GET /api/v1/world/regions/{slug}` | Chi tiết một vùng + danh sách POI + lore |
| `GET /api/v1/world/journey/{character_id}` | Hành trình: `chapter_library_entry` join `chapters` sắp theo `number`, trả mảng nút có `lat/lng/chapter/role` |
| `GET /api/v1/world/progress` | % khám phá của user (cho hồ sơ) |
| `POST /api/v1/world/visited` | Đánh dấu đã vào scene (đổi `revealed` → `explored`) |

Tất cả đọc từ bảng có sẵn — chỉ `world/visited` cần bảng mới nhỏ
(`user_world_visits`: user_id, library_item_id, visited_at).

---

## 6. Pipeline asset & ngân sách hiệu năng

Chuẩn kỹ thuật 2026 cho web 3D (đã tra cứu lại): glTF 2.0 + **Draco hoặc
Meshopt** cho hình học, **KTX2/BasisU** cho texture (giảm 4–6× VRAM),
**instancing + LOD**, mục tiêu **<100 draw call trên desktop, <50 trên mobile**.

Việc cần làm với asset hiện có:

| Asset | Hiện tại | Sau xử lý |
|---|---|---|
| `custom-map-hd.png` | **15.7 MB** PNG 4096×2048 | KTX2 ~1.5 MB (hoặc WebP ~2 MB) |
| `custom-map-equirectangular.png` | 4.0 MB 2048×1024 | KTX2 ~0.4 MB |
| `custom-map-bump.png` | 2.4 MB 4096×2048 | KTX2 1 kênh ~0.6 MB |
| Akunalia 4096×4096 (bản đồ giấy) | 1.7 MB JPG | tile theo mức zoom cho chế độ 2D |

**Chỗ lưu**: Cloudflare Pages chặn file >25 MiB (chính README của
`vietnam-3d-map` cảnh báo điều này). Selorson **đã có Cloudflare R2** đang dùng
cho audio → đưa toàn bộ `*.glb`, `*.ktx2` lên R2, phục vụ qua CDN, chỉ để
manifest JSON trong bundle.

**Dựng mô hình 3D — đây mới là nút thắt thật sự, không phải code.** 40+ địa điểm
mà mỗi cái vẽ tay là bất khả thi. Cách `vietnam-3d-map` giải: 34 địa danh dựng
bằng khối cơ bản (box/cone/cylinder/sphere) trong một file 39 KB. Đề xuất làm
tương tự nhưng có tham số hoá:

- 8 **builder kit-bash**: `castle`, `forest`, `dead_forest`, `ruins`, `volcano`,
  `ice_peak`, `floating_isle`, `harbor`.
- Mỗi builder nhận `(seed = item.id, palette, scale, terrain)` → sinh biến thể
  khác nhau. Cùng builder `castle` nhưng seed khác cho ra lâu đài khác.
- Chỉ **5–8 địa điểm chủ lực** (Sindark, Skyland, Annamland thủ phủ, Devilland…)
  mới dựng mô hình `.glb` chăm chút riêng.
- Cây cối / cột đá dùng `InstancedMesh` — một draw call cho cả rừng.

---

## 7. Lộ trình — 5 mốc, mỗi mốc chạy được

| Mốc | Nội dung | Kết quả nhìn thấy được |
|---|---|---|
| **M1 — Nền** | Cài Threlte, route `/world`, quality detector, API `GET /world`, mở `LibraryInput` cho `coordinates`/`extra_data`, form admin nhập toạ độ | Quả cầu Akunalia quay được, marker đúng chỗ, click ra thẻ lore từ DB thật |
| **M2 — Vùng đất** | GeoJSON thế giới đổi tên → vùng Akunalia, `RegionScene` đùn khối, hover mọc công trình, 8 builder kit-bash, camera bay L1↔L2 | Bấm vào Annamland → bay xuống, rê chuột thấy công trình mọc lên |
| **M3 — Địa điểm & tháo lắp** | `LocationScene`, cơ chế exploded view, mỗi bộ phận gắn mảnh lore + link chương, X-ray, âm thanh | Vào lâu đài Sindark, kéo slider tháo rời, mỗi tầng kể một đoạn truyền thuyết |
| **M4 — Hành trình nhân vật** *(tính năng hạng nhất, N2)* | `GET /world/journey`, thang độ chi tiết nhân vật mức 0→1 (billboard từ `image_url`), timeline scrubber theo chương, nhân vật đi dọc đường bay, mỗi chặng mở lore + vật phẩm tìm được, gắn `user_chapters` vào trạng thái hidden/rumored/revealed | Chọn nhân vật → xem họ đi qua từng vùng theo thứ tự chương, dừng ở mỗi chặng kể chuyện; vùng chưa đọc phủ sương |
| **M5 — Góc nhìn thứ nhất & hoàn thiện** | Pointer-lock + WASD cho 3–5 địa điểm chủ lực, tối ưu KTX2/Draco, fallback 2D, i18n (Paraglide), kiểm tra Capacitor + Tauri | Đi bộ trong rừng chết Sindark; chạy mượt trên điện thoại |

Sau mỗi mốc: merge `feature/world-3d` → `qa` để anh test, ổn thì → `dev`, ổn hết
mới → `main`.

---

## 8. Rủi ro và cách xử lý

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Bundle 3D làm chậm toàn site | Cao | Code-split tuyệt đối sau `import()`, route `/world` riêng; đo lại Lighthouse trang chủ trước/sau |
| Không đủ mô hình 3D cho 40+ địa điểm | Cao | Builder kit-bash tham số hoá (§6); chỉ 5–8 địa điểm dựng `.glb` riêng |
| Mobile/Capacitor giật, nóng máy | Trung bình | Quality tier tự dò; mobile giới hạn 50 draw call, tắt bóng đổ, texture 1K; có nút "chế độ 2D" |
| Spoil truyện | Trung bình | Cơ chế mở khoá theo tiến độ đọc (§2) |
| SEO — nội dung thư viện nằm trong WebGL, bot không đọc được | Trung bình | Giữ `/library` HTML hiện tại làm bản chính thức cho SEO; `/world` là lớp trải nghiệm, có `<noscript>` trỏ về `/library` |
| Ranh giới vùng đất suy ra từ GeoJSON không khớp ý tác giả | Thấp | Bảng ánh xạ vùng ↔ quốc gia để anh sửa; vùng hư cấu (Skyland, Dragonland) dựng tay |
| Threlte là phụ thuộc bên thứ ba | Thấp | `<T>` bọc mỏng quanh Three thật; nếu cần bỏ, phần engine viết tách khỏi component Svelte |

---

## 9. Quyết định đã chốt (03/08/2026)

| # | Quyết định | Chốt |
|---|---|---|
| 1 | Mở khoá thế giới theo tiến độ đọc (§2) | ✅ Có làm |
| 2 | Ranh giới vùng đất | ✅ Lấy GeoJSON Trái Đất rồi đổi tên; Skyland/Dragonland/Devilland dựng tay |
| 3 | Phạm vi mốc đầu | ✅ M1 + M2 rồi dừng để xem |
| 4 | Điểm hạ cánh mặc định | ✅ Không ép — vào là thấy toàn cảnh quả cầu (N4) |
| 5 | Hành trình nhân vật | ✅ Tính năng hạng nhất, thiết kế thang độ chi tiết ngay từ đầu (N2) |
| 6 | Kiến trúc nội dung | ✅ Không hardcode, thay art không cần deploy (N1) |
| 7 | Skyland | ✅ Lơ lửng thật trong không gian 3D, có độ cao `alt` (N3) |

**Còn để ngỏ, sẽ chốt khi có dữ liệu thật:**
- Danh sách vùng chính thức. Đọc được từ art Akunalia: Devilland, Dragonland,
  Skyland, Canaland, Meriland, Mexiland, Italand, Scandiland, Rusland, Chinland,
  Afriland, Ausland, Kalaursesent, Annamland, Sindark. Vì theo N1 danh sách này
  nằm trong DB chứ không trong code, bổ sung/đổi tên về sau không tốn công.
- Bảng ánh xạ vùng ↔ quốc gia GeoJSON — sẽ nhập được từ màn admin, sửa tự do.

---

## 10. Trạng thái triển khai — M1 + M2

Nhánh `feature/world-3d` trên cả hai repo.

### Backend (`backend-v3`)

| File | Nội dung |
|---|---|
| `src/handlers/world.rs` *(mới)* | `GET /world`, `GET /world/regions/{slug}`, `GET /world/journey/{id}`. Trạng thái hé lộ suy ra từ `user_chapters`; chương nháp không lọt ra ngoài; 5 truy vấn cố định, không N+1. Cache Redis theo user. |
| `src/handlers/admin_cms.rs` | `LibraryInput` nhận thêm `coordinates`, `terrain`, `story_link`, `extra_data`. Dùng `Option<Option<T>>`: **khoá vắng mặt giữ nguyên giá trị cũ**, chỉ `null` tường minh mới xoá — form admin cũ không thể vô tình xoá một địa điểm khỏi bản đồ. Ghi/xoá library tự động vỡ cache thế giới. |
| `src/handlers/mod.rs`, `src/routes.rs` | Đăng ký module |

### Frontend (`frontend-v3`)

| File | Nội dung |
|---|---|
| `src/lib/world/types.ts` | Kiểu dữ liệu, không chứa nội dung |
| `src/lib/world/config.ts` | `PUBLIC_WORLD_ASSET_BASE`, `assetUrl()` có `?v=` chống cache CDN |
| `src/lib/world/quality.ts` | 4 tầng high/medium/low/none; `?q=` ép tầng để test |
| `src/lib/world/projection.ts` | lat/lng/alt → không gian 3D, cung great-circle, chiếu vùng phẳng |
| `src/lib/world/avatar.ts` | **Thang độ chi tiết nhân vật** (N2): model → sprite → billboard → chấm, có `degrade()` khi asset lỗi |
| `src/lib/world/terrains.ts` | Danh sách địa hình, không phụ thuộc Three (để form admin không kéo 3D vào bundle) |
| `src/lib/world/builders/` | 8 builder kit-bash + `Kit` gộp hình học theo vật liệu (30 khối → 3–4 draw call), PRNG có seed nên cùng địa điểm luôn giống nhau |
| `src/lib/world/engine/` | `WorldCanvas`/`RegionCanvas` (ranh giới dynamic import), `GlobeScene`, `RegionScene`, `Planet`, `Marker`, `Landmark`, `textures` |
| `src/lib/world/ui/` | `WorldHud`, `RegionHud` — DOM thật đè lên canvas, dịch được, chọn được |
| `src/routes/(app)/world/` | `/world` (quả cầu), `/world/[region]` (vùng đất) |
| `src/lib/components/admin/WorldPlacementFields.svelte` | Form nhập toạ độ/độ cao/địa hình + ô JSON nâng cao **giữ nguyên mọi khoá lạ khi lưu** |
| `static/world/` | Texture (22,5 MB PNG → **4,2 MB JPG**), `regions.geojson` rỗng, README |
| `messages/{vi,en}.json` | 25 khoá `world_*` |

### Kiểm tra đã chạy

- `cargo check` — sạch
- `npm run check` (svelte-check) — **0 lỗi, 0 cảnh báo / 2948 file**
- `npm run build` — thành công. **Code-split đã đạt mục tiêu**: Three.js nằm
  trọn trong một chunk riêng 783 KB, entry chính vẫn **13,7 KB** — trang đọc
  truyện / nhạc / video không tải một byte 3D nào.

- **Chạy thật** (backend `cargo run` + `vite dev`, mở `/world` trong trình duyệt):
  - `GET /api/v1/world` → **200**, handler mới trả dữ liệu
  - Canvas Threlte **mount thành công**, WebGL 2.0
  - Thứ tự request xác nhận **dynamic import chạy đúng**: `WorldCanvas.svelte`
    chỉ được tải **sau khi** API trả về, không nằm trong bundle ban đầu
  - Tầng `high` tải đúng 3 texture (`color-4k`, `bump-2k`, `clouds-2k`) → **200**
  - **Không có lỗi console nào**
  - `/world/annamland` (vùng chưa tồn tại) → thông báo "Không tìm thấy vùng đất
    này", không crash

**Chưa xác minh được**: hình ảnh render cuối cùng. Trình duyệt trong phiên làm
việc chạy ẩn nên không compositing frame — `requestAnimationFrame` không chạy,
không đọc được pixel và không chụp được màn hình. Toàn bộ chuỗi khởi tạo đã
được xác nhận (canvas + WebGL + texture tải đủ + không lỗi), nhưng **chưa ai
nhìn thấy quả cầu bằng mắt**. Cần anh mở `/world` để xác nhận cuối cùng.

Cũng chưa có mục thư viện nào có toạ độ nên chưa thấy marker thật — xem §11.

**Ghi nhận về kích thước deploy**: `@threlte/extras` chỉ xuất một entry duy
nhất (không có subpath export), nên bản build sinh kèm các chunk
`draco_decoder` / `basis_transcoder` (~800 KB). Chúng là chunk rời, **trình
duyệt không bao giờ tải** vì chưa có đường code nào chạm tới — chỉ tốn dung
lượng deploy. Xử lý gọn ở M5 khi làm KTX2/Draco thật.

---

## 11. Cách xem thử

```bash
cd E:\Selorson\backend-v3 && cargo run
```

```bash
cd E:\Selorson\frontend-v3 && npm run dev
```

Vào `/admin/library`, sửa một mục bất kỳ, mở khối **🌍 Vị trí trên bản đồ 3D**:

| Ví dụ | Loại nút | Slug | Thuộc vùng | lat | lng | alt | Địa hình |
|---|---|---|---|---|---|---|---|
| Annamland | `region` | `annamland` | — | 14.2 | 108.3 | 0 | — |
| Rừng chết Sindark | `landmark` | `sindark` | `annamland` | 22.1 | 105.4 | 0 | Rừng chết |
| Skyland | `region` | `skyland` | — | 30.0 | 10.0 | **0.18** | Đảo bay |

Rồi mở `/library` → **Bước vào thế giới 3D**, hoặc vào thẳng `/world`.
Thêm `?q=low` để thử ngân sách máy yếu, `?q=none` để thử đường dự phòng 2D.

Skyland với `alt = 0.18` phải hiện **lơ lửng phía trên** bề mặt, có dây neo kéo
xuống mặt đất — đó là cách kiểm tra nhanh nguyên tắc N3 đã chạy đúng.

### Chưa làm trong M1+M2 (đúng phạm vi đã chốt)

- Tầng L3 tháo lắp công trình → M3
- Hành trình nhân vật dựng hình → M4 (API `/world/journey` đã sẵn sàng)
- Trạng thái `explored` + bảng `user_world_visits` → M4
- KTX2/Draco, đi bộ góc nhìn thứ nhất → M5
- `regions.geojson` còn rỗng: cảnh vùng đất chạy ở chế độ nền đĩa tròn

---

## Phụ lục — tra cứu

- Threlte: https://threlte.xyz — `@threlte/core` 8.5.16, `@threlte/extras` 9.21.0
- glTF Transform (nén Draco/Meshopt/KTX2): https://gltf-transform.dev/
- Mẫu tham chiếu trong máy:
  - `D:\github\vietnam-3d-map` — `main.js`, `landmarks.js`, `province-shapes.js`
  - `E:\Selorson\chaldeas-fgo-demo\index.html`
  - `E:\Selorson\aircraft-assembly-demo\index.html`
  - `D:\app\public\notifications\{2..6}` — art bản đồ + mô tả vùng
