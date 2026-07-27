// ═══════════════════════════════════════════════════════════════════
//  Chapter Writer — lõi thuần, không UI (CW-410)
// ═══════════════════════════════════════════════════════════════════
// Bốn hành động: `write` dựng bản thảo từ Blueprint đã duyệt, `revise`
// sửa theo ghi chú của tác giả, `selfcheck` tự soi bản thảo hiện có,
// `continue` viết tiếp phần bị cắt vì hết token.
//
// Văn xuôi được sinh dưới dạng Markdown thuần chứ không nhét trong JSON.
// Một chương dài bị cắt giữa chuỗi JSON là không cứu được; cắt giữa văn
// xuôi thì nối tiếp là chuyện bình thường. Bản tự kiểm là lượt gọi
// riêng, đọc lại chính bản thảo vừa sinh.

import {
  buildDraftEnvelope,
  extractJson,
  validateDraftEnvelope,
  CHECK_STATUSES,
} from "./contracts.mjs";
import { ARTIFACT_TOOL_VERSION } from "./runtime.mjs";

export const TOOL_NAME = "chapter_writer";
export const TOOL_VERSION = ARTIFACT_TOOL_VERSION;
export const ACTIONS = ["write", "revise", "selfcheck", "continue"];

const MAX_BLOCK_CHARS = 3000;
const MAX_DRAFT_CHARS = 120000;

export function writerContext(pack, config, extra = {}) {
  return {
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    model: config.model,
    effort: config.effort ?? null,
    thinking: config.thinkingOn === true,
    projectId: pack.project_id,
    chapterNumber: pack.chapter_number,
    jobId: config.jobId ?? null,
    inputHash: config.inputHash ?? "manual",
    blueprint: pack.blueprint ?? {},
    blocksAvailable: (pack.context_blocks ?? []).map((block) => block?.chunk_id).filter((id) => Number.isInteger(id)),
    warnings: extra.warnings ?? [],
    revisionOf: extra.revisionOf ?? null,
  };
}

/* ─── Giọng nền ─── */

// TẠM THỜI: khối này là phần định hình phong cách sẽ được làm lại. Nó
// cố ý chỉ đặt ra sàn chất lượng và nhường mọi quyết định về giọng cho
// `style.voice_notes` và các đoạn mẫu mà tác giả nạp vào.
const VOICE_FLOOR = `GIỌNG VĂN
- Viết như một người kể chuyện đã sống trong thế giới này, không như một AI mô tả nó.
- Cơ chế trước, kết luận sau: cho người đọc thấy sự việc xảy ra rồi để họ tự rút ra ý nghĩa. Không giải thích hộ cảm xúc nhân vật.
- Câu dài ngắn biến thiên tự nhiên theo nhịp cảnh. Không dùng câu cụt như thủ thuật ép nhịp.
- Chi tiết cụ thể thắng tính từ chung chung. Một đồ vật có thật hơn ba tính từ.
- Không sáo ngữ, không lên gân, không tổng kết đạo lý ở cuối cảnh.
- Đối thoại mang thông tin và làm lộ tính cách. Nhân vật nói khác nhau.`;

const WRITE_SYSTEM = `Bạn là NGƯỜI VIẾT của Selorson Co-Writer. Nhiệm vụ: viết trọn một chương tiểu thuyết theo đúng Blueprint mà tác giả đã duyệt.

${VOICE_FLOOR}

RÀNG BUỘC BẤT DI BẤT DỊCH
1. Bám Blueprint. Viết đủ mọi cảnh, đúng thứ tự, đủ mọi beat. Không thêm cảnh, không bỏ cảnh, không đảo thứ tự.
2. Không mâu thuẫn với tư liệu trong gói. Chi tiết nào không có trong Blueprint lẫn tư liệu thì đừng khẳng định như sự thật của thế giới.
3. Giữ đúng ngôi kể, thì, và ngôn ngữ ghi trong hợp đồng chương.
4. Tôn trọng "must_include", "must_avoid" và "forbidden_words" trong guardrails.
5. Mở đầu mỗi cảnh bằng đúng một dòng đánh dấu \`<!-- scene: ID -->\` với ID lấy nguyên từ Blueprint. Dòng này bị gỡ trước khi lưu, nên đừng viết gì khác trên đó.

ĐẦU RA
Chỉ trả về văn xuôi Markdown của chương. Không rào \`\`\`, không lời dẫn, không ghi chú cho tác giả, không tiêu đề "Chương ..." trừ khi Blueprint yêu cầu.`;

const REVISE_SYSTEM = `Bạn là NGƯỜI VIẾT của Selorson Co-Writer, đang SỬA một bản thảo đã có theo ghi chú của tác giả.

${VOICE_FLOOR}

RÀNG BUỘC BẤT DI BẤT DỊCH
1. Sửa đúng những gì ghi chú yêu cầu. Đoạn nào ghi chú không đụng tới thì giữ nguyên từng chữ.
2. Không viết lại chương từ đầu. Không "cải thiện" thêm những chỗ không được yêu cầu.
3. Giữ nguyên các dòng đánh dấu \`<!-- scene: ID -->\` và vị trí ranh giới cảnh, trừ khi ghi chú yêu cầu đổi.
4. Vẫn tôn trọng Blueprint và guardrails như bản gốc.

ĐẦU RA
Chỉ trả về TOÀN BỘ bản thảo sau khi sửa, dạng Markdown thuần. Không rào \`\`\`, không diff, không liệt kê thay đổi.`;

