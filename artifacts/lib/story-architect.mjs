// ═══════════════════════════════════════════════════════════════════
//  Story Architect — lõi thuần, không UI (CW-400)
// ═══════════════════════════════════════════════════════════════════
// Hai hành động: `plan` biến Research Pack đã duyệt thành Blueprint;
// `analyze` biến một chương đã nhập canon thành ChapterCommitDelta.
//
// Toàn bộ phần quyết định nằm ở đây để test chạy đúng đoạn mã Artifact
// chạy, thay vì một bản chép lại.

import {
  extractJson,
  normalizeBlueprint,
  normalizeCommitDelta,
  validateBlueprint,
  validateCommitDelta,
  PROJECTION_TYPES,
} from "./contracts.mjs";
import { ARTIFACT_TOOL_VERSION } from "./runtime.mjs";

export const TOOL_NAME = "story_architect";
export const TOOL_VERSION = ARTIFACT_TOOL_VERSION;
export const ACTIONS = ["plan", "analyze", "continue"];

const MAX_BLOCK_CHARS = 4000;
const MAX_CHAPTER_CHARS = 120000;

/* ─── Dựng ngữ cảnh (thứ model không được phép tự bịa) ─── */

export function planContext(pack, config) {
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
    researchHash: config.researchHash ?? config.inputHash ?? "manual",
    knownChunkIds: pack.blocks.map((block) => block.chunk_id).filter((id) => Number.isInteger(id)),
    pov: pack.chapter_contract?.pov ?? "",
    tense: pack.chapter_contract?.tense ?? "",
    language: pack.chapter_contract?.language ?? "vi",
    targetWords: Number.isInteger(pack.chapter_contract?.target_words) ? pack.chapter_contract.target_words : 0,
  };
}

export function analyzeContext(pack, config, chapterText) {
  return {
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    model: config.model,
    effort: config.effort ?? null,
    thinking: config.thinkingOn === true,
    projectId: pack?.project_id ?? config.projectId ?? "unknown-project",
    chapterNumber: Number.isInteger(config.chapterNumber) ? config.chapterNumber : (pack?.chapter_number ?? 0),
    sourceCommitId: config.sourceCommitId ?? "unknown-commit",
    contentHash: config.contentHash ?? "unknown-hash",
    chapterText,
  };
}

/* ─── Hành động "plan" ─── */

const PLAN_SYSTEM = `Bạn là KIẾN TRÚC SƯ CỐT TRUYỆN của Selorson Co-Writer. Nhiệm vụ: từ Research Pack đã được tác giả duyệt, dựng dàn ý một chương (Blueprint) đủ chi tiết để người viết ngồi xuống viết thẳng, không phải đoán.

NGUYÊN TẮC BẤT DI BẤT DỊCH
1. Chỉ dựa vào tư liệu trong Research Pack. Không thêm nhân vật, địa danh, sự kiện quá khứ nào không có trong tư liệu hoặc trong ý đồ tác giả.
2. Mỗi khẳng định về quá khứ hoặc về thế giới phải trỏ về một khối tư liệu. Trong "evidence", "chunk_id" PHẢI là một id có thật trong Research Pack; không có id phù hợp thì để null và ghi rõ nguồn ở "source".
3. Thấy tư liệu mâu thuẫn nhau, hoặc mâu thuẫn với ý đồ tác giả: ghi vào "continuity.contradictions" thay vì tự chọn một bên rồi im lặng.
4. Không viết văn xuôi. Beat là câu mô tả hành động, không phải câu văn trong truyện.
5. Không chắc điều gì thì ghi vào "warnings". Một dàn ý thiếu một chi tiết còn hơn một dàn ý chứa chi tiết bịa.

CÁCH CHIA CẢNH
Mỗi cảnh có một mục đích duy nhất, một biến chuyển, và một trạng thái thoát khác trạng thái vào. Cảnh không đổi gì thì gộp vào cảnh khác. Tổng "target_words" của các cảnh xấp xỉ mục tiêu độ dài chương.

ĐẦU RA
Trả về DUY NHẤT một JSON object, không rào \`\`\`, không lời dẫn, theo đúng khung sau:

{
  "title": "tên chương",
  "logline": "một câu nói chương này làm gì cho câu chuyện",
  "pov": "", "tense": "", "language": "vi", "target_words": 0,
  "scenes": [{
    "id": "scene-1", "order": 1,
    "purpose": "cảnh này tồn tại để làm gì",
    "setting": "nơi chốn", "time": "thời điểm",
    "pov_character": "", "characters": [""],
    "beats": ["chuỗi hành động, mỗi beat một câu"],
    "conflict": "lực cản trong cảnh",
    "turn": "điều thay đổi",
    "exit_state": "trạng thái khi cảnh khép lại",
    "target_words": 0,
    "evidence": [{ "chunk_id": 12, "source": "tên file", "why": "vì sao mẩu này chống đỡ cảnh" }]
  }],
  "continuity": {
    "carried_state": [{ "subject": "ai/cái gì", "fact": "trạng thái mang sang từ trước", "evidence": [] }],
    "open_loops_touched": [{ "id": "", "action": "advance|resolve|deepen", "note": "" }],
    "new_loops": [{ "description": "", "payoff_horizon": "" }],
    "contradictions": [{ "claim": "", "conflicts_with": "", "evidence": [] }]
  },
  "guardrails": { "must_include": [], "must_avoid": [], "forbidden_words": [] },
  "risks": [{ "risk": "", "mitigation": "" }],
  "warnings": []
}`;

