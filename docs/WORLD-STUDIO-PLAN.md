# World Studio — Xưởng thiết kế thế giới trực quan

> Nhánh: `feature/world-studio` (sẽ cắt từ `feature/world-3d`)
> Ngày lập: 03/08/2026
> Mục tiêu: thay việc gõ JSON trong form bằng việc **vẽ** thế giới — chấm toạ độ,
> kéo ranh giới, nối dây quan hệ — với bản nháp riêng cho tác giả và bản đã
> publish cho độc giả.

---

## 1. Kết luận trước

Xây **một xưởng ba khung nhìn dùng chung một tài liệu**, đặt tại
`/admin/world-studio`:

| Khung | Làm gì | Sinh ra dữ liệu gì |
|---|---|---|
| **Bản đồ** | Chấm điểm, kéo điểm, vẽ đa giác ranh giới, chỉnh độ cao | `lat/lng/alt`, ranh giới vùng |
| **Đồ thị** | Nối node bằng dây có cổng vào/ra | Quan hệ nhân vật ↔ vật phẩm ↔ địa điểm ↔ lore ↔ chương |
| **Xem trước 3D** | Dựng ngay thế giới từ bản nháp | Kiểm chứng bằng mắt |

Chọn một node ở bất kỳ khung nào thì **cả ba khung cùng sáng lên**, camera 3D bay
tới. Đó chính là chỗ "trực quan" mà anh muốn.

Ba quyết định nền tảng:

1. **Một canvas, hai chế độ — không phải hai thư viện.** Cả bản đồ lẫn đồ thị đều
   chạy trên [Svelte Flow](https://svelteflow.dev). Chế độ *Bản đồ* khoá vị trí
   node theo toạ độ địa lý và bật lớp đa giác; chế độ *Đồ thị* thả tự do vị trí
   và bật dây nối. Kéo/thu phóng/chọn nhiều/undo dùng chung.
2. **Tài liệu phiên bản, không phải cột nháp.** Toàn bộ bố cục thế giới nằm trong
   một tài liệu JSONB có bản nháp và các bản đã publish. "Publish" là một hành
   động cho **cả thế giới cùng lúc**, đúng như cách anh mô tả.
3. **Ranh giới quốc gia được vẽ ở đây.** Đây là lời giải cho vấn đề
   `regions.geojson` đang rỗng — không cần mượn hình lục địa Trái Đất, cũng không
   cần phần mềm GIS. Vẽ xong là dùng được ngay.

---

## 2. Vì sao một canvas hai chế độ, chứ không phải hai canvas

Bản đồ và đồ thị là hai kiểu thao tác khác nhau: một bên là **biên tập vector**
(thêm đỉnh, kéo đỉnh, đóng vòng), một bên là **nối cổng**. Ép cả hai vào cùng một
lối tương tác thì hỏng cả hai.

Nhưng chúng chia sẻ quá nhiều thứ để tách rời: cùng tập node, cùng lựa chọn, cùng
thao tác kéo–thu phóng–undo. Viết hai canvas là viết hai lần những thứ đó.

Giải pháp: **cùng một viewport, đổi lớp phủ.**

- Svelte Flow không tự quyết vị trí node — vị trí là dữ liệu mình sở hữu. Ở chế
  độ Bản đồ, mình chiếu `lat/lng` thành pixel; kéo node xong thì chiếu ngược lại
  ra `lat/lng`. Ở chế độ Đồ thị, vị trí là bố cục tự do lưu riêng.
- Đa giác ranh giới vẽ bằng SVG trong `<ViewportPortal>` — thành phần Svelte Flow
  cung cấp sẵn để đặt nội dung **bên trong** hệ toạ độ đã biến đổi. Đa giác tự
  bám theo khi kéo và thu phóng, không phải tự đồng bộ ma trận.

Cùng lý do đó, bản đồ Akunalia 4096×4096 làm nền cũng nằm trong viewport portal.

**Vì sao Svelte Flow chứ không phải Svelvet:** Svelvet mới nhất (11.0.5, 02/2025)
còn khai báo peer `svelte >=3.59 || ^4` — chưa hỗ trợ Svelte 5. Svelte Flow 1.6.2
(07/2026) được **viết lại từ đầu cho Svelte 5**, toàn bộ store chuyển sang runes.
Dự án đang ép runes mode nên đây là lựa chọn duy nhất còn sống.

---

## 3. Mô hình dữ liệu — tài liệu phiên bản

### Bảng mới

```sql
CREATE TABLE world_revisions (
    id           BIGSERIAL PRIMARY KEY,
    status       VARCHAR(16) NOT NULL,      -- 'draft' | 'published'
    doc          JSONB NOT NULL,
    label        VARCHAR(255),              -- "Thêm Sindark và ranh giới Annamland"
    author_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);
```

- Đúng **một** dòng `status='draft'` — bản anh đang thiết kế.
- Nhiều dòng `status='published'`; **dòng mới nhất là thứ độc giả thấy**.
- *Publish* = chép `doc` của bản nháp thành một dòng published mới.
- *Quay lại* = chép `doc` của một bản published cũ về lại bản nháp.

Lịch sử giữ nguyên nên luôn lùi được, và không bao giờ mất bản nháp đang dở.

### Hình dạng tài liệu

```jsonc
{
  "version": 1,
  "nodes": {
    "12": {                              // khoá là library_items.id
      "lat": 14.2, "lng": 108.3, "alt": 0,
      "terrain": "forest", "scene": "orbit",
      "region": "annamland",             // vùng cha
      "parts": [ … ],                    // lore theo từng bộ phận (M3)
      "graph": { "x": 320, "y": 180 }    // vị trí ở chế độ Đồ thị
    }
  },
  "borders": {
    "annamland": {
      "rings": [ [ [108.1, 14.2], [108.9, 14.6], … ] ],   // [lng, lat]
      "color": "#2f7d32"
    }
  },
  "edges": [
    { "source": 9, "target": 20, "role": "found_at" },
    { "source": 9, "target": 134, "role": "appears" }     // 134 = chapters.id
  ]
}
```

### Cách nó sống chung với dữ liệu đang có

Không đập bỏ gì cả. Thứ tự ưu tiên khi đọc bố cục của một mục:

```
bản published mới nhất  →  extra_data.world  →  cột coordinates
```

Nghĩa là:

- Mọi thứ anh đã nhập qua form vẫn chạy y nguyên.
- Lần đầu mở xưởng, hệ thống **tự dựng bản nháp từ `extra_data.world` hiện có** —
  không phải nhập lại từ đầu.
- Form thư viện cũ vẫn dùng để sửa **nội dung** (tên, mô tả, ảnh). Xưởng lo
  **bố cục** (vị trí, ranh giới, quan hệ). Hai việc khác nhau, hai chỗ khác nhau,
  không giẫm chân.

Khi publish, `edges` được ghi ngược vào bảng `library_item_links` và
`chapter_library_entry` để các endpoint sẵn có (`/library/{id}`, hành trình nhân
vật) tiếp tục hoạt động mà không phải sửa.

### Một ràng buộc phải nới

`library_item_links` đang có `UNIQUE (source_id, target_id)` — mỗi cặp chỉ được
một liên kết. Nhưng "Aria **tìm được** đèn lồng" và "Aria **làm mất** đèn lồng"
là hai quan hệ khác nhau giữa cùng một cặp. Cần migration đổi thành
`UNIQUE (source_id, target_id, role)`.

---

## 4. Loại node và ý nghĩa sợi dây

Sáu loại node, phân biệt bằng màu và hình dạng cổng:

| Node | Nguồn | Cổng |
|---|---|---|
| 🗺️ Vùng đất | `library_items` kind=region | vào: địa điểm · ra: — |
| 📍 Địa điểm | kind=landmark/poi | vào: lore, vật phẩm · ra: thuộc vùng, xuất hiện ở chương |
| ⭐ Nhân vật | main/side_character | ra: xuất hiện ở chương, tìm được vật phẩm |
| 🔮 Vật phẩm | category=item | vào: được tìm thấy bởi |
| 📜 Truyền thuyết | category=lore | ra: gắn với địa điểm |
| 📖 Chương | `chapters` | vào: nhân vật, địa điểm |

**Ý nghĩa sợi dây suy từ cặp đầu–cuối** — anh không phải chọn loại quan hệ trong
menu, chỉ cần nối đúng cổng:

| Nối từ → đến | Nghĩa | Lưu vào |
|---|---|---|
| Nhân vật → Chương | Nhân vật xuất hiện ở chương này | `chapter_library_entry` |
| Địa điểm → Chương | Chương diễn ra ở đây | `chapter_library_entry` |
| Địa điểm → Vùng đất | Địa điểm thuộc vùng | `doc.nodes[…].region` |
| Nhân vật → Vật phẩm | Tìm được vật phẩm | `library_item_links` role=`found_at` |
| Truyền thuyết → Địa điểm | Truyền thuyết của nơi này | `library_item_links` role=`lore_of` |

**Node Chương là mấu chốt của hành trình.** Hành trình nhân vật hiện được suy ra
từ thẻ chương. Đưa chương vào đồ thị dưới dạng node có nghĩa là: nối
*nhân vật → chương ← địa điểm* chính là **vẽ ra một chặng của hành trình**. Không
cần cơ chế hành trình riêng, không có hai nguồn sự thật đá nhau.

---

## 5. Bộ công cụ trong khung Bản đồ

| Công cụ | Thao tác |
|---|---|
| **Chấm điểm** | Click lên bản đồ → tạo địa điểm mới, mở ô đặt tên ngay tại chỗ |
| **Kéo điểm** | Kéo node → cập nhật `lat/lng` |
| **Độ cao** | Chọn node → thanh trượt `alt`; Skyland kéo lên là thấy nó rời mặt đất trong khung 3D |
| **Vẽ ranh giới** | Click liên tiếp để đặt đỉnh, Enter/click đỉnh đầu để đóng vòng |
| **Sửa ranh giới** | Kéo đỉnh, double-click cạnh để chèn đỉnh, Delete để xoá đỉnh |
| **Đảo/nhiều mảnh** | Một vùng nhiều vòng — quần đảo vẽ được |
| **Nền bản đồ** | Ảnh Akunalia 4096×4096 làm nền, chỉnh độ mờ để dò theo |
| **Bắt lưới** | Bật/tắt hít vào lưới toạ độ |

Ranh giới vẽ ở đây **thay thế hoàn toàn** `static/world/regions.geojson`: khi
publish, hệ thống sinh GeoJSON từ `doc.borders`, và engine 3D đã sẵn sàng đọc nó
qua endpoint thay vì file tĩnh.

---

## 6. Lộ trình — 5 bước, mỗi bước dùng được

| Bước | Nội dung | Dùng được gì sau bước đó |
|---|---|---|
| **S1 — Nền xưởng** | Bảng `world_revisions`, API nháp/publish, route `/admin/world-studio`, canvas Svelte Flow, 6 loại node, tự dựng bản nháp từ dữ liệu hiện có | Thấy toàn bộ thư viện dưới dạng node, kéo thả, lưu nháp |
| **S2 — Bản đồ** | Chế độ Bản đồ, nền Akunalia, chấm/kéo điểm, thanh `alt` | Đặt toạ độ bằng cách click thay vì gõ số |
| **S3 — Ranh giới** | Vẽ/sửa đa giác, sinh GeoJSON khi publish, engine đọc từ API | **Vùng đất có đường bờ thật** |
| **S4 — Quan hệ** | Cổng vào/ra, dây nối, node Chương, ghi ngược khi publish | Vẽ hành trình bằng cách nối dây; khối "Tìm được" hết rỗng |
| **S5 — Xem trước & publish** | Khung 3D đọc bản nháp, nút Publish/Quay lại, lịch sử phiên bản | Bản nháp tách hẳn bản độc giả thấy |

Sau mỗi bước: `feature/world-studio` → `qa` → `dev` → `main`.

---

## 7. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Đồ thị vài trăm node thành mớ bòng bong | Cao | Lọc theo loại node; bố cục tự động bằng `@dagrejs/dagre`; chỉ hiện hàng xóm của node đang chọn |
| Xưởng và form thư viện cũ ghi đè nhau | Cao | Chia rõ: form lo **nội dung**, xưởng lo **bố cục**. Không trường nào do cả hai ghi |
| Bản nháp lệch khỏi thư viện (mục bị xoá) | Trung bình | Khi nạp, đối chiếu `doc.nodes` với `library_items`; node mồ côi hiện xám kèm nút dọn |
| Bundle admin phình | Trung bình | Svelte Flow + Threlte đều nằm sau `import()` trong route xưởng; các màn admin khác không đụng tới |
| Vẽ đa giác trên di động | Thấp | Xưởng là công cụ desktop; màn nhỏ hiện thông báo thay vì cố nhồi |
| Mất bản nháp do hai tab cùng sửa | Trung bình | `updated_at` kiểm tra khi lưu; xung đột thì báo thay vì ghi đè |

---

## 8. Quyết định đã chốt (03/08/2026)

| # | Quyết định | Chốt |
|---|---|---|
| 1 | Node Chương | ⛔ **Không làm.** Chương đã có chỗ gắn thẻ riêng ở `/admin/chapters`; đưa vào đồ thị sẽ rối. Hành trình tiếp tục suy ra từ thẻ chương. |
| 2 | Phạm vi | ✅ Chạy hết S1 → S5 |
| 3 | Mật độ đồ thị mặc định | ✅ Hiện hết, vị trí do tác giả tự sắp và được lưu — xem lý do bên dưới |

### Vì sao "hiện hết" chứ không phải "chỉ hàng xóm"

Thư viện hiện còn nhỏ; giấu bớt ở quy mô này khiến tác giả tưởng mất dữ liệu.
Quan trọng hơn: trong mọi công cụ node graph nghiêm túc (Blender, Unreal
Blueprint, Houdini), thứ quyết định dùng được hay không là **trí nhớ không
gian** — "Sindark nằm góc trên bên phải". Bố cục tự động chạy mỗi lần mở sẽ phá
đúng thứ đó.

Nên: vị trí node lưu trong `doc.nodes[].graph`, dagre chỉ chạy khi bấm nút
**Dọn gọn**, không bao giờ tự động. Kèm hai van an toàn — lọc theo loại node, và
**chế độ Tập trung** (chỉ hiện hàng xóm của node đang chọn) tự bật khi vượt
**80 node**, tức đúng lúc đổ hết ra bắt đầu rối thật.

### Bản đồ nền — một điều chỉnh quan trọng so với đề bài

Nền vẽ **không** dùng ảnh Akunalia vuông 4096×4096, mà dùng
`akunalia-color-4k.jpg` (4096×2048, chiếu equirectangular) — **chính là texture
quả cầu 3D đang dùng**.

Lý do: canvas phải dùng cùng phép chiếu với quả cầu, nếu không thì điểm chấm ở
đây sẽ rơi vào chỗ khác trong thế giới 3D. Dùng ảnh poster vuông sẽ *trông* đúng
nhưng *là* sai. Độ mờ nền chỉnh được bằng thanh trượt trên thanh công cụ.

---

## 9. Trạng thái triển khai — S1 → S5

Nhánh `feature/world-studio` trên cả hai repo.

### Backend

| File | Nội dung |
|---|---|
| `migrations/20260803000002_world_studio.sql` | Bảng `world_revisions`; **unique index bộ phận** đảm bảo đúng một bản nháp tồn tại; nới `library_item_links` sang `UNIQUE (source, target, role)` |
| `entity/world_revisions.rs` | Entity + đăng ký |
| `handlers/world_studio.rs` | `GET/PUT /admin/world/draft`, `POST /admin/world/publish`, `GET /admin/world/revisions`, `POST /admin/world/revisions/{id}/restore` |
| `handlers/world.rs` | `published_doc()`, `apply_layout()` phủ bố cục lúc nạp, `GET /world/borders.geojson` |

**Ba chỗ đáng ghi lại:**

- *Tự dựng bản nháp từ dữ liệu đang có.* Lần đầu mở xưởng, `seed_doc()` gom toạ
  độ từ `extra_data.world`, cột `coordinates` cũ, và **toàn bộ `library_item_links`
  hiện có**. Nhờ vậy lần publish đầu tiên là một phép **đồng bộ**, không phải
  phép xoá sạch — nếu bản nháp khởi tạo rỗng thì publish sẽ quét sạch mọi liên
  kết đang có.
- *Phủ lớp ở đúng một chỗ.* Thay vì sửa hơn hai chục chỗ gọi `world_cfg`,
  `apply_layout()` trộn tài liệu vào `extra_data.world` ngay lúc nạp, trong bộ
  nhớ. Mọi hàm phía dưới không phải đổi một dòng.
- *Chống ghi đè khi hai tab cùng sửa.* `PUT draft` so `expected_updated_at`;
  lệch thì trả `code: "conflict"` và **từ chối ghi** thay vì âm thầm nuốt mất
  việc của phiên kia. Giao diện hiện banner đỏ kèm nút tải lại — quyết định
  thuộc về tác giả, vì tự động tải lại sẽ vứt đi thứ họ vừa làm.

### Frontend

| File | Nội dung |
|---|---|
| `world-studio/types.ts` | Kiểu tài liệu, bảng luật `EDGE_RULES`, màu/nhãn/biểu tượng theo loại node |
| `world-studio/studio.svelte.ts` | Lớp `Studio`: tài liệu, chọn lựa, autosave 2,5s, `neighbours()` cho chế độ Tập trung |
| `world-studio/projection.ts` | lat/lng ↔ pixel canvas, **cùng phép chiếu với texture quả cầu** |
| `world-studio/nodes/EntityNode.svelte` | Một component cho cả 5 loại node; cổng chỉ hiện ở chế độ Đồ thị |
| `world-studio/BorderLayer.svelte` | Đa giác + đỉnh + điểm giữa để chèn đỉnh, vẽ trong `<ViewportPortal>` |
| `world-studio/StudioCanvas.svelte` | Canvas hai chế độ, kéo node, nối dây có kiểm tra luật, vẽ/sửa ranh giới |
| `world-studio/Inspector.svelte` | Panel thuộc tính: định danh, vị trí, độ cao, dựng hình, bộ phận tháo lắp |
| `world-studio/StudioShell.svelte` | Thanh công cụ, danh sách, xem trước 3D, publish, lịch sử |
| `routes/(app)/admin/world-studio/` | Route, nạp xưởng bằng dynamic import |
| `lib/world/api.ts` | Ranh giới lấy từ API trước, file tĩnh chỉ là dự phòng |

### Hai lỗi tự bắt được khi rà lại

- `Object.values(...).reverse()` để lấy lat/lng **truyền sai thứ tự** vào
  `clampLngLat`. Đã thay bằng destructuring tường minh.
- Click vào đa giác để chọn vùng **giành mất cú click thêm đỉnh** khi đang vẽ.
  Đã bỏ hẳn handler đó; chọn vùng vẫn có ở danh sách trái và dropdown thanh công
  cụ — hai nơi đều là control thật, dùng được bằng bàn phím.

### Chưa làm

- Undo/redo nhiều bước trong xưởng (hiện chỉ có "bỏ đỉnh vừa đặt" khi vẽ).
- Vẽ ranh giới trên di động — xưởng là công cụ desktop.
- Xoá vòng đã đóng (hiện chỉ xoá được từng đỉnh; xoá cả vùng thì bỏ trống
  `borders` của vùng đó).

---

## Phụ lục — tra cứu

- Svelte Flow: https://svelteflow.dev — `@xyflow/svelte` 1.6.2, peer `svelte ^5.25`
- Bố cục đồ thị tự động: `@dagrejs/dagre` 3.1.0
- Kế hoạch thế giới 3D (M1–M4): [WORLD-3D-PLAN.md](WORLD-3D-PLAN.md)