const SELF_CHECK_SYSTEM = `Bạn là NGƯỜI SOI BẢN THẢO của Selorson Co-Writer. Nhiệm vụ: đối chiếu bản thảo với Blueprint và guardrails, rồi báo cáo trung thực.

NGUYÊN TẮC
1. Báo cáo mọi vấn đề tìm thấy, kể cả loại nhỏ và loại bạn không chắc. Việc lọc theo mức nghiêm trọng là của tác giả, không phải của bạn.
2. Mỗi mục kiểm có "detail" nêu bằng chứng cụ thể: cảnh nào, beat nào, câu nào. "Nhìn chung ổn" không phải bằng chứng.
3. Beat nào trong Blueprint không tìm thấy dấu vết trong bản thảo thì đưa vào "unresolved_beats". Đừng suy diễn rằng nó đã được ám chỉ.
4. Không đề xuất viết lại. Chỉ nêu vấn đề.

CÁC MỤC PHẢI KIỂM (dùng đúng "id" này)
- scene_coverage: đủ cảnh, đúng thứ tự, có đủ dòng đánh dấu?
- beat_coverage: mọi beat đều xuất hiện?
- pov_tense: đúng ngôi kể và thì suốt chương?
- continuity: có mâu thuẫn với tư liệu hoặc trạng thái mang sang không?
- guardrails: có vi phạm must_include / must_avoid / forbidden_words không?
- length: độ dài so với mục tiêu chương?
- prose_quality: sáo ngữ, lặp từ, giải thích hộ cảm xúc, tổng kết đạo lý?

ĐẦU RA
Trả về DUY NHẤT một JSON object, không rào \`\`\`, không lời dẫn:

{
  "checks": [{ "id": "scene_coverage", "label": "Đủ cảnh", "status": "${CHECK_STATUSES.join("|")}", "detail": "bằng chứng cụ thể" }],
  "unresolved_beats": [{ "scene_id": "scene-2", "beat": "beat chưa thấy trong bản thảo" }],
  "notes": ""
}`;

/* ─── Dựng prompt ─── */

export function buildWritePrompt(pack, config) {
  const parts = [
    `# BLUEPRINT ĐÃ DUYỆT — CHƯƠNG ${pack.chapter_number}`,
    JSON.stringify(pack.blueprint, null, 2),
    "",
    "# HỢP ĐỒNG CHƯƠNG",
    JSON.stringify(pack.chapter_contract, null, 2),
  ];

  const style = renderStyle(pack.style);
  if (style) parts.push("", "# YÊU CẦU VỀ GIỌNG CỦA TÁC GIẢ", style);

  if (pack.previous_tail) {
    parts.push("", "# ĐUÔI CHƯƠNG TRƯỚC (viết sao cho nối liền mạch)", clamp(pack.previous_tail, 6000));
  }
  if (pack.open_loops?.length) {
    parts.push("", "# NÚT THẮT ĐANG MỞ", JSON.stringify(pack.open_loops, null, 2));
  }
  if (pack.entities?.length) {
    parts.push("", "# NHÂN VẬT / THỰC THỂ", JSON.stringify(pack.entities, null, 2));
  }
  if (pack.context_blocks?.length) {
    parts.push("", "# TƯ LIỆU ĐÃ DUYỆT (dùng để giữ đúng chi tiết, không chép nguyên văn)", renderBlocks(pack.context_blocks));
  }

  const extra = String(config.instructions ?? "").trim();
  if (extra) parts.push("", "# CHỈ THỊ THÊM CỦA TÁC GIẢ", extra);

  parts.push("", "Viết trọn chương ngay. Chỉ trả về văn xuôi Markdown.");
  return { system: WRITE_SYSTEM, user: parts.join("\n") };
}

export function buildRevisePrompt(pack, currentDraft, reviseNotes, config) {
  const parts = [
    `# BLUEPRINT ĐÃ DUYỆT — CHƯƠNG ${pack.chapter_number}`,
    JSON.stringify(pack.blueprint, null, 2),
    "",
    "# GHI CHÚ SỬA CỦA TÁC GIẢ (đây là việc phải làm)",
    String(reviseNotes ?? "").trim() || "(tác giả chưa ghi chú — giữ nguyên bản thảo và báo lại ở phần tự kiểm)",
  ];

  const style = renderStyle(pack.style);
  if (style) parts.push("", "# YÊU CẦU VỀ GIỌNG CỦA TÁC GIẢ", style);

  const extra = String(config.instructions ?? "").trim();
  if (extra) parts.push("", "# CHỈ THỊ THÊM CỦA TÁC GIẢ", extra);

  parts.push("", "# BẢN THẢO HIỆN TẠI", clamp(currentDraft, MAX_DRAFT_CHARS));
  parts.push("", "Sửa bản thảo trên theo ghi chú. Trả về toàn bộ bản thảo sau khi sửa.");
  return { system: REVISE_SYSTEM, user: parts.join("\n") };
}

