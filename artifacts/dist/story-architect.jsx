import { useState, useCallback, useRef, useMemo, useEffect } from "react";

/* ════════════════════════════════════════════════════════════════════
   KIẾN TRÚC SƯ CỐT TRUYỆN (Story Architect) — Selorson Co-Writer CW-400

   Hai việc:
     plan     Research Pack đã duyệt  →  ChapterBlueprintV1
     analyze  chương đã nhập canon    →  ChapterCommitDeltaV1

   Chạy zero-key trong Claude Artifact. Ba đường vào cho ra cùng một kết
   quả: runner Playwright lái qua `window.__nf_ctl`, tác giả bấm tay,
   hoặc nạp checkpoint từ tài khoản khác rồi chạy tiếp.

   File trong dist/ là bản SINH RA. Sửa ở artifacts/src/ + artifacts/lib/
   rồi chạy `node artifacts/build.mjs`.
   ════════════════════════════════════════════════════════════════════ */

/* ── nội tuyến từ ../lib/contracts.mjs — sinh bởi artifacts/build.mjs, đừng sửa ở đây ── */
// ═══════════════════════════════════════════════════════════════════
//  Co-Writer Artifact contracts — CW-400 / CW-410
// ═══════════════════════════════════════════════════════════════════
// Ranh giới công khai giữa backend, UI, Tauri, sidecar và hai Artifact.
// Bản đặc tả người đọc nằm ở backend-v3/docs/co-writer/contracts/.
//
// Hai lớp tách bạch, cố ý:
//   normalize*() nhận JSON lỏng lẻo do model sinh ra và ép về đúng hình
//   dạng hợp đồng; validate*() từ chối thứ vẫn không đúng. Model không
//   bao giờ nói chuyện thẳng với backend — nó đi qua normalize rồi mới
//   tới validate, nên một trường thiếu là giá trị mặc định chứ không
//   phải một job hỏng.
//
// Tên trường dùng snake_case vì các envelope này được lưu nguyên văn vào
// chapter_workflow.blueprint_json / draft_json và bị Rust đọc lại.

const CONTRACT_VERSION = 1;

const CONTRACT_NAMES = {
  research: "ChapterResearchPackV1",
  blueprint: "ChapterBlueprintV1",
  delta: "ChapterCommitDeltaV1",
  writer: "WriterPackV1",
  draft: "ChapterDraftEnvelopeV1",
  checkpoint: "ArtifactCheckpointV1",
};

/* ─── Vị từ kiểu ─── */

const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";
const isInt = (value) => Number.isInteger(value);
const isArray = Array.isArray;
const inRange = (value, low, high) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;

/* ─── Ghi lỗi ─── */

function need(errors, path, value, test, expected) {
  if (test(value)) return true;
  errors.push(`${path}: ${expected}`);
  return false;
}

function needEach(errors, path, value, { min, each }) {
  if (!need(errors, path, value, isArray, "phải là mảng")) return false;
  if (value.length < min) {
    errors.push(`${path}: cần ít nhất ${min} phần tử, đang có ${value.length}`);
    return false;
  }
  value.forEach((entry, index) => each(errors, `${path}[${index}]`, entry));
  return true;
}

function needEnvelope(errors, envelope, contract) {
  if (!need(errors, "$", envelope, isObject, "phải là JSON object")) return false;
  need(errors, "$.contract", envelope.contract, (value) => value === contract, `phải bằng "${contract}"`);
  need(errors, "$.schema_version", envelope.schema_version, (value) => value === CONTRACT_VERSION, `phải bằng ${CONTRACT_VERSION}`);
  need(errors, "$.project_id", envelope.project_id, isText, "bắt buộc, chuỗi khác rỗng");
  need(errors, "$.chapter_number", envelope.chapter_number, isInt, "bắt buộc, số nguyên");
  return true;
}

/** Producer đi kèm mọi đầu ra: ai sinh, bằng model nào, lúc nào. */
function needProducer(errors, path, producer) {
  if (!need(errors, path, producer, isObject, "bắt buộc, object")) return;
  need(errors, `${path}.tool`, producer.tool, isText, "bắt buộc");
  need(errors, `${path}.tool_version`, producer.tool_version, isText, "bắt buộc");
  need(errors, `${path}.model`, producer.model, isText, "bắt buộc");
  need(errors, `${path}.generated_at`, producer.generated_at, isText, "bắt buộc, ISO timestamp");
}

