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

export const CONTRACT_VERSION = 1;

export const CONTRACT_NAMES = {
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

export function validateResearchPack(pack) {
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
export function normalizeResearchPack(raw) {
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

export function validateBlueprint(blueprint) {
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
export function normalizeBlueprint(raw, context) {
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

export const PROJECTION_TYPES = [
  "summary",
  "scene",
  "event",
  "entity_state",
  "relationship",
  "character_knowledge",
  "timeline",
  "open_loop",
];

export function validateCommitDelta(delta) {
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
export function normalizeCommitDelta(raw, context) {
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
export function locateQuote(chapterText, quote, claimedStart) {
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

export function validateWriterPack(pack) {
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
export function buildWriterPack({ research, blueprint, style, previousTail }) {
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

export function normalizeWriterPack(raw) {
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

export const SELF_CHECK_STATUSES = ["not_run", "passed", "warned", "failed"];
export const CHECK_STATUSES = ["pass", "warn", "fail"];

export function validateDraftEnvelope(draft) {
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
export function countWords(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function buildDraftEnvelope({ prose, selfCheck, truncated, context }) {
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
export const SCENE_MARK = /<!--\s*scene:\s*([\w.:-]+)\s*-->/g;

export function mapScenes(body, scenes) {
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

export function normalizeSelfCheck(raw, scenes) {
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

export function deriveSelfCheckStatus(checks) {
  if (!checks.length) return "not_run";
  if (checks.some((check) => check.status === "fail")) return "failed";
  if (checks.some((check) => check.status === "warn")) return "warned";
  return "passed";
}

/* ═══════════════════════════════════════════════════════════════════
   ArtifactCheckpointV1 — trạng thái mang qua tài khoản khác
   ═══════════════════════════════════════════════════════════════════ */

export function validateCheckpoint(checkpoint) {
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

export function buildCheckpoint({ tool, toolVersion, action, config, inputs, raw, truncated }) {
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
export function extractJson(raw) {
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