export function buildPlanPrompt(pack, config) {
  const parts = [
    `# Ý ĐỒ CHƯƠNG ${pack.chapter_number}`,
    renderIntent(pack.intent),
    "",
    "# HỢP ĐỒNG CHƯƠNG",
    renderJson(pack.chapter_contract),
  ];

  if (pack.recent_canon.length) {
    parts.push("", "# CHƯƠNG CANON GẦN NHẤT", renderJson(pack.recent_canon));
  }
  if (pack.open_loops.length) {
    parts.push("", "# NÚT THẮT ĐANG MỞ", renderJson(pack.open_loops));
  }
  if (pack.entities.length) {
    parts.push("", "# NHÂN VẬT / THỰC THỂ", renderJson(pack.entities));
  }

  parts.push("", "# TƯ LIỆU ĐÃ DUYỆT", renderBlocks(pack.blocks));

  const extra = String(config.instructions ?? "").trim();
  if (extra) parts.push("", "# CHỈ THỊ THÊM CỦA TÁC GIẢ", extra);

  parts.push(
    "",
    "Dựng Blueprint cho chương này ngay. Chỉ trả về JSON object theo khung đã nêu."
  );
  return { system: PLAN_SYSTEM, user: parts.join("\n") };
}

/** Biến đầu ra thô của model thành envelope đã kiểm tra. */
export function finishPlan(raw, context) {
  const parsed = extractJson(raw);
  const envelope = normalizeBlueprint(parsed, context);
  return { envelope, validation: validateBlueprint(envelope) };
}

/* ─── Hành động "analyze" ─── */

const ANALYZE_SYSTEM = `Bạn là BỘ TRÍCH XUẤT của Selorson Co-Writer. Nhiệm vụ: đọc một chương đã được tác giả chấp nhận vào canon và rút ra các phóng chiếu (projection) để hệ thống dựng lại bản đồ truyện.

NGUYÊN TẮC BẤT DI BẤT DỊCH
1. Chỉ rút ra điều văn bản chương THỰC SỰ nói. Không suy diễn, không nối tiếp, không đoán ý tác giả.
2. Mỗi projection PHẢI kèm "evidence.quote" là trích NGUYÊN VĂN, sao chép chính xác từng ký tự từ chương, đủ ngắn để trỏ đúng chỗ (một tới hai câu). Trích sai một ký tự thì projection bị loại.
3. "evidence.start" là chỉ số ký tự nơi trích dẫn bắt đầu, đếm từ 0 trên toàn văn bản chương. Không chắc thì cứ ước lượng — hệ thống sẽ tự dò lại bằng chính trích dẫn.
4. "confidence" trong khoảng 0 tới 1, phản ánh mức chắc chắn thật. Điều được nói thẳng thì cao; điều phải suy ra từ ngữ cảnh thì thấp.
5. Thấy chương mâu thuẫn với canon trước đó: ghi vào "contradictions", không tự sửa.

LOẠI PROJECTION HỢP LỆ
${PROJECTION_TYPES.map((type) => `- ${type}`).join("\n")}

"subject_key" là khoá ổn định của đối tượng: tên nhân vật, tên quan hệ, mốc thời gian, hoặc id nút thắt. Cùng một đối tượng ở các chương khác nhau phải cùng khoá.

ĐẦU RA
Trả về DUY NHẤT một JSON object, không rào \`\`\`, không lời dẫn:

{
  "summary": {
    "short": "một tới hai câu",
    "long": "tóm tắt đầy đủ",
    "scenes": [{ "order": 1, "title": "", "summary": "" }]
  },
  "projections": [{
    "projection_type": "event",
    "subject_key": "",
    "payload": { },
    "evidence": { "start": 0, "end": 0, "quote": "trích nguyên văn" },
    "confidence": 0.8
  }],
  "contradictions": [{ "claim": "", "conflicts_with": "", "note": "" }],
  "warnings": []
}`;