/** Một mẩu bằng chứng trỏ về tư liệu nguồn. Không có nguồn thì không có luận điểm. */
function needEvidence(errors, path, evidence) {
  if (!need(errors, path, evidence, isObject, "phải là object")) return;
  need(errors, `${path}.source`, evidence.source, isText, "bắt buộc — tên file hoặc nhãn nguồn");
  need(errors, `${path}.why`, evidence.why, isText, "bắt buộc — vì sao mẩu này chống đỡ luận điểm");
  need(
    errors,
    `${path}.chunk_id`,
    evidence.chunk_id,
    (value) => value === null || isInt(value),
    "phải là số nguyên hoặc null"
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ChapterResearchPackV1 — đầu vào của cả hai Artifact
   ═══════════════════════════════════════════════════════════════════ */

function validateResearchPack(pack) {
  const errors = [];
  if (!needEnvelope(errors, pack, CONTRACT_NAMES.research)) return { ok: false, errors };

  need(errors, "$.intent", pack.intent, isObject, "bắt buộc, object");
  if (isObject(pack.intent)) {
    need(errors, "$.intent.premise", pack.intent.premise, isText, "bắt buộc — tác giả muốn chương này làm gì");
  }
  need(errors, "$.chapter_contract", pack.chapter_contract, isObject, "bắt buộc, object");

  needEach(errors, "$.blocks", pack.blocks, {
    min: 0,
    each: (errs, path, block) => {
      if (!need(errs, path, block, isObject, "phải là object")) return;
      need(errs, `${path}.chunk_id`, block.chunk_id, (value) => value === null || isInt(value), "số nguyên hoặc null");
      need(errs, `${path}.source_file`, block.source_file, isText, "bắt buộc");
      need(errs, `${path}.text`, block.text, isText, "bắt buộc");
      need(errs, `${path}.channels`, block.channels, isArray, "phải là mảng kênh truy xuất");
      need(errs, `${path}.reason`, block.reason, isText, "bắt buộc — vì sao đoạn này được chọn");
    },
  });
  return { ok: errors.length === 0, errors };
}

/** Đưa một pack đọc từ file về hình dạng chuẩn, kể cả khi nó được xuất tay. */
function normalizeResearchPack(raw) {
  const pack = isObject(raw) ? raw : {};
  const intent = isObject(pack.intent) ? pack.intent : {};
  return {
    contract: CONTRACT_NAMES.research,
    schema_version: CONTRACT_VERSION,
    project_id: text(pack.project_id, "unknown-project"),
    chapter_number: int(pack.chapter_number, 0),
    generated_at: text(pack.generated_at, new Date().toISOString()),
    intent: {
      premise: text(intent.premise, ""),
      goals: textList(intent.goals),
      must_include: textList(intent.must_include),
      must_avoid: textList(intent.must_avoid),
      ...intent,
    },
    chapter_contract: isObject(pack.chapter_contract) ? pack.chapter_contract : {},
    recent_canon: isArray(pack.recent_canon) ? pack.recent_canon : [],
    open_loops: isArray(pack.open_loops) ? pack.open_loops : [],
    entities: isArray(pack.entities) ? pack.entities : [],
    blocks: (isArray(pack.blocks) ? pack.blocks : []).map((block, index) => ({
      chunk_id: isInt(block?.chunk_id) ? block.chunk_id : null,
      document_id: isInt(block?.document_id) ? block.document_id : null,
      source_file: text(block?.source_file, `nguồn-${index + 1}`),
      heading: text(block?.heading, ""),
      chapter_number: isInt(block?.chapter_number) ? block.chapter_number : null,
      text: text(block?.text, ""),
      token_count: int(block?.token_count, 0),
      channels: textList(block?.channels),
      reason: text(block?.reason, "không ghi lý do"),
      fused_score: typeof block?.fused_score === "number" ? block.fused_score : 0,
      pinned: block?.pinned === true,
      vetoed: block?.vetoed === true,
    })),
    trace: isObject(pack.trace) ? pack.trace : {},
    warnings: textList(pack.warnings),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ChapterBlueprintV1 — đầu ra hành động "plan" của Story Architect
   ═══════════════════════════════════════════════════════════════════ */

function validateBlueprint(blueprint) {
  const errors = [];
  if (!needEnvelope(errors, blueprint, CONTRACT_NAMES.blueprint)) return { ok: false, errors };

  needProducer(errors, "$.producer", blueprint.producer);
  need(errors, "$.input_hash", blueprint.input_hash, isText, "bắt buộc — hash của job đã sinh ra bản này");
  need(errors, "$.title", blueprint.title, isText, "bắt buộc");
  need(errors, "$.logline", blueprint.logline, isText, "bắt buộc — một câu tóm gọn chương");

  needEach(errors, "$.scenes", blueprint.scenes, {
    min: 1,
    each: (errs, path, scene) => {
      if (!need(errs, path, scene, isObject, "phải là object")) return;
      need(errs, `${path}.id`, scene.id, isText, "bắt buộc");
      need(errs, `${path}.order`, scene.order, isInt, "bắt buộc, số nguyên");
      need(errs, `${path}.purpose`, scene.purpose, isText, "bắt buộc — cảnh này tồn tại để làm gì");
      need(errs, `${path}.setting`, scene.setting, isText, "bắt buộc");
      need(errs, `${path}.target_words`, scene.target_words, isInt, "bắt buộc, số nguyên");
      needEach(errs, `${path}.beats`, scene.beats, {
        min: 1,
        each: (beatErrs, beatPath, beat) => need(beatErrs, beatPath, beat, isText, "phải là chuỗi khác rỗng"),
      });
      needEach(errs, `${path}.evidence`, scene.evidence, { min: 0, each: needEvidence });
    },
  });

  if (!need(errors, "$.continuity", blueprint.continuity, isObject, "bắt buộc, object")) {
    return { ok: false, errors };
  }
  needEach(errors, "$.continuity.carried_state", blueprint.continuity.carried_state, {
    min: 0,
    each: (errs, path, entry) => {
      if (!need(errs, path, entry, isObject, "phải là object")) return;
      need(errs, `${path}.subject`, entry.subject, isText, "bắt buộc");
      need(errs, `${path}.fact`, entry.fact, isText, "bắt buộc");
      needEach(errs, `${path}.evidence`, entry.evidence, { min: 0, each: needEvidence });
    },
  });
  needEach(errors, "$.continuity.contradictions", blueprint.continuity.contradictions, {
    min: 0,
    each: (errs, path, entry) => {
      if (!need(errs, path, entry, isObject, "phải là object")) return;
      need(errs, `${path}.claim`, entry.claim, isText, "bắt buộc");
      need(errs, `${path}.conflicts_with`, entry.conflicts_with, isText, "bắt buộc");
    },
  });

  need(errors, "$.guardrails", blueprint.guardrails, isObject, "bắt buộc, object");
  need(errors, "$.warnings", blueprint.warnings, isArray, "bắt buộc, mảng (có thể rỗng)");

  if (need(errors, "$.provenance", blueprint.provenance, isObject, "bắt buộc, object")) {
    need(errors, "$.provenance.research_input_hash", blueprint.provenance.research_input_hash, isText, "bắt buộc");
    need(errors, "$.provenance.blocks_used", blueprint.provenance.blocks_used, isArray, "bắt buộc, mảng chunk_id");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Ép JSON model trả về thành ChapterBlueprintV1.
 *
 * `context` mang những thứ model không được phép tự bịa: project, số
 * chương, input_hash của job, và danh sách chunk_id thật sự tồn tại
 * trong Research Pack. Model chỉ đóng góp phần nội dung.
 *
 * Nguyên tắc: normalize sửa HÌNH DẠNG, không sửa NỘI DUNG. Trường nào
 * mang ý nghĩa mà model bỏ trống thì để trống, cho validate bắt — điền
 * một chuỗi giữ chỗ vào đó chỉ làm một dàn ý rỗng trông như hợp lệ rồi
 * trôi thẳng vào canon.
 */
function normalizeBlueprint(raw, context) {
  const source = isObject(raw) ? raw : {};
  const known = new Set(context.knownChunkIds ?? []);
  const continuity = isObject(source.continuity) ? source.continuity : {};
  const guardrails = isObject(source.guardrails) ? source.guardrails : {};
  const usedChunkIds = new Set();

  const scenes = (isArray(source.scenes) ? source.scenes : []).map((scene, index) => {
    const entry = isObject(scene) ? scene : {};
    const evidence = normalizeEvidenceList(entry.evidence, known, usedChunkIds);
    return {
      id: text(entry.id, `scene-${index + 1}`),
      order: int(entry.order, index + 1),
      purpose: text(entry.purpose, ""),
      setting: text(entry.setting, ""),
      time: text(entry.time, ""),
      pov_character: text(entry.pov_character, context.pov ?? ""),
      characters: textList(entry.characters),
      beats: textList(entry.beats),
      conflict: text(entry.conflict, ""),
      turn: text(entry.turn, ""),
      exit_state: text(entry.exit_state, ""),
      target_words: int(entry.target_words, 0),
      evidence,
    };
  });

  const blocksUsed = [...usedChunkIds].sort((left, right) => left - right);
  const blocksUnused = [...known].filter((id) => !usedChunkIds.has(id)).sort((left, right) => left - right);

  return {
    contract: CONTRACT_NAMES.blueprint,
    schema_version: CONTRACT_VERSION,
    project_id: context.projectId,
    chapter_number: context.chapterNumber,
    job_id: context.jobId ?? null,
    input_hash: context.inputHash,
    producer: buildProducer(context),
    title: text(source.title, `Chương ${context.chapterNumber}`),
    logline: text(source.logline, ""),
    pov: text(source.pov, context.pov ?? ""),
    tense: text(source.tense, context.tense ?? ""),
    language: text(source.language, context.language ?? "vi"),
    target_words: int(source.target_words, context.targetWords ?? 0),
    scenes,
    continuity: {
      carried_state: (isArray(continuity.carried_state) ? continuity.carried_state : []).map((entry) => ({
        subject: text(entry?.subject, ""),
        fact: text(entry?.fact, ""),
        evidence: normalizeEvidenceList(entry?.evidence, known, usedChunkIds),
      })),
      open_loops_touched: (isArray(continuity.open_loops_touched) ? continuity.open_loops_touched : []).map((entry) => ({
        id: text(entry?.id, ""),
        action: oneOf(entry?.action, ["advance", "resolve", "deepen"], "advance"),
        note: text(entry?.note, ""),
      })),
      new_loops: (isArray(continuity.new_loops) ? continuity.new_loops : []).map((entry) => ({
        description: text(entry?.description, ""),
        payoff_horizon: text(entry?.payoff_horizon, "chưa xác định"),
      })),
      contradictions: (isArray(continuity.contradictions) ? continuity.contradictions : []).map((entry) => ({
        claim: text(entry?.claim, ""),
        conflicts_with: text(entry?.conflicts_with, ""),
        evidence: normalizeEvidenceList(entry?.evidence, known, usedChunkIds),
      })),
    },
    guardrails: {
      must_include: textList(guardrails.must_include),
      must_avoid: textList(guardrails.must_avoid),
      forbidden_words: textList(guardrails.forbidden_words),
    },
    risks: (isArray(source.risks) ? source.risks : []).map((entry) => ({
      risk: text(entry?.risk, ""),
      mitigation: text(entry?.mitigation, ""),
    })),
    warnings: textList(source.warnings),
    provenance: {
      research_input_hash: text(context.researchHash, context.inputHash),
      blocks_used: blocksUsed,
      blocks_unused: blocksUnused,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ChapterCommitDeltaV1 — đầu ra hành động "analyze"
   ═══════════════════════════════════════════════════════════════════ */

const PROJECTION_TYPES = [
  "summary",
  "scene",
  "event",
  "entity_state",
  "relationship",
  "character_knowledge",
  "timeline",
  "open_loop",
];

function validateCommitDelta(delta) {
  const errors = [];
  if (!needEnvelope(errors, delta, CONTRACT_NAMES.delta)) return { ok: false, errors };

  needProducer(errors, "$.producer", delta.producer);
  need(errors, "$.source_commit_id", delta.source_commit_id, isText, "bắt buộc — commit canon đang được phân tích");
  need(errors, "$.content_hash", delta.content_hash, isText, "bắt buộc");
  need(errors, "$.extractor_version", delta.extractor_version, isText, "bắt buộc");

  if (need(errors, "$.summary", delta.summary, isObject, "bắt buộc, object")) {
    need(errors, "$.summary.short", delta.summary.short, isText, "bắt buộc");
    need(errors, "$.summary.long", delta.summary.long, isText, "bắt buộc");
  }

  needEach(errors, "$.projections", delta.projections, {
    min: 1,
    each: (errs, path, projection) => {
      if (!need(errs, path, projection, isObject, "phải là object")) return;
      need(
        errs,
        `${path}.projection_type`,
        projection.projection_type,
        (value) => PROJECTION_TYPES.includes(value),
        `phải thuộc: ${PROJECTION_TYPES.join(", ")}`
      );
      need(errs, `${path}.subject_key`, projection.subject_key, isText, "bắt buộc");
      need(errs, `${path}.payload`, projection.payload, isObject, "bắt buộc, object");
      need(errs, `${path}.confidence`, projection.confidence, (value) => inRange(value, 0, 1), "phải nằm trong [0, 1]");
      // Span bằng chứng là thứ backend dùng để băm và để phát hiện xung
      // đột khi chương N bị sửa. Không có span thì projection không
      // replay được, nên nó là bắt buộc chứ không phải trang trí.
      if (!need(errs, `${path}.evidence`, projection.evidence, isObject, "bắt buộc, object")) return;
      const { start, end } = projection.evidence;
      need(errs, `${path}.evidence.start`, start, (value) => isInt(value) && value >= 0, "số nguyên >= 0");
      need(errs, `${path}.evidence.end`, end, (value) => isInt(value) && value > (isInt(start) ? start : -1), "số nguyên > start");
      need(errs, `${path}.evidence.quote`, projection.evidence.quote, isText, "bắt buộc — trích đúng nguyên văn");
    },
  });

  need(errors, "$.warnings", delta.warnings, isArray, "bắt buộc, mảng (có thể rỗng)");
  return { ok: errors.length === 0, errors };
}

/**
 * Ép JSON model trả về thành ChapterCommitDeltaV1.
 *
 * Span bằng chứng được xác minh lại bằng chính văn bản chương: nếu quote
 * không nằm đúng chỗ model khai, ta tự tìm lại; tìm không ra thì
 * projection bị loại và ghi vào warnings. Một span sai còn tệ hơn một
 * projection thiếu, vì backend sẽ băm nhầm đoạn và replay ra trạng thái
 * không có thật.
 */
function normalizeCommitDelta(raw, context) {
  const source = isObject(raw) ? raw : {};
  const summary = isObject(source.summary) ? source.summary : {};
  const chapterText = typeof context.chapterText === "string" ? context.chapterText : "";
  const warnings = textList(source.warnings);
  const projections = [];

  for (const entry of isArray(source.projections) ? source.projections : []) {
    const item = isObject(entry) ? entry : {};
    const quote = text(item.evidence?.quote, "");
    const located = locateQuote(chapterText, quote, int(item.evidence?.start, -1));
    if (!located) {
      warnings.push(
        `Bỏ projection "${text(item.subject_key, "?")}": không tìm thấy trích dẫn trong văn bản chương.`
      );
      continue;
    }
    projections.push({
      projection_type: oneOf(item.projection_type, PROJECTION_TYPES, "event"),
      subject_key: text(item.subject_key, ""),
      payload: isObject(item.payload) ? item.payload : { note: text(item.payload, "") },
      evidence: { start: located.start, end: located.end, quote: located.quote },
      confidence: inRange(item.confidence, 0, 1) ? item.confidence : 0.5,
    });
  }

  return {
    contract: CONTRACT_NAMES.delta,
    schema_version: CONTRACT_VERSION,
    project_id: context.projectId,
    chapter_number: context.chapterNumber,
    source_commit_id: text(context.sourceCommitId, "unknown-commit"),
    content_hash: text(context.contentHash, "unknown-hash"),
    producer: buildProducer(context),
    extractor_version: `${context.tool}/${context.toolVersion}`,
    summary: {
      short: text(summary.short, ""),
      long: text(summary.long, ""),
      scenes: (isArray(summary.scenes) ? summary.scenes : []).map((scene, index) => ({
        order: int(scene?.order, index + 1),
        title: text(scene?.title, `Cảnh ${index + 1}`),
        summary: text(scene?.summary, ""),
      })),
    },
    projections,
    contradictions: (isArray(source.contradictions) ? source.contradictions : []).map((entry) => ({
      claim: text(entry?.claim, ""),
      conflicts_with: text(entry?.conflicts_with, ""),
      note: text(entry?.note, ""),
    })),
    warnings,
  };
}

/**
 * Xác minh một trích dẫn nằm ở đâu trong văn bản.
 * Ưu tiên vị trí model khai; nếu sai thì tìm lần xuất hiện đầu tiên.
 */
function locateQuote(chapterText, quote, claimedStart) {
  if (!chapterText || !quote) return null;
  if (claimedStart >= 0 && chapterText.startsWith(quote, claimedStart)) {
    return { start: claimedStart, end: claimedStart + quote.length, quote };
  }
  const found = chapterText.indexOf(quote);
  if (found < 0) return null;
  return { start: found, end: found + quote.length, quote };
}

/* ═══════════════════════════════════════════════════════════════════
   WriterPackV1 — đầu vào của Chapter Writer
   ═══════════════════════════════════════════════════════════════════ */

function validateWriterPack(pack) {
  const errors = [];
  if (!needEnvelope(errors, pack, CONTRACT_NAMES.writer)) return { ok: false, errors };

  if (need(errors, "$.blueprint", pack.blueprint, isObject, "bắt buộc — Blueprint đã được tác giả duyệt")) {
    const nested = validateBlueprint(pack.blueprint);
    nested.errors.forEach((message) => errors.push(`$.blueprint${message.slice(1)}`));
  }
  need(errors, "$.chapter_contract", pack.chapter_contract, isObject, "bắt buộc, object");
  need(errors, "$.context_blocks", pack.context_blocks, isArray, "bắt buộc, mảng (có thể rỗng)");
  need(errors, "$.style", pack.style, isObject, "bắt buộc, object");
  return { ok: errors.length === 0, errors };
}

/** Gộp Research Pack đã duyệt + Blueprint đã duyệt thành một gói cho người viết. */
function buildWriterPack({ research, blueprint, style, previousTail }) {
  const pack = normalizeResearchPack(research);
  return {
    contract: CONTRACT_NAMES.writer,
    schema_version: CONTRACT_VERSION,
    project_id: blueprint.project_id ?? pack.project_id,
    chapter_number: blueprint.chapter_number ?? pack.chapter_number,
    chapter_contract: pack.chapter_contract,
    blueprint,
    context_blocks: pack.blocks.filter((block) => !block.vetoed),
    open_loops: pack.open_loops,
    entities: pack.entities,
    style: {
      voice_notes: text(style?.voice_notes, ""),
      sample_paragraphs: textList(style?.sample_paragraphs),
      forbidden_words: textList(style?.forbidden_words),
    },
    previous_tail: text(previousTail, ""),
    warnings: pack.warnings,
  };
}

function normalizeWriterPack(raw) {
  const source = isObject(raw) ? raw : {};
  const style = isObject(source.style) ? source.style : {};
  return {
    contract: CONTRACT_NAMES.writer,
    schema_version: CONTRACT_VERSION,
    project_id: text(source.project_id, "unknown-project"),
    chapter_number: int(source.chapter_number, 0),
    chapter_contract: isObject(source.chapter_contract) ? source.chapter_contract : {},
    blueprint: isObject(source.blueprint) ? source.blueprint : null,
    context_blocks: isArray(source.context_blocks) ? source.context_blocks : [],
    open_loops: isArray(source.open_loops) ? source.open_loops : [],
    entities: isArray(source.entities) ? source.entities : [],
    style: {
      voice_notes: text(style.voice_notes, ""),
      sample_paragraphs: textList(style.sample_paragraphs),
      forbidden_words: textList(style.forbidden_words),
    },
    previous_tail: text(source.previous_tail, ""),
    warnings: textList(source.warnings),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   ChapterDraftEnvelopeV1 — đầu ra "write" / "revise" của Chapter Writer
   ═══════════════════════════════════════════════════════════════════ */

const SELF_CHECK_STATUSES = ["not_run", "passed", "warned", "failed"];
const CHECK_STATUSES = ["pass", "warn", "fail"];

function validateDraftEnvelope(draft) {
  const errors = [];
  if (!needEnvelope(errors, draft, CONTRACT_NAMES.draft)) return { ok: false, errors };

  needProducer(errors, "$.producer", draft.producer);
  need(errors, "$.input_hash", draft.input_hash, isText, "bắt buộc");
  need(errors, "$.title", draft.title, isText, "bắt buộc");
  need(errors, "$.text", draft.text, isText, "bắt buộc — bản thảo không được rỗng");
  need(errors, "$.word_count", draft.word_count, (value) => isInt(value) && value > 0, "số nguyên > 0");
  need(errors, "$.char_count", draft.char_count, (value) => isInt(value) && value > 0, "số nguyên > 0");
  need(errors, "$.truncated", draft.truncated, (value) => typeof value === "boolean", "bắt buộc, boolean");

  needEach(errors, "$.scene_map", draft.scene_map, {
    min: 0,
    each: (errs, path, entry) => {
      if (!need(errs, path, entry, isObject, "phải là object")) return;
      need(errs, `${path}.scene_id`, entry.scene_id, isText, "bắt buộc");
      need(errs, `${path}.words`, entry.words, isInt, "bắt buộc, số nguyên");
    },
  });

  if (need(errors, "$.self_check", draft.self_check, isObject, "bắt buộc, object")) {
    need(
      errors,
      "$.self_check.status",
      draft.self_check.status,
      (value) => SELF_CHECK_STATUSES.includes(value),
      `phải thuộc: ${SELF_CHECK_STATUSES.join(", ")}`
    );
    needEach(errors, "$.self_check.checks", draft.self_check.checks, {
      min: 0,
      each: (errs, path, check) => {
        if (!need(errs, path, check, isObject, "phải là object")) return;
        need(errs, `${path}.id`, check.id, isText, "bắt buộc");
        need(errs, `${path}.label`, check.label, isText, "bắt buộc");
        need(
          errs,
          `${path}.status`,
          check.status,
          (value) => CHECK_STATUSES.includes(value),
          `phải thuộc: ${CHECK_STATUSES.join(", ")}`
        );
      },
    });
    need(errors, "$.self_check.unresolved_beats", draft.self_check.unresolved_beats, isArray, "bắt buộc, mảng");
  }

  need(errors, "$.warnings", draft.warnings, isArray, "bắt buộc, mảng (có thể rỗng)");
  if (need(errors, "$.provenance", draft.provenance, isObject, "bắt buộc, object")) {
    need(errors, "$.provenance.blueprint_title", draft.provenance.blueprint_title, isText, "bắt buộc");
    need(errors, "$.provenance.blocks_available", draft.provenance.blocks_available, isArray, "bắt buộc, mảng chunk_id");
  }
  return { ok: errors.length === 0, errors };
}

/** Đếm từ theo khoảng trắng — đủ cho cả tiếng Việt lẫn tiếng Anh. */
function countWords(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function buildDraftEnvelope({ prose, selfCheck, truncated, context }) {
  const body = String(prose ?? "");
  const blueprint = context.blueprint ?? {};
  const scenes = isArray(blueprint.scenes) ? blueprint.scenes : [];
  return {
    contract: CONTRACT_NAMES.draft,
    schema_version: CONTRACT_VERSION,
    project_id: context.projectId,
    chapter_number: context.chapterNumber,
    job_id: context.jobId ?? null,
    input_hash: context.inputHash,
    producer: buildProducer(context),
    title: text(blueprint.title, `Chương ${context.chapterNumber}`),
    text: body,
    word_count: countWords(body),
    char_count: body.length,
    truncated: truncated === true,
    scene_map: mapScenes(body, scenes),
    self_check: normalizeSelfCheck(selfCheck, scenes),
    warnings: textList(context.warnings),
    provenance: {
      blueprint_title: text(blueprint.title, `Chương ${context.chapterNumber}`),
      blueprint_scene_count: scenes.length,
      blocks_available: (context.blocksAvailable ?? []).filter(isInt),
      revision_of: context.revisionOf ?? null,
    },
  };
}

/**
 * Gán mỗi cảnh trong Blueprint một khoảng ký tự trong bản thảo.
 *
 * Người viết được yêu cầu đánh dấu ranh giới bằng chú thích HTML
 * `<!-- scene: id -->`; đánh dấu đó bị gỡ trước khi lưu nên không lọt vào
 * canon. Khi model quên đánh dấu, ta chia đều theo thứ tự cảnh thay vì
 * bịa ra ranh giới không có thật, và ghi rõ điều đó ở `matched`.
 */
const SCENE_MARK = /<!--\s*scene:\s*([\w.:-]+)\s*-->/g;

function mapScenes(body, scenes) {
  if (!scenes.length) return [];
  const marks = [];
  const pattern = new RegExp(SCENE_MARK.source, "g");
  let match;
  while ((match = pattern.exec(body)) !== null) {
    marks.push({ id: match[1], index: match.index, length: match[0].length });
  }
  if (marks.length === 0) {
    return scenes.map((scene) => ({
      scene_id: text(scene?.id, ""),
      start: 0,
      end: 0,
      words: 0,
      matched: false,
    }));
  }
  return marks.map((mark, index) => {
    const start = mark.index;
    const end = index + 1 < marks.length ? marks[index + 1].index : body.length;
    return {
      scene_id: mark.id,
      start,
      end,
      // Dấu đánh dấu không phải văn — đếm nó vào độ dài cảnh sẽ làm mọi
      // so sánh với target_words lệch lên đúng bốn từ mỗi cảnh.
      words: countWords(body.slice(start + mark.length, end)),
      matched: scenes.some((scene) => text(scene?.id, "") === mark.id),
    };
  });
}

function normalizeSelfCheck(raw, scenes) {
  if (!isObject(raw)) {
    return { status: "not_run", checks: [], unresolved_beats: [], notes: "" };
  }
  const checks = (isArray(raw.checks) ? raw.checks : []).map((entry, index) => ({
    id: text(entry?.id, `check-${index + 1}`),
    label: text(entry?.label, "không rõ"),
    status: oneOf(entry?.status, CHECK_STATUSES, "warn"),
    detail: text(entry?.detail, ""),
  }));
  const unresolved = (isArray(raw.unresolved_beats) ? raw.unresolved_beats : []).map((entry) => ({
    scene_id: text(entry?.scene_id, ""),
    beat: text(entry?.beat, ""),
  }));
  const known = new Set(scenes.map((scene) => text(scene?.id, "")));
  return {
    status: deriveSelfCheckStatus(checks),
    checks,
    unresolved_beats: unresolved.filter((entry) => !entry.scene_id || known.has(entry.scene_id) || known.size === 0),
    notes: text(raw.notes, ""),
  };
}

function deriveSelfCheckStatus(checks) {
  if (!checks.length) return "not_run";
  if (checks.some((check) => check.status === "fail")) return "failed";
  if (checks.some((check) => check.status === "warn")) return "warned";
  return "passed";
}

/* ═══════════════════════════════════════════════════════════════════
   ArtifactCheckpointV1 — trạng thái mang qua tài khoản khác
   ═══════════════════════════════════════════════════════════════════ */

function validateCheckpoint(checkpoint) {
  const errors = [];
  if (!need(errors, "$", checkpoint, isObject, "phải là JSON object")) return { ok: false, errors };
  need(errors, "$.contract", checkpoint.contract, (value) => value === CONTRACT_NAMES.checkpoint, `phải bằng "${CONTRACT_NAMES.checkpoint}"`);
  need(errors, "$.schema_version", checkpoint.schema_version, (value) => value === CONTRACT_VERSION, `phải bằng ${CONTRACT_VERSION}`);
  need(errors, "$.tool", checkpoint.tool, isText, "bắt buộc");
  need(errors, "$.tool_version", checkpoint.tool_version, isText, "bắt buộc");
  need(errors, "$.action", checkpoint.action, isText, "bắt buộc — hành động đang dở dang");
  need(errors, "$.exported_at", checkpoint.exported_at, isText, "bắt buộc");
  need(errors, "$.truncated", checkpoint.truncated, (value) => typeof value === "boolean", "bắt buộc, boolean");
  need(errors, "$.config", checkpoint.config, isObject, "bắt buộc, object");
  need(errors, "$.inputs", checkpoint.inputs, isObject, "bắt buộc, object");
  need(errors, "$.raw", checkpoint.raw, (value) => typeof value === "string", "bắt buộc, chuỗi (có thể rỗng)");
  return { ok: errors.length === 0, errors };
}

function buildCheckpoint({ tool, toolVersion, action, config, inputs, raw, truncated }) {
  return {
    contract: CONTRACT_NAMES.checkpoint,
    schema_version: CONTRACT_VERSION,
    tool,
    tool_version: toolVersion,
    action: text(action, "unknown"),
    exported_at: new Date().toISOString(),
    truncated: truncated === true,
    config: isObject(config) ? config : {},
    inputs: isObject(inputs) ? inputs : {},
    raw: typeof raw === "string" ? raw : "",
  };
}

/* ─── Trợ giúp dùng chung ─── */

function buildProducer(context) {
  return {
    tool: context.tool,
    tool_version: context.toolVersion,
    model: context.model,
    effort: context.effort ?? null,
    thinking: context.thinking ?? null,
    generated_at: new Date().toISOString(),
  };
}

function normalizeEvidenceList(raw, known, used) {
  return (isArray(raw) ? raw : [])
    .map((entry) => {
      const item = isObject(entry) ? entry : {};
      // Model hay bịa chunk_id. Chỉ giữ id thật sự có trong Research Pack;
      // id lạ bị hạ xuống null chứ không kéo theo cả mẩu bằng chứng, vì
      // phần `source` + `why` vẫn kiểm chứng được bằng mắt.
      const claimed = isInt(item.chunk_id) ? item.chunk_id : null;
      const chunkId = claimed !== null && known.has(claimed) ? claimed : null;
      if (chunkId !== null) used.add(chunkId);
      return {
        chunk_id: chunkId,
        source: text(item.source, ""),
        why: text(item.why, ""),
      };
    })
    // Bằng chứng thiếu nguồn hoặc thiếu lý do không kiểm chứng được bằng
    // mắt, nên nó bị bỏ chứ không được điền giữ chỗ rồi trôi qua validate.
    .filter((entry) => entry.source !== "" && entry.why !== "");
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function int(value, fallback) {
  if (isInt(value)) return value;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function textList(value) {
  if (!isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Bóc JSON ra khỏi đầu ra model. Model hay bọc rào ```json hoặc thêm lời
 * dẫn; cắt từ dấu ngoặc nhọn đầu tới dấu cuối là đủ cho cả hai.
 */
function extractJson(raw) {
  const body = String(raw ?? "").trim();
  if (!body) throw new Error("Model không trả về gì");
  const unfenced = body.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Không tìm thấy JSON object trong đầu ra model");
  }
  return JSON.parse(unfenced.slice(start, end + 1));
}
/* ── nội tuyến từ ../lib/runtime.mjs — sinh bởi artifacts/build.mjs, đừng sửa ở đây ── */
// ═══════════════════════════════════════════════════════════════════
//  Runtime dùng chung cho hai Artifact Co-Writer — CW-400 / CW-410
// ═══════════════════════════════════════════════════════════════════
// Gọi API, phân loại lỗi, phát tín hiệu cho Playwright sidecar. Không
// chứa UI, nên chạy được trong `node --test` y như trong Artifact.

const ARTIFACT_TOOL_VERSION = "1.0.0";

/**
 * Model và năng lực của nó, khai tường minh thay vì đoán từ tên.
 *
 * `thinking` là ba chế độ khác nhau về mặt API, không phải ba mức của
 * cùng một tham số:
 *   always   — Fable 5: luôn nghĩ, gửi bất kỳ cấu hình `thinking` nào là 400.
 *   adaptive — Opus 5 / 4.8 / Sonnet 5: `{type:"adaptive"}`.
 *   budget   — Haiku 4.5: vẫn dùng `budget_tokens` kiểu cũ.
 */
const MODELS = [
  {
    id: "claude-opus-5",
    label: "Opus 5 — khuyên dùng",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    thinking: "adaptive",
    thinkingOnByDefault: true,
    disableNeedsLowEffort: true,
    maxOutput: 128000,
  },
  {
    id: "claude-fable-5",
    label: "Fable 5 — mạnh nhất, đắt nhất",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    thinking: "always",
    maxOutput: 128000,
  },
  {
    id: "claude-opus-4-8",
    label: "Opus 4.8 — dự phòng khi Opus 5 từ chối",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    thinking: "adaptive",
    maxOutput: 128000,
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5 — nhanh, rẻ",
    efforts: ["low", "medium", "high", "xhigh", "max"],
    thinking: "adaptive",
    maxOutput: 128000,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5 — việc vặt",
    efforts: [],
    thinking: "budget",
    maxOutput: 64000,
  },
];

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_EFFORT = "high";

const API_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function modelInfo(id) {
  return MODELS.find((model) => model.id === id) ?? MODELS[0];
}

/**
 * Gắn cấu hình suy nghĩ và mức nỗ lực vào request theo đúng năng lực model.
 *
 * Một ràng buộc dễ vấp: trên Opus 5, tắt suy nghĩ chỉ hợp lệ ở effort
 * `high` trở xuống — cặp `disabled` + `xhigh`/`max` trả về 400. Ở đây ta
 * hạ effort xuống `high` thay vì để request chết, và ghi lại lựa chọn đó
 * để giao diện nói được vì sao mức nỗ lực bị đổi.
 */
function applyReasoning(body, { model, thinkingOn, effort }) {
  const info = modelInfo(model);
  const notes = [];
  let chosenEffort = effort;

  if (info.efforts.length === 0) {
    chosenEffort = null;
  } else if (!info.efforts.includes(effort)) {
    chosenEffort = "high";
    notes.push(`${info.id} không nhận effort "${effort}", đã dùng "high".`);
  }

  if (info.thinking === "always") {
    // Fable 5 luôn nghĩ; mọi cấu hình `thinking` đều bị từ chối.
    if (!thinkingOn) notes.push(`${info.id} luôn bật suy nghĩ, không tắt được.`);
  } else if (info.thinking === "budget") {
    if (thinkingOn) {
      const budget = Math.max(1024, Math.min(8000, Math.floor((body.max_tokens || 8000) / 2)));
      if ((body.max_tokens || 0) > budget + 512) body.thinking = { type: "enabled", budget_tokens: budget };
    }
  } else if (thinkingOn) {
    body.thinking = { type: "adaptive" };
  } else if (info.disableNeedsLowEffort && (chosenEffort === "xhigh" || chosenEffort === "max")) {
    chosenEffort = "high";
    notes.push(`${info.id} chỉ cho tắt suy nghĩ ở effort ≤ high, đã hạ xuống "high".`);
    body.thinking = { type: "disabled" };
  } else {
    body.thinking = { type: "disabled" };
  }

  if (chosenEffort) body.output_config = { ...(body.output_config ?? {}), effort: chosenEffort };
  return { body, effort: chosenEffort, notes };
}

/**
 * Đọc câu trả lời API thành một kết quả duy nhất mà UI xử lý được.
 *
 * Bốn kết cục có thật, không gộp được: xong, bị cắt vì hết token, bị
 * classifier từ chối, và hết hạn mức. Chỉ cái cuối mới đáng để runner
 * xoay tài khoản — ba cái kia xoay cũng vô ích.
 */
function readResponse(status, data) {
  if (status === 429 || isRateLimitPayload(data)) {
    return { outcome: "rate_limit", ...resetInfo(data) };
  }
  if (status >= 400 || data?.error) {
    return {
      outcome: "error",
      message: data?.error?.message ?? `API trả về ${status}`,
      type: data?.error?.type ?? "http_error",
      status,
    };
  }
  const text = (data?.content ?? [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  if (data?.stop_reason === "refusal") {
    return {
      outcome: "refusal",
      category: data?.stop_details?.category ?? null,
      message: data?.stop_details?.explanation ?? "Bộ lọc an toàn đã từ chối yêu cầu này.",
      text,
    };
  }
  return {
    outcome: "ok",
    text,
    truncated: data?.stop_reason === "max_tokens",
    stopReason: data?.stop_reason ?? null,
    model: data?.model ?? null,
    usage: {
      input: data?.usage?.input_tokens ?? 0,
      output: data?.usage?.output_tokens ?? 0,
    },
  };
}

function isRateLimitPayload(data) {
  const type = data?.error?.type ?? "";
  const message = typeof data?.error?.message === "string" ? data.error.message : "";
  return /rate.?limit|quota/i.test(type) || /rate.?limit|quota|resetsAt/i.test(message);
}

function resetInfo(data) {
  let resetsAt = null;
  try {
    const found = JSON.stringify(data ?? {}).match(/resetsAt\\?":\s*(\d{9,})/);
    if (found) resetsAt = Number.parseInt(found[1], 10);
  } catch {
    // Payload không tuần tự hoá được thì vẫn là rate limit, chỉ mất giờ reset.
  }
  return {
    resetsAt,
    resetTime: resetsAt ? new Date(resetsAt * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : null,
    message: data?.error?.message ?? "Tài khoản đã hết hạn mức.",
  };
}

/**
 * Một lượt gọi API.
 *
 * `fallbacks` giúp một chương bạo lực hoặc u ám bị classifier chặn vẫn
 * chạy tiếp trên Opus 4.8 thay vì dừng hẳn. Artifact chạy qua proxy của
 * claude.ai chứ không phải API thô, nên nếu proxy chưa biết tham số đó,
 * ta thử lại đúng một lần không kèm fallback thay vì để mọi request chết.
 */
async function callClaude(body, { fetchImpl = fetch, allowFallback = true } = {}) {
  const supportsFallback = allowFallback && modelInfo(body.model).thinking !== "budget";
  const request = supportsFallback ? { ...body, betas: [FALLBACK_BETA], fallbacks: "default" } : body;

  let response = await sendOnce(request, fetchImpl);
  if (supportsFallback && response.outcome === "error" && mentionsFallback(response.message)) {
    response = await sendOnce(body, fetchImpl);
    response.fallbackUnavailable = true;
  }
  return response;
}

async function sendOnce(body, fetchImpl) {
  try {
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return readResponse(res.status, data);
  } catch (error) {
    return { outcome: "error", message: `Lỗi kết nối: ${error.message}`, type: "network" };
  }
}

function mentionsFallback(message) {
  return /fallback|beta/i.test(String(message ?? ""));
}

/**
 * Nối tiếp một câu trả lời bị cắt vì hết token.
 *
 * Phần đã sinh được đưa lại làm lượt assistant rồi yêu cầu viết tiếp —
 * chỗ dừng nằm giữa chừng nên tuyệt đối không được mở lại từ đầu, kể cả
 * với JSON: hai nửa được nối ở dạng chuỗi thô rồi mới parse một lần.
 */
function continuationMessages(userPrompt, produced, instruction) {
  return [
    { role: "user", content: userPrompt },
    { role: "assistant", content: produced },
    { role: "user", content: instruction },
  ];
}

const CONTINUE_JSON =
  "Câu trả lời bị cắt vì hết token. VIẾT TIẾP từ đúng ký tự cuối cùng ở trên để ghép lại " +
  "thành một JSON object hợp lệ duy nhất. KHÔNG lặp lại phần đã có, KHÔNG mở lại dấu ngoặc " +
  "đầu tiên, KHÔNG thêm lời dẫn hay rào ```.";

const CONTINUE_PROSE =
  "Bản thảo bị cắt vì hết token. VIẾT TIẾP từ đúng chỗ dừng, giữ nguyên giọng văn, ngôi kể " +
  "và định dạng. KHÔNG lặp lại phần đã có, KHÔNG chào lại, KHÔNG tóm tắt phần trước. " +
  "Chỉ trả về phần còn thiếu.";

/**
 * Tín hiệu cho Playwright sidecar (`window.__nf_signal`).
 *
 * Sidecar chỉ xoay tài khoản khi thấy trạng thái `rate_limited`; mọi
 * trạng thái lỗi khác dừng job và giữ lại chẩn đoán.
 */
function emitSignal(tool, status, extra = {}) {
  if (typeof window === "undefined") return null;
  const signal = { tool, status, timestamp: Date.now(), ...extra };
  try {
    window.__nf_signal = signal;
  } catch {
    // Sandbox chặn ghi vào window thì mất tín hiệu, không mất kết quả.
  }
  return signal;
}

function clearSignal() {
  if (typeof window === "undefined") return;
  try {
    delete window.__nf_signal;
  } catch {
    // Không xoá được cũng không sao — lần chạy sau sẽ ghi đè.
  }
}

/** Trạng thái sidecar hiểu được, ánh xạ từ kết quả `callClaude`. */
function signalStatusFor(result) {
  switch (result.outcome) {
    case "rate_limit":
      return "rate_limited";
    case "refusal":
      return "error";
    case "error":
      return "error";
    default:
      return result.truncated ? "max_tokens" : "ready";
  }
}
/* ── nội tuyến từ ../lib/story-architect.mjs — sinh bởi artifacts/build.mjs, đừng sửa ở đây ── */
// ═══════════════════════════════════════════════════════════════════
//  Story Architect — lõi thuần, không UI (CW-400)
// ═══════════════════════════════════════════════════════════════════
// Hai hành động: `plan` biến Research Pack đã duyệt thành Blueprint;
// `analyze` biến một chương đã nhập canon thành ChapterCommitDelta.
//
// Toàn bộ phần quyết định nằm ở đây để test chạy đúng đoạn mã Artifact
// chạy, thay vì một bản chép lại.


const TOOL_NAME = "story_architect";
const TOOL_VERSION = ARTIFACT_TOOL_VERSION;
const ACTIONS = ["plan", "analyze", "continue"];

const MAX_BLOCK_CHARS = 4000;
const MAX_CHAPTER_CHARS = 120000;

/* ─── Dựng ngữ cảnh (thứ model không được phép tự bịa) ─── */

function planContext(pack, config) {
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

function analyzeContext(pack, config, chapterText) {
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

function buildPlanPrompt(pack, config) {
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
function finishPlan(raw, context) {
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

function buildAnalyzePrompt(chapterText, pack, config) {
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

function finishAnalyze(raw, context) {
  const parsed = extractJson(raw);
  const envelope = normalizeCommitDelta(parsed, context);
  return { envelope, validation: validateCommitDelta(envelope) };
}

/* ─── Kết xuất cho con người ─── */

function blueprintMarkdown(blueprint) {
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

/* ─── ICONS ─── */
const IconUp = ({ s = 15 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
const IconDown = ({ s = 15 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const IconPlay = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IconCopy = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const IconSpin = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "sa-spin 1s linear infinite" }}><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.9" y1="4.9" x2="7.8" y2="7.8" /><line x1="16.2" y1="16.2" x2="19.1" y2="19.1" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.9" y1="19.1" x2="7.8" y2="16.2" /><line x1="16.2" y1="7.8" x2="19.1" y2="4.9" /></svg>;

/* ─── STYLE ─── */
const C = {
  bg: "#0B1020", panel: "#141B32", panel2: "#0F1527", border: "#25304F",
  text: "#E8EAF2", dim: "#98A2C0", accent: "#818CF8", accent2: "#A78BFA",
  ok: "#34D399", warn: "#FBBF24", danger: "#F87171", input: "#080D1A",
};
const box = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 };
const inp = { width: "100%", background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
const btn = (bg, fg = "#0B1020") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
const ghost = { ...btn("transparent", C.text), border: `1px solid ${C.border}`, fontWeight: 600 };
const cap = { display: "block", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: C.dim, marginBottom: 5, fontWeight: 700 };
const chip = (color) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: `${color}1F`, color, border: `1px solid ${color}55`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 });
const hidden = { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" };

const MAX_CONTINUES = 3;
// Trần 16K cho mỗi lượt: request không stream vượt ngưỡng đó có nguy cơ
// chết vì timeout HTTP trước khi model viết xong. Bản dài đi tiếp bằng
// vòng nối, không bằng cách nâng trần.
const RUN_MAX_TOKENS = 16000;

/** Trạng thái sidecar hiểu; "invalid" phải hạ về "error" để job dừng thay vì treo. */
const PHASE_META = {
  idle: [C.dim, "chờ", "idle"],
  running: [C.accent, "đang chạy", "running"],
  continuing: [C.warn, "đang nối tiếp", "running"],
  truncated: [C.warn, "còn dở dang", "max_tokens"],
  max_tokens: [C.warn, "bị cắt", "max_tokens"],
  rate_limited: [C.warn, "hết hạn mức", "rate_limited"],
  invalid: [C.danger, "sai hợp đồng", "error"],
  error: [C.danger, "lỗi", "error"],
  ready: [C.ok, "xong", "done"],
};

export default function StoryArchitect() {
  /* ── cấu hình ── */
  const [action, setAction] = useState("plan");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [effort, setEffort] = useState(DEFAULT_EFFORT);
  const [thinkingOn, setThinkingOn] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [jobId, setJobId] = useState("");
  const [inputHash, setInputHash] = useState("");
  const [projectId, setProjectId] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [sourceCommitId, setSourceCommitId] = useState("");
  const [contentHash, setContentHash] = useState("");

  /* ── đầu vào ── */
  const [pack, setPack] = useState(null);
  const [packName, setPackName] = useState("");
  const [packIssues, setPackIssues] = useState([]);
  const [chapterText, setChapterText] = useState("");
  const [chapterName, setChapterName] = useState("");

  /* ── kết quả ── */
  const [raw, setRaw] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [envelope, setEnvelope] = useState(null);
  const [issues, setIssues] = useState([]);
  const [lastAction, setLastAction] = useState("");

  /* ── vòng đời ── */
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [toast, setToast] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const [notes, setNotes] = useState([]);

  const promptRef = useRef(null);
  const packFileRef = useRef(null);
  const chapterFileRef = useRef(null);
  const checkpointFileRef = useRef(null);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  const info = useMemo(() => modelInfo(model), [model]);
  const resultText = useMemo(() => (envelope ? JSON.stringify(envelope, null, 2) : ""), [envelope]);
  const validResult = envelope && issues.length === 0 ? resultText : "";
  const chapterOk = Number.isInteger(Number.parseInt(chapterNumber, 10));
  const ready = action === "plan" ? !!pack : chapterText.trim().length > 0 && chapterOk;

  const say = (message) => setToast(message);

  /* ─────────────── nạp đầu vào ─────────────── */

  const applyResearch = useCallback((body, name) => {
    try {
      const normalized = normalizeResearchPack(JSON.parse(body));
      const check = validateResearchPack(normalized);
      setPack(normalized);
      setPackName(name || "research-pack.json");
      setPackIssues(check.errors);
      setProjectId((current) => current || normalized.project_id);
      setChapterNumber((current) => current || String(normalized.chapter_number));
      setError("");
      say(check.ok ? `✓ Đã nạp Research Pack (${normalized.blocks.length} khối tư liệu)` : "⚠ Nạp được nhưng Research Pack có cảnh báo");
      return true;
    } catch (failure) {
      setError(`Research Pack lỗi: ${failure.message}`);
      return false;
    }
  }, []);

  const applyChapter = useCallback((body, name) => {
    const content = String(body ?? "");
    setChapterText(content);
    setChapterName(name || "chuong.md");
    setError("");
    say(`✓ Đã nạp chương (${content.length.toLocaleString()} ký tự)`);
    return true;
  }, []);

  const applyCheckpoint = useCallback((data) => {
    const check = validateCheckpoint(data);
    if (!check.ok) { setError(`Checkpoint lỗi: ${check.errors.join(" · ")}`); return false; }
    if (data.tool !== TOOL_NAME) { setError(`Checkpoint của công cụ "${data.tool}", không phải ${TOOL_NAME}`); return false; }

    const config = data.config ?? {};
    if (config.model) setModel(config.model);
    if (config.effort) setEffort(config.effort);
    if (typeof config.thinkingOn === "boolean") setThinkingOn(config.thinkingOn);
    if (typeof config.instructions === "string") setInstructions(config.instructions);
    if (config.jobId) setJobId(config.jobId);
    if (config.inputHash) setInputHash(config.inputHash);
    if (config.projectId) setProjectId(config.projectId);
    if (config.sourceCommitId) setSourceCommitId(config.sourceCommitId);
    if (config.contentHash) setContentHash(config.contentHash);
    if (config.chapterNumber != null) setChapterNumber(String(config.chapterNumber));

    if (typeof data.inputs?.research === "string") applyResearch(data.inputs.research, data.inputs.research_name);
    if (typeof data.inputs?.chapter === "string") applyChapter(data.inputs.chapter, data.inputs.chapter_name);

    setAction(data.action === "analyze" ? "analyze" : "plan");
    setLastAction(data.action === "analyze" ? "analyze" : "plan");
    setRaw(data.raw ?? "");
    setTruncated(data.truncated === true);
    setEnvelope(null);
    setIssues([]);
    promptRef.current = null;
    setPhase(data.truncated ? "truncated" : "idle");
    say(data.truncated ? "⚠ Checkpoint còn dở dang — bấm “Chạy tiếp”" : "✓ Đã nạp checkpoint");
    return true;
  }, [applyResearch, applyChapter]);

  const readFile = (event, handler) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handler(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
    event.target.value = "";
  };

  /* ─────────────── chạy ─────────────── */

  const currentConfig = useCallback(() => ({
    model,
    effort,
    thinkingOn,
    instructions,
    jobId: jobId || null,
    inputHash: inputHash || "manual",
    researchHash: inputHash || "manual",
    projectId: projectId || pack?.project_id || "unknown-project",
    chapterNumber: Number.parseInt(chapterNumber, 10),
    sourceCommitId: sourceCommitId || "unknown-commit",
    contentHash: contentHash || "unknown-hash",
  }), [model, effort, thinkingOn, instructions, jobId, inputHash, projectId, chapterNumber, sourceCommitId, contentHash, pack]);

  const finish = useCallback((which, body, wasTruncated) => {
    const config = currentConfig();
    const context = which === "plan" ? planContext(pack, config) : analyzeContext(pack, config, chapterText);
    const outcome = which === "plan" ? finishPlan(body, context) : finishAnalyze(body, context);
    setEnvelope(outcome.envelope);
    setIssues(outcome.validation.errors);
    setLastAction(which);

    if (!outcome.validation.ok) {
      setPhase("invalid");
      emitSignal(TOOL_NAME, "error", { action: which, reason: "contract_invalid", errors: outcome.validation.errors.slice(0, 8) });
      say(`⚠ Kết quả chưa khớp hợp đồng (${outcome.validation.errors.length} lỗi)`);
      return;
    }
    setPhase(wasTruncated ? "max_tokens" : "ready");
    emitSignal(TOOL_NAME, wasTruncated ? "max_tokens" : "ready", {
      action: which,
      contract: outcome.envelope.contract,
      chapter: outcome.envelope.chapter_number,
    });
    say(`✓ ${which === "plan" ? "Blueprint" : "Commit delta"} hợp lệ`);
  }, [currentConfig, pack, chapterText]);

  /**
   * Một lượt chạy trọn vẹn, kể cả phần nối tiếp.
   *
   * JSON dài bị cắt vì hết token là chuyện thường, nên vòng lặp tự nối
   * thêm tối đa MAX_CONTINUES lượt. Hết hạn mức thì dừng ngay và giữ
   * nguyên phần đã sinh — sidecar đọc tín hiệu, lấy checkpoint, rồi mới
   * xoay tài khoản; nối tiếp lúc đó là ném đi công đã làm.
   */
  const execute = useCallback(async (which, { resume = false } = {}) => {
    if (busy) return;
    const config = currentConfig();

    if (which === "plan" && !pack) { setError("Cần nạp Research Pack trước khi lập dàn ý."); return; }
    if (which === "analyze" && !chapterText.trim()) { setError("Cần nạp văn bản chương trước khi phân tích."); return; }
    if (which === "analyze" && !Number.isInteger(config.chapterNumber)) { setError("Cần điền số chương trước khi phân tích."); return; }

    setBusy(true);
    setError("");
    setNotes([]);
    setPhase("running");
    emitSignal(TOOL_NAME, "generating", { action: which, resumed: resume });

    let prompt = promptRef.current;
    if (!resume || !prompt) {
      prompt = which === "plan" ? buildPlanPrompt(pack, config) : buildAnalyzePrompt(chapterText, pack, config);
      promptRef.current = prompt;
    }

    let produced = resume ? raw : "";
    if (!resume) { setRaw(""); setEnvelope(null); setIssues([]); setUsage(null); setTruncated(false); }

    try {
      for (let round = 0; round <= MAX_CONTINUES; round += 1) {
        const request = {
          model: config.model,
          max_tokens: Math.min(RUN_MAX_TOKENS, modelInfo(config.model).maxOutput),
          system: prompt.system,
          messages: produced
            ? continuationMessages(prompt.user, produced, CONTINUE_JSON)
            : [{ role: "user", content: prompt.user }],
        };
        const tuned = applyReasoning(request, { model: config.model, thinkingOn: config.thinkingOn, effort: config.effort });
        if (tuned.notes.length) setNotes(tuned.notes);

        const result = await callClaude(tuned.body);

        if (result.outcome === "rate_limit") {
          setRaw(produced);
          setTruncated(true);
          setPhase("rate_limited");
          setError(`Hết hạn mức${result.resetTime ? ` — reset lúc ${result.resetTime}` : ""}. Xuất checkpoint rồi chạy tiếp ở tài khoản khác.`);
          emitSignal(TOOL_NAME, "rate_limited", { action: which, resetsAt: result.resetsAt, resetTime: result.resetTime });
          return;
        }
        if (result.outcome === "refusal") {
          setRaw(produced);
          setPhase("error");
          setError(`Bộ lọc an toàn từ chối${result.category ? ` (${result.category})` : ""}. Thử đổi sang Opus 4.8 hoặc viết lại chỉ thị.`);
          emitSignal(TOOL_NAME, "error", { action: which, reason: "refusal", category: result.category });
          return;
        }
        if (result.outcome === "error") {
          setRaw(produced);
          setPhase("error");
          setError(result.message);
          emitSignal(TOOL_NAME, "error", { action: which, message: result.message });
          return;
        }

        produced += result.text;
        setRaw(produced);
        setUsage(result.usage);
        if (!result.truncated) {
          setTruncated(false);
          finish(which, produced, false);
          return;
        }
        setTruncated(true);
        setPhase("continuing");
      }

      // Nối đủ số lượt vẫn chưa xong: giữ nguyên phần đã có và nói thẳng,
      // thay vì parse một JSON còn dở rồi báo lỗi hợp đồng khó hiểu.
      setPhase("truncated");
      setError(`Vẫn bị cắt sau ${MAX_CONTINUES} lượt nối. Hạ mức nỗ lực, rút gọn Research Pack, hoặc bấm “Chạy tiếp”.`);
      emitSignal(TOOL_NAME, "max_tokens", { action: which });
    } catch (failure) {
      setPhase("error");
      setError(`Lỗi không lường trước: ${failure.message}`);
      emitSignal(TOOL_NAME, "error", { action: which, message: failure.message });
    } finally {
      setBusy(false);
    }
  }, [busy, currentConfig, pack, chapterText, raw, finish]);

  /* ─────────────── xuất / nhập ─────────────── */

  const download = (content, name, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement("a"), { href: url, download: name });
    // Sandbox iframe chặn click trên anchor rời DOM — phải gắn vào body trước.
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 200);
  };

  const checkpointData = useCallback(() => buildCheckpoint({
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    action: lastAction || action,
    truncated,
    config: { model, effort, thinkingOn, instructions, jobId, inputHash, projectId, sourceCommitId, contentHash, chapterNumber },
    inputs: {
      research: pack ? JSON.stringify(pack) : null,
      research_name: packName,
      chapter: chapterText || null,
      chapter_name: chapterName,
    },
    raw,
  }), [lastAction, action, truncated, model, effort, thinkingOn, instructions, jobId, inputHash, projectId, sourceCommitId, contentHash, chapterNumber, pack, packName, chapterText, chapterName, raw]);

  const exportResult = () => {
    if (!envelope) return;
    download(resultText, `${envelope.contract}-ch${envelope.chapter_number}.json`, "application/json");
  };
  const exportMarkdown = () => {
    if (envelope?.contract !== CONTRACT_NAMES.blueprint) return;
    download(blueprintMarkdown(envelope), `blueprint-ch${envelope.chapter_number}.md`, "text/markdown");
  };
  const exportCheckpoint = () => download(JSON.stringify(checkpointData(), null, 2), `story-architect-checkpoint-${Date.now()}.json`, "application/json");
  const copyResult = () => { navigator.clipboard?.writeText(resultText); say("✓ Đã chép kết quả"); };

  const resetAll = (force) => {
    if (!force && !clearArmed) {
      setClearArmed(true);
      setTimeout(() => setClearArmed(false), 4000);
      say("Bấm “Reset” lần nữa để xoá sạch");
      return;
    }
    setClearArmed(false);
    clearSignal();
    promptRef.current = null;
    setPack(null); setPackName(""); setPackIssues([]);
    setChapterText(""); setChapterName("");
    setRaw(""); setTruncated(false); setEnvelope(null); setIssues([]); setLastAction("");
    setUsage(null); setError(""); setNotes([]); setPhase("idle");
    setJobId(""); setInputHash(""); setProjectId(""); setChapterNumber(""); setSourceCommitId(""); setContentHash("");
    setInstructions("");
    say("Đã reset — dữ liệu đã sạch hoàn toàn");
  };

  /* ─────────────── BRIDGE __nf_ctl ─────────────── */

  // Runner gọi bridge ngoài vòng render của React, nên mọi thứ nó cần đi
  // qua một ref được gán lại mỗi lần render. Đóng gói trực tiếp vào
  // window sẽ khoá cứng state của lần render đầu tiên.
  const live = useRef({});
  live.current = {
    execute, checkpointData, resetAll, applyResearch, applyChapter, applyCheckpoint,
    lastAction: lastAction || action,
    result: () => (envelope && issues.length === 0 ? resultText : null),
    set: {
      setAction, setModel, setEffort, setThinkingOn, setInstructions,
      setJobId, setInputHash, setProjectId, setChapterNumber, setSourceCommitId, setContentHash,
    },
  };

  useEffect(() => {
    window.__nf_ctl = {
      tool: TOOL_NAME,
      version: TOOL_VERSION,
      schema: {
        contracts: { plan: CONTRACT_NAMES.blueprint, analyze: CONTRACT_NAMES.delta },
        config: [
          { key: "action", type: "enum", options: ["plan", "analyze"] },
          { key: "model", type: "model", options: MODELS.map((entry) => entry.id) },
          { key: "effort", type: "enum", options: EFFORTS },
          { key: "thinkingOn", type: "bool" },
          { key: "instructions", type: "text" },
          { key: "jobId", type: "string" },
          { key: "inputHash", type: "string" },
          { key: "projectId", type: "string" },
          { key: "chapterNumber", type: "int" },
          { key: "sourceCommitId", type: "string", note: "chỉ dùng cho analyze" },
          { key: "contentHash", type: "string", note: "chỉ dùng cho analyze" },
        ],
        imports: [
          { slot: "research", label: "ChapterResearchPackV1 (.json)", accept: ".json" },
          { slot: "chapter", label: "Chương đã nhập canon (.md/.txt)", accept: ".md,.txt" },
          { slot: "checkpoint", label: "Checkpoint (.json)", accept: ".json" },
        ],
        actions: [
          { id: "plan", label: "Lập dàn ý chương" },
          { id: "analyze", label: "Phân tích chương canon" },
          { id: "continue", label: "Chạy tiếp phần bị cắt" },
        ],
        outputs: ["result", "checkpoint"],
      },
      configure(config = {}) {
        const set = live.current.set;
        if (config.action === "plan" || config.action === "analyze") set.setAction(config.action);
        if (config.model) set.setModel(String(config.model));
        if (config.effort) set.setEffort(String(config.effort));
        if (typeof config.thinkingOn === "boolean") set.setThinkingOn(config.thinkingOn);
        if (config.instructions != null) set.setInstructions(String(config.instructions));
        if (config.jobId) set.setJobId(String(config.jobId));
        if (config.inputHash) set.setInputHash(String(config.inputHash));
        if (config.projectId) set.setProjectId(String(config.projectId));
        if (config.chapterNumber != null) set.setChapterNumber(String(config.chapterNumber));
        if (config.sourceCommitId) set.setSourceCommitId(String(config.sourceCommitId));
        if (config.contentHash) set.setContentHash(String(config.contentHash));
        return true;
      },
      importFile(slot, name, body) {
        try {
          if (slot === "research") return live.current.applyResearch(String(body), name);
          if (slot === "chapter") return live.current.applyChapter(String(body), name);
          if (slot === "checkpoint") return live.current.applyCheckpoint(JSON.parse(String(body)));
          return false;
        } catch {
          return false;
        }
      },
      run(requested) {
        const wanted = typeof requested === "string" && requested.trim() ? requested.trim() : "plan";
        if (wanted === "continue") {
          live.current.execute(live.current.lastAction, { resume: true });
          return true;
        }
        if (wanted !== "plan" && wanted !== "analyze") return `ERR: hành động không hợp lệ: ${wanted}`;
        live.current.set.setAction(wanted);
        live.current.execute(wanted);
        return true;
      },
      getState() { return window.__nf_signal || null; },
      getResult() { try { return live.current.result(); } catch { return null; } },
      getCheckpoint() { try { return JSON.stringify(live.current.checkpointData(), null, 2); } catch { return null; } },
      reset() { try { live.current.resetAll(true); return true; } catch { return false; } },
    };
    return () => {
      try { delete window.__nf_ctl; } catch { /* sandbox chặn thì thôi */ }
      clearSignal();
    };
  }, []);

  /* ─────────────── GIAO DIỆN ─────────────── */

  const [phaseColor, phaseLabel, wireState] = PHASE_META[phase] ?? [C.dim, phase, phase];

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: 18, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{`@keyframes sa-spin{to{transform:rotate(360deg)}} *{scrollbar-width:thin;scrollbar-color:${C.border} transparent}`}</style>

      {/* Đường DOM dự phòng khi bridge không dựng được. Chỉ trả kết quả
          đã qua hợp đồng, để một envelope hỏng không lọt vào canon. */}
      <textarea data-selorson-result readOnly value={validResult} style={hidden} tabIndex={-1} aria-hidden="true" />
      <span data-selorson-state style={hidden} aria-hidden="true">{wireState}</span>

      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>Kiến Trúc Sư Cốt Truyện</div>
        <span style={chip(C.accent2)}>{TOOL_NAME} v{TOOL_VERSION}</span>
        <span style={chip(phaseColor)}>{phaseLabel}</span>
        {usage && <span style={chip(C.dim)}>{usage.input.toLocaleString()} vào · {usage.output.toLocaleString()} ra</span>}
        <div style={{ marginLeft: "auto", fontSize: 12, color: C.dim }}>Selorson Co-Writer · CW-400</div>
      </header>

      {error && (
        <div style={{ ...box, borderColor: `${C.danger}66`, background: `${C.danger}14`, marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: C.danger }}>Lỗi.</strong> {error}
        </div>
      )}
      {notes.length > 0 && (
        <div style={{ ...box, borderColor: `${C.warn}55`, background: `${C.warn}12`, marginBottom: 14, fontSize: 12.5 }}>
          {notes.map((note, index) => <div key={index}>· {note}</div>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 14, alignItems: "start" }}>
        {/* ── CỘT TRÁI ── */}
        <div style={{ display: "grid", gap: 12 }}>
          <section style={box}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>1 · Việc cần làm</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[["plan", "Lập dàn ý"], ["analyze", "Phân tích canon"]].map(([id, title]) => (
                <button key={id} onClick={() => setAction(id)} style={{ ...(action === id ? btn(C.accent) : ghost), flex: 1, justifyContent: "center" }}>{title}</button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
              {action === "plan"
                ? "Đọc Research Pack đã được tác giả duyệt rồi dựng ChapterBlueprintV1: chia cảnh, beat, trạng thái mang sang, và tư liệu chống đỡ cho từng cảnh."
                : "Đọc một chương đã nhập canon rồi rút ChapterCommitDeltaV1: tóm tắt, sự kiện, trạng thái nhân vật, quan hệ, mốc thời gian — mỗi mục kèm trích dẫn nguyên văn."}
            </p>
          </section>

          <section style={box}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>2 · Nguồn</div>

            <div style={{ marginBottom: 12 }}>
              <span style={cap}>Research Pack {action === "plan" && <em style={{ color: C.accent2, fontStyle: "normal" }}>· bắt buộc</em>}</span>
              <input ref={packFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={(event) => readFile(event, applyResearch)} />
              <button onClick={() => packFileRef.current?.click()} style={{ ...ghost, width: "100%", justifyContent: "center" }}><IconUp /> {packName || "Chọn ChapterResearchPackV1 (.json)"}</button>
              {pack && (
                <div style={{ marginTop: 7, fontSize: 12, color: C.dim }}>
                  <code style={{ color: C.text }}>{pack.project_id}</code> · chương {pack.chapter_number} · {pack.blocks.length} khối
                  {packIssues.length > 0 && <div style={{ color: C.warn, marginTop: 4 }}>⚠ {packIssues.length} cảnh báo — {packIssues[0]}</div>}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={cap}>Chương đã nhập canon {action === "analyze" && <em style={{ color: C.accent2, fontStyle: "normal" }}>· bắt buộc</em>}</span>
              <input ref={chapterFileRef} type="file" accept=".md,.txt" style={{ display: "none" }} onChange={(event) => readFile(event, applyChapter)} />
              <button onClick={() => chapterFileRef.current?.click()} style={{ ...ghost, width: "100%", justifyContent: "center" }}><IconUp /> {chapterName || "Chọn văn bản chương (.md/.txt)"}</button>
              {chapterText && <div style={{ marginTop: 7, fontSize: 12, color: C.dim }}>{chapterText.length.toLocaleString()} ký tự · {countWords(chapterText).toLocaleString()} từ</div>}
            </div>

            <div>
              <span style={cap}>Checkpoint</span>
              <input ref={checkpointFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={(event) => readFile(event, (body) => { try { applyCheckpoint(JSON.parse(body)); } catch (failure) { setError(`Checkpoint lỗi: ${failure.message}`); } })} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => checkpointFileRef.current?.click()} style={{ ...ghost, flex: 1, justifyContent: "center" }}><IconUp /> Nạp</button>
                <button onClick={exportCheckpoint} style={{ ...ghost, flex: 1, justifyContent: "center" }}><IconDown /> Xuất</button>
              </div>
            </div>
          </section>

          <section style={box}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>3 · Model</div>
            <div style={{ marginBottom: 10 }}>
              <span style={cap}>Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} style={inp}>
                {MODELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <span style={cap}>Mức nỗ lực</span>
                <select value={effort} onChange={(event) => setEffort(event.target.value)} disabled={info.efforts.length === 0} style={{ ...inp, opacity: info.efforts.length ? 1 : 0.5 }}>
                  {EFFORTS.map((level) => <option key={level} value={level} disabled={!info.efforts.includes(level)}>{level}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, paddingBottom: 9, cursor: info.thinking === "always" ? "not-allowed" : "pointer", opacity: info.thinking === "always" ? 0.55 : 1 }}>
                <input type="checkbox" checked={thinkingOn || info.thinking === "always"} disabled={info.thinking === "always"} onChange={(event) => setThinkingOn(event.target.checked)} />
                Suy nghĩ
              </label>
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={cap}>Chỉ thị thêm của tác giả</span>
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="Ví dụ: giữ nhịp chậm, đặt trọng tâm vào mâu thuẫn giữa hai anh em." style={{ ...inp, resize: "vertical" }} />
            </div>
          </section>

          <section style={box}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>4 · Định danh</div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
              Backend từ chối kết quả không khớp job. Runner tự điền qua bridge; chạy tay thì chép từ gói xuất ra.
            </p>
            <div style={{ display: "grid", gap: 9 }}>
              <div><span style={cap}>job_id</span><input value={jobId} onChange={(event) => setJobId(event.target.value)} style={inp} placeholder="để trống nếu chạy tay" /></div>
              <div><span style={cap}>input_hash</span><input value={inputHash} onChange={(event) => setInputHash(event.target.value)} style={inp} placeholder="manual" /></div>
              <div><span style={cap}>project_id</span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} style={inp} /></div>
              <div>
                <span style={cap}>số chương {action === "analyze" && !chapterOk && <em style={{ color: C.warn, fontStyle: "normal" }}>· bắt buộc</em>}</span>
                <input value={chapterNumber} onChange={(event) => setChapterNumber(event.target.value)} style={inp} inputMode="numeric" />
              </div>
              {action === "analyze" && (
                <>
                  <div><span style={cap}>source_commit_id</span><input value={sourceCommitId} onChange={(event) => setSourceCommitId(event.target.value)} style={inp} /></div>
                  <div><span style={cap}>content_hash</span><input value={contentHash} onChange={(event) => setContentHash(event.target.value)} style={inp} /></div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* ── CỘT PHẢI ── */}
        <div style={{ display: "grid", gap: 12 }}>
          <section style={{ ...box, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button data-selorson-run onClick={() => execute(action)} disabled={busy || !ready} style={{ ...btn(ready && !busy ? C.accent : C.border, ready && !busy ? "#0B1020" : C.dim), cursor: busy || !ready ? "not-allowed" : "pointer" }}>
              {busy ? <IconSpin /> : <IconPlay />} {busy ? "Đang chạy…" : action === "plan" ? "Lập dàn ý" : "Phân tích chương"}
            </button>
            {raw && (truncated || phase === "truncated" || phase === "rate_limited") && (
              <button onClick={() => execute(lastAction || action, { resume: true })} disabled={busy} style={btn(C.warn)}>Chạy tiếp</button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={copyResult} disabled={!envelope} style={{ ...ghost, opacity: envelope ? 1 : 0.45 }}><IconCopy /> Chép JSON</button>
            <button onClick={exportResult} disabled={!envelope} style={{ ...ghost, opacity: envelope ? 1 : 0.45 }}><IconDown /> Xuất JSON</button>
            {envelope?.contract === CONTRACT_NAMES.blueprint && <button onClick={exportMarkdown} style={ghost}><IconDown /> Markdown</button>}
            <button onClick={() => resetAll(false)} style={{ ...ghost, borderColor: clearArmed ? C.danger : C.border, color: clearArmed ? C.danger : C.text }}>{clearArmed ? "Bấm lần nữa" : "Reset"}</button>
          </section>

          {issues.length > 0 && (
            <section style={{ ...box, borderColor: `${C.danger}66`, background: `${C.danger}0F` }}>
              <div style={{ fontWeight: 800, color: C.danger, marginBottom: 8 }}>Kết quả chưa khớp hợp đồng ({issues.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
                {issues.slice(0, 12).map((issue, index) => <li key={index}><code>{issue}</code></li>)}
              </ul>
              {issues.length > 12 && <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>…và {issues.length - 12} lỗi nữa</div>}
              <div style={{ fontSize: 12, color: C.dim, marginTop: 10 }}>Runner không nhận kết quả này. Chạy lại, hoặc nâng mức nỗ lực rồi thử tiếp.</div>
            </section>
          )}

          {envelope?.contract === CONTRACT_NAMES.blueprint && <BlueprintView blueprint={envelope} />}
          {envelope?.contract === CONTRACT_NAMES.delta && <DeltaView delta={envelope} />}

          <section style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <div style={{ fontWeight: 800 }}>Envelope thô</div>
              <span style={{ ...chip(phaseColor), marginLeft: "auto" }}>{phase}</span>
            </div>
            <textarea
              readOnly
              value={resultText || raw || ""}
              rows={16}
              placeholder="Kết quả sẽ hiện ở đây sau khi chạy."
              style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.55, resize: "vertical" }}
            />
          </section>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, boxShadow: "0 10px 34px rgba(0,0,0,.5)" }}>{toast}</div>
      )}
    </div>
  );
}

/* ─── Xem Blueprint ─── */
function BlueprintView({ blueprint }) {
  return (
    <section style={box}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{blueprint.title}</div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>{blueprint.logline}</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={chip(C.accent)}>{blueprint.scenes.length} cảnh</span>
        <span style={chip(C.dim)}>{blueprint.target_words || "?"} từ mục tiêu</span>
        <span style={chip(C.ok)}>{blueprint.provenance.blocks_used.length} khối đã dùng</span>
        {blueprint.provenance.blocks_unused.length > 0 && <span style={chip(C.warn)}>{blueprint.provenance.blocks_unused.length} khối chưa dùng</span>}
        {blueprint.continuity.contradictions.length > 0 && <span style={chip(C.danger)}>{blueprint.continuity.contradictions.length} mâu thuẫn</span>}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {blueprint.scenes.map((scene) => (
          <div key={scene.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, color: C.accent2 }}>{scene.order}.</span>
              <span style={{ fontWeight: 700 }}>{scene.purpose}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.dim }}>{scene.target_words} từ</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>
              {scene.setting || "—"}{scene.time ? ` · ${scene.time}` : ""}{scene.characters.length ? ` · ${scene.characters.join(", ")}` : ""}
            </div>
            <ol style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
              {scene.beats.map((beat, index) => <li key={index}>{beat}</li>)}
            </ol>
            {scene.evidence.length > 0 && (
              <div style={{ fontSize: 11.5, color: C.dim, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
                {scene.evidence.map((entry, index) => (
                  <div key={index}>{entry.chunk_id === null ? "○" : `#${entry.chunk_id}`} {entry.source} — {entry.why}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {blueprint.continuity.contradictions.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <div style={{ fontWeight: 800, color: C.danger, marginBottom: 6 }}>Mâu thuẫn cần tác giả quyết</div>
          {blueprint.continuity.contradictions.map((entry, index) => (
            <div key={index} style={{ color: C.dim, marginBottom: 4 }}>{entry.claim} ⟂ {entry.conflicts_with}</div>
          ))}
        </div>
      )}
      {blueprint.warnings.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: C.warn }}>
          {blueprint.warnings.map((warning, index) => <div key={index}>⚠ {warning}</div>)}
        </div>
      )}
    </section>
  );
}

/* ─── Xem Commit Delta ─── */
function DeltaView({ delta }) {
  const grouped = delta.projections.reduce((groups, projection) => {
    (groups[projection.projection_type] ??= []).push(projection);
    return groups;
  }, {});
  return (
    <section style={box}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Chương {delta.chapter_number} · phóng chiếu</div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>{delta.summary.short}</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={chip(C.accent)}>{delta.projections.length} projection</span>
        <span style={chip(C.dim)}>{delta.summary.scenes.length} cảnh</span>
        {delta.contradictions.length > 0 && <span style={chip(C.danger)}>{delta.contradictions.length} mâu thuẫn</span>}
        {delta.warnings.length > 0 && <span style={chip(C.warn)}>{delta.warnings.length} cảnh báo</span>}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(grouped).map(([type, entries]) => (
          <div key={type} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700, color: C.accent2, marginBottom: 7 }}>{type} · {entries.length}</div>
            {entries.map((projection, index) => (
              <div key={index} style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.6 }}>
                <div><strong>{projection.subject_key}</strong> <span style={{ color: C.dim }}>· tin cậy {projection.confidence.toFixed(2)}</span></div>
                <div style={{ color: C.dim, fontStyle: "italic" }}>“{projection.evidence.quote}” [{projection.evidence.start}–{projection.evidence.end}]</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {delta.warnings.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: C.warn }}>
          {delta.warnings.map((warning, index) => <div key={index}>⚠ {warning}</div>)}
        </div>
      )}
    </section>
  );
}