export function buildSelfCheckPrompt(pack, draftText, config) {
  const parts = [
    `# BLUEPRINT ĐÃ DUYỆT — CHƯƠNG ${pack.chapter_number}`,
    JSON.stringify(pack.blueprint, null, 2),
    "",
    "# HỢP ĐỒNG CHƯƠNG",
    JSON.stringify(pack.chapter_contract, null, 2),
  ];

  const style = renderStyle(pack.style);
  if (style) parts.push("", "# YÊU CẦU VỀ GIỌNG CỦA TÁC GIẢ", style);

  const extra = String(config.instructions ?? "").trim();
  if (extra) parts.push("", "# CHỈ THỊ THÊM CỦA TÁC GIẢ", extra);

  parts.push("", "# BẢN THẢO CẦN SOI", clamp(draftText, MAX_DRAFT_CHARS));
  parts.push("", "Soi bản thảo trên ngay. Chỉ trả về JSON object theo khung đã nêu.");
  return { system: SELF_CHECK_SYSTEM, user: parts.join("\n") };
}

/* ─── Kết thúc hành động ─── */

/** Gỡ dòng đánh dấu cảnh khỏi văn bản sẽ lưu vào canon. */
export function stripSceneMarks(body) {
  return String(body ?? "")
    .replace(/^[ \t]*<!--\s*scene:[^>]*-->[ \t]*\r?\n?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseSelfCheck(raw) {
  return extractJson(raw);
}

/**
 * Dựng envelope bản thảo.
 *
 * `prose` giữ nguyên dòng đánh dấu để bản đồ cảnh tính được vị trí;
 * `text` trong envelope là bản đã gỡ đánh dấu, vì đó mới là thứ đi vào
 * canon. Hai giá trị này không được hoán đổi cho nhau.
 */
export function finishDraft({ prose, selfCheck, truncated, context }) {
  const marked = String(prose ?? "");
  const clean = stripSceneMarks(marked);
  const envelope = buildDraftEnvelope({
    prose: marked,
    selfCheck,
    truncated,
    context,
  });
  // scene_map được tính trên bản còn đánh dấu; text lưu bản đã gỡ, nên
  // các chỉ số dịch đi. Ghi rõ mốc là "marked" để phía sau không hiểu
  // nhầm chúng là offset trong canon.
  envelope.scene_map = envelope.scene_map.map((entry) => ({ ...entry, basis: "marked" }));
  envelope.text = clean;
  envelope.word_count = countWordsOf(clean);
  envelope.char_count = clean.length;
  return { envelope, validation: validateDraftEnvelope(envelope) };
}

function countWordsOf(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/* ─── Kết xuất cho con người ─── */

export function draftMarkdown(envelope) {
  const lines = [
    `# ${envelope.title}`,
    "",
    `Chương ${envelope.chapter_number} · ${envelope.word_count} từ · tự kiểm: ${envelope.self_check.status}`,
    "",
    envelope.text,
  ];
  if (envelope.self_check.checks.length) {
    lines.push("", "---", "", "## Báo cáo tự kiểm", "");
    envelope.self_check.checks.forEach((check) =>
      lines.push(`- **${check.label}** — ${check.status}: ${check.detail || "—"}`)
    );
  }
  if (envelope.self_check.unresolved_beats.length) {
    lines.push("", "## Beat chưa thấy trong bản thảo", "");
    envelope.self_check.unresolved_beats.forEach((entry) =>
      lines.push(`- ${entry.scene_id || "?"}: ${entry.beat}`)
    );
  }
  return lines.join("\n");
}

/* ─── Trợ giúp ─── */

function renderStyle(style) {
  if (!style) return "";
  const lines = [];
  if (style.voice_notes) lines.push(style.voice_notes);
  if (style.forbidden_words?.length) lines.push("", `Từ cấm: ${style.forbidden_words.join(", ")}`);
  if (style.sample_paragraphs?.length) {
    lines.push("", "Đoạn mẫu để bắt giọng (bắt chước nhịp và cách quan sát, KHÔNG chép nội dung):");
    style.sample_paragraphs.forEach((sample, index) => lines.push("", `--- mẫu ${index + 1} ---`, clamp(sample, 3000)));
  }
  return lines.join("\n").trim();
}

function renderBlocks(blocks) {
  return blocks
    .map((block) => {
      const id = Number.isInteger(block?.chunk_id) ? `chunk_id=${block.chunk_id}` : "không id";
      const head = `### [${id}] ${block?.source_file ?? "không rõ nguồn"}${block?.heading ? ` › ${block.heading}` : ""}`;
      return `${head}\n${clamp(block?.text, MAX_BLOCK_CHARS)}`;
    })
    .join("\n\n");
}

function clamp(value, limit) {
  const body = String(value ?? "");
  return body.length <= limit ? body : `${body.slice(0, limit)}\n…(đã cắt bớt ${body.length - limit} ký tự)`;
}