export function buildAnalyzePrompt(chapterText, pack, config) {
  const parts = [];
  if (pack?.recent_canon?.length) {
    parts.push("# CANON TRƯỚC ĐÓ (để đối chiếu mâu thuẫn)", renderJson(pack.recent_canon), "");
  }
  if (pack?.entities?.length) {
    parts.push("# THỰC THỂ ĐÃ BIẾT (dùng lại đúng khoá tên)", renderJson(pack.entities), "");
  }
  if (pack?.open_loops?.length) {
    parts.push("# NÚT THẮT ĐANG MỞ", renderJson(pack.open_loops), "");
  }

  const extra = String(config.instructions ?? "").trim();
  if (extra) parts.push("# CHỈ THỊ THÊM CỦA TÁC GIẢ", extra, "");

  parts.push(
    `# VĂN BẢN CHƯƠNG ${config.chapterNumber ?? ""} (nguồn sự thật duy nhất)`,
    clamp(chapterText, MAX_CHAPTER_CHARS),
    "",
    "Rút projection từ chương trên ngay. Chỉ trả về JSON object theo khung đã nêu."
  );
  return { system: ANALYZE_SYSTEM, user: parts.join("\n") };
}

export function finishAnalyze(raw, context) {
  const parsed = extractJson(raw);
  const envelope = normalizeCommitDelta(parsed, context);
  return { envelope, validation: validateCommitDelta(envelope) };
}

/* ─── Kết xuất cho con người ─── */

export function blueprintMarkdown(blueprint) {
  const lines = [
    `# ${blueprint.title}`,
    "",
    `**Logline.** ${blueprint.logline}`,
    "",
    `Chương ${blueprint.chapter_number} · ${blueprint.scenes.length} cảnh · mục tiêu ${blueprint.target_words} từ`,
    "",
  ];
  for (const scene of blueprint.scenes) {
    lines.push(`## ${scene.order}. ${scene.purpose}`);
    lines.push("");
    lines.push(`- Bối cảnh: ${scene.setting || "—"}${scene.time ? ` · ${scene.time}` : ""}`);
    lines.push(`- Nhân vật: ${scene.characters.join(", ") || "—"}`);
    lines.push(`- Xung đột: ${scene.conflict || "—"}`);
    lines.push(`- Biến chuyển: ${scene.turn || "—"}`);
    lines.push(`- Trạng thái thoát: ${scene.exit_state || "—"}`);
    lines.push(`- Mục tiêu: ${scene.target_words} từ`);
    lines.push("");
    scene.beats.forEach((beat, index) => lines.push(`${index + 1}. ${beat}`));
    if (scene.evidence.length) {
      lines.push("");
      lines.push("Tư liệu chống đỡ:");
      scene.evidence.forEach((entry) =>
        lines.push(`- ${entry.chunk_id === null ? "(không có id)" : `#${entry.chunk_id}`} ${entry.source} — ${entry.why}`)
      );
    }
    lines.push("");
  }
  if (blueprint.continuity.contradictions.length) {
    lines.push("## Mâu thuẫn cần tác giả quyết", "");
    blueprint.continuity.contradictions.forEach((entry) =>
      lines.push(`- ${entry.claim} ⟂ ${entry.conflicts_with}`)
    );
    lines.push("");
  }
  if (blueprint.warnings.length) {
    lines.push("## Cảnh báo", "");
    blueprint.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }
  return lines.join("\n");
}

/* ─── Trợ giúp ─── */

function renderIntent(intent) {
  const lines = [intent.premise || "(chưa ghi tiền đề)"];
  if (intent.goals?.length) lines.push("", "Mục tiêu:", ...intent.goals.map((goal) => `- ${goal}`));
  if (intent.must_include?.length) lines.push("", "Bắt buộc có:", ...intent.must_include.map((item) => `- ${item}`));
  if (intent.must_avoid?.length) lines.push("", "Bắt buộc tránh:", ...intent.must_avoid.map((item) => `- ${item}`));
  return lines.join("\n");
}

function renderBlocks(blocks) {
  const usable = blocks.filter((block) => !block.vetoed);
  if (!usable.length) return "(Research Pack không có khối tư liệu nào)";
  return usable
    .map((block) => {
      const id = block.chunk_id === null ? "không id" : `chunk_id=${block.chunk_id}`;
      const flags = [block.pinned ? "GHIM" : null, ...block.channels].filter(Boolean).join(", ");
      const head = `### [${id}] ${block.source_file}${block.heading ? ` › ${block.heading}` : ""}`;
      return `${head}\n(kênh: ${flags || "—"} · lý do chọn: ${block.reason})\n${clamp(block.text, MAX_BLOCK_CHARS)}`;
    })
    .join("\n\n");
}

function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

function clamp(value, limit) {
  const body = String(value ?? "");
  return body.length <= limit ? body : `${body.slice(0, limit)}\n…(đã cắt bớt ${body.length - limit} ký tự)`;
}
