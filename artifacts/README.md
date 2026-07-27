# Co-Writer Artifacts — CW-400 / CW-410

Hai Claude Artifact của Selorson Co-Writer. Chúng chạy trên claude.ai,
không cần API key, và là nơi duy nhất trong hệ thống mà một model được
phép sinh ra nội dung chương.

| Artifact | Task | Hành động | Đầu vào → Đầu ra |
|---|---|---|---|
| Kiến Trúc Sư Cốt Truyện | CW-400 | `plan`, `analyze`, `continue` | `ChapterResearchPackV1` → `ChapterBlueprintV1`; chương canon → `ChapterCommitDeltaV1` |
| Người Viết Chương | CW-410 | `write`, `revise`, `selfcheck`, `continue` | `WriterPackV1` → `ChapterDraftEnvelopeV1` |

## Bố cục

```
artifacts/
  lib/contracts.mjs        hợp đồng: validate + normalize (dùng chung)
  lib/runtime.mjs          model, cấu hình suy nghĩ, gọi API, tín hiệu sidecar
  lib/story-architect.mjs  prompt + chuẩn hoá đầu ra CW-400
  lib/chapter-writer.mjs   prompt + chuẩn hoá đầu ra CW-410
  src/*.jsx                giao diện Artifact, có dấu `// @inline`
  dist/*.jsx               BẢN SINH RA — đây là thứ dán vào claude.ai
  build.mjs                bộ nội tuyến hoá
  *.test.mjs               node:test
```

`lib/` tồn tại vì Artifact phải là một file và không import được gì ngoài
`react`, trong khi hợp đồng và lõi quyết định thì phải test được.
`build.mjs` ghép hai thế giới đó lại, nên chỉ có một nguồn sự thật.

**Đừng sửa `dist/`.** Sửa `src/` hoặc `lib/` rồi chạy lại build; một bài
test sẽ đỏ nếu `dist/` lệch.

## Lệnh

```bash
node artifacts/build.mjs          # sinh lại dist/
node artifacts/build.mjs --check  # chỉ báo lệch, không ghi
node --test artifacts             # chạy bộ test
```

Từ gốc repo frontend: `npm run artifacts:build`, `npm run artifacts:test`.

## Dán vào Claude

1. Mở claude.ai, tạo Artifact React mới.
2. Dán toàn bộ `dist/story-architect.jsx` (hoặc `dist/chapter-writer.jsx`).
3. Giữ mỗi Artifact ở một cuộc trò chuyện riêng — runner tìm bridge trên
   mọi tab claude.ai đang mở, và hai bridge cùng lúc thì tab nào được lái
   là chuyện may rủi.

## Ba đường vào, một kết quả

- **Runner** (`CW-220`/`CW-230`): Playwright gọi `window.__nf_ctl`
  → `configure()` → `importFile()` → `run(action)` → `getResult()`.
- **Tay**: tác giả nạp file ở cột trái, bấm chạy, rồi bấm *Xuất JSON* và
  import lại vào Selorson (`CW-250`).
- **Checkpoint**: hết hạn mức giữa chừng thì *Xuất checkpoint*, mở
  Artifact ở tài khoản khác, *Nạp*, rồi bấm *Chạy tiếp*.

Cả ba đường cho ra cùng một envelope, vì cùng đi qua `normalize` rồi
`validate` trong `lib/contracts.mjs`.

## Ràng buộc đã cố ý chọn

- **Model không được tự khai định danh.** `project_id`, `chapter_number`,
  `input_hash`, `source_commit_id` luôn lấy từ ngữ cảnh job. Model chỉ
  đóng góp nội dung.
- **`normalize` sửa hình dạng, không sửa nội dung.** Trường mang ý nghĩa
  mà model bỏ trống thì để trống cho `validate` bắt. Điền chuỗi giữ chỗ
  chỉ làm một kết quả rỗng trông như hợp lệ rồi trôi vào canon.
- **Bằng chứng phải kiểm chứng được.** `chunk_id` không có trong Research
  Pack bị hạ xuống `null`; trích dẫn không tìm thấy trong văn bản chương
  thì cả projection bị loại và ghi vào `warnings`.
- **`getResult()` trả `null` khi hợp đồng chưa qua.** Runner không bao giờ
  nhận được một envelope hỏng; nó thấy tín hiệu `error` và dừng job.
- **Văn xuôi không nằm trong JSON.** Chương dài bị cắt giữa chuỗi JSON là
  không cứu được; cắt giữa văn xuôi thì nối tiếp là chuyện bình thường.
  Bản tự kiểm là lượt gọi riêng.
- **Trần 16K token mỗi lượt.** Request không stream vượt ngưỡng đó có
  nguy cơ chết vì timeout HTTP. Bản dài đi tiếp bằng vòng nối.
- **`fallbacks: "default"` bật sẵn** trên các model hỗ trợ, để một chương
  u ám bị bộ lọc chặn vẫn chạy tiếp trên Opus 4.8. Artifact chạy qua proxy
  của claude.ai chứ không phải API thô, nên nếu proxy chưa biết tham số
  đó, `callClaude` thử lại đúng một lần không kèm fallback.

## Còn nợ

- **Định hình phong cách.** Khối `VOICE_FLOOR` trong
  `lib/chapter-writer.mjs` mới chỉ đặt sàn chất lượng và nhường mọi quyết
  định về giọng cho `style.voice_notes` + đoạn mẫu tác giả nạp vào. Đây là
  phần sẽ được làm lại.
- **Chưa có route.** Backend chưa lộ ra endpoint nào dựng Research Pack
  hay WriterPack; `CW-420` nối ba cổng duyệt vào đây.
- **Chưa validate ở backend.** Hợp đồng hiện chỉ được kiểm ở phía
  Artifact. `import_result` của backend vẫn chỉ kiểm envelope runner.
