import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeResearchPack, validateBlueprint, validateCommitDelta } from "./lib/contracts.mjs";
import {
  analyzeContext,
  blueprintMarkdown,
  buildAnalyzePrompt,
  buildPlanPrompt,
  finishAnalyze,
  finishPlan,
  planContext,
  TOOL_NAME,
  TOOL_VERSION,
} from "./lib/story-architect.mjs";
import { analyzeOutputFixture, CHAPTER_TEXT, planOutputFixture, researchPackFixture } from "./fixtures.mjs";

const CONFIG = {
  model: "claude-opus-5",
  effort: "high",
  thinkingOn: true,
  instructions: "",
  inputHash: "job-hash-1",
  researchHash: "job-hash-1",
  projectId: "selorson-tales",
  chapterNumber: 12,
  sourceCommitId: "commit-77",
  contentHash: "content-77",
};

function pack() {
  return normalizeResearchPack(researchPackFixture());
}

/* ─── CW-400: hành động plan phải khớp hợp đồng ─── */

test("plan sinh ra ChapterBlueprintV1 hợp lệ", () => {
  const context = planContext(pack(), CONFIG);
  const { envelope, validation } = finishPlan(JSON.stringify(planOutputFixture()), context);

  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.equal(envelope.contract, "ChapterBlueprintV1");
  assert.equal(envelope.project_id, "selorson-tales");
  assert.equal(envelope.chapter_number, 12);
  assert.equal(envelope.input_hash, "job-hash-1");
  assert.equal(envelope.producer.tool, TOOL_NAME);
  assert.equal(envelope.producer.tool_version, TOOL_VERSION);
  assert.equal(envelope.scenes.length, 2);
});

test("plan không cho model tự bịa project_id hay số chương", () => {
  const context = planContext(pack(), CONFIG);
  const output = planOutputFixture({ project_id: "kênh-khác", chapter_number: 999, contract: "GìĐó" });
  const { envelope } = finishPlan(JSON.stringify(output), context);

  assert.equal(envelope.project_id, "selorson-tales");
  assert.equal(envelope.chapter_number, 12);
  assert.equal(envelope.contract, "ChapterBlueprintV1");
});

test("chunk_id không có trong Research Pack bị hạ xuống null, mẩu bằng chứng vẫn giữ", () => {
  const context = planContext(pack(), CONFIG);
  const { envelope } = finishPlan(JSON.stringify(planOutputFixture()), context);

  const evidence = envelope.scenes[1].evidence;
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].chunk_id, 102);
  assert.equal(evidence[1].chunk_id, null, "id 999 không có thật nên phải bị hạ xuống null");
  assert.equal(evidence[1].source, "bịa.md");
});

test("provenance phân biệt khối đã dùng và khối bị bỏ qua", () => {
  const context = planContext(pack(), CONFIG);
  const { envelope } = finishPlan(JSON.stringify(planOutputFixture()), context);

  assert.deepEqual(envelope.provenance.blocks_used, [101, 102]);
  assert.deepEqual(envelope.provenance.blocks_unused, []);
  assert.equal(envelope.provenance.research_input_hash, "job-hash-1");
});

test("khối tư liệu không cảnh nào trích vẫn được đếm là chưa dùng", () => {
  const context = planContext(pack(), CONFIG);
  const output = planOutputFixture();
  output.scenes[1].evidence = [];
  const { envelope, validation } = finishPlan(JSON.stringify(output), context);

  assert.equal(validation.ok, true);
  assert.deepEqual(envelope.provenance.blocks_used, [101]);
  assert.deepEqual(envelope.provenance.blocks_unused, [102]);
});

test("model trả về rác thì báo lỗi ở chỗ parse, không dựng envelope nửa vời", () => {
  const context = planContext(pack(), CONFIG);
  assert.throws(() => finishPlan("xin lỗi, tôi không thể", context), /JSON object/);
});

test("model trả về JSON trống thì envelope dựng được nhưng bị hợp đồng chặn", () => {
  const context = planContext(pack(), CONFIG);
  const { envelope, validation } = finishPlan("{}", context);

  assert.equal(envelope.contract, "ChapterBlueprintV1");
  assert.equal(validation.ok, false, "một dàn ý không nội dung không được coi là hợp lệ");
  assert.ok(validation.errors.some((error) => error.startsWith("$.logline")));
});

test("prompt plan mang đủ tư liệu, id, và luật bằng chứng", () => {
  const prompt = buildPlanPrompt(pack(), { ...CONFIG, instructions: "giữ nhịp chậm" });

  assert.match(prompt.system, /chunk_id" PHẢI là một id có thật/);
  assert.match(prompt.user, /chunk_id=101/);
  assert.match(prompt.user, /chunk_id=102/);
  assert.match(prompt.user, /Lâm phát hiện người anh/);
  assert.match(prompt.user, /giữ nhịp chậm/);
});

test("khối bị veto không lọt vào prompt", () => {
  const vetoed = researchPackFixture();
  vetoed.blocks[0].vetoed = true;
  const prompt = buildPlanPrompt(normalizeResearchPack(vetoed), CONFIG);

  assert.doesNotMatch(prompt.user, /chunk_id=101/);
  assert.match(prompt.user, /chunk_id=102/);
});

/* ─── CW-400: hành động analyze phải khớp hợp đồng ─── */

test("analyze sinh ra ChapterCommitDeltaV1 hợp lệ", () => {
  const context = analyzeContext(pack(), CONFIG, CHAPTER_TEXT);
  const { envelope, validation } = finishAnalyze(JSON.stringify(analyzeOutputFixture()), context);

  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.equal(envelope.contract, "ChapterCommitDeltaV1");
  assert.equal(envelope.source_commit_id, "commit-77");
  assert.equal(envelope.content_hash, "content-77");
  assert.equal(envelope.extractor_version, `${TOOL_NAME}/${TOOL_VERSION}`);
});

test("projection có trích dẫn bịa bị loại và được ghi vào warnings", () => {
  const context = analyzeContext(pack(), CONFIG, CHAPTER_TEXT);
  const { envelope } = finishAnalyze(JSON.stringify(analyzeOutputFixture()), context);

  const subjects = envelope.projections.map((projection) => projection.subject_key);
  assert.deepEqual(subjects, ["lam-phat-hien-dau-tay", "Lâm↔người anh"]);
  assert.equal(envelope.warnings.length, 1);
  assert.match(envelope.warnings[0], /không tìm thấy trích dẫn/);
});

test("span bằng chứng được sửa lại theo văn bản thật, không tin số model khai", () => {
  const context = analyzeContext(pack(), CONFIG, CHAPTER_TEXT);
  const { envelope } = finishAnalyze(JSON.stringify(analyzeOutputFixture()), context);

  for (const projection of envelope.projections) {
    const { start, end, quote } = projection.evidence;
    assert.equal(CHAPTER_TEXT.slice(start, end), quote, `span của ${projection.subject_key} phải trỏ đúng chỗ`);
  }
});

test("mọi projection bị loại thì hợp đồng chặn, không trả về delta rỗng", () => {
  const context = analyzeContext(pack(), CONFIG, CHAPTER_TEXT);
  const output = analyzeOutputFixture({
    projections: [{
      projection_type: "event",
      subject_key: "bịa",
      payload: {},
      evidence: { start: 0, end: 3, quote: "hoàn toàn không có trong chương" },
      confidence: 0.9,
    }],
  });
  const { envelope, validation } = finishAnalyze(JSON.stringify(output), context);

  assert.equal(envelope.projections.length, 0);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.startsWith("$.projections")));
});

test("loại projection lạ bị ép về event, confidence ngoài khoảng bị kéo về 0.5", () => {
  const context = analyzeContext(pack(), CONFIG, CHAPTER_TEXT);
  const output = analyzeOutputFixture({
    projections: [{
      projection_type: "điều-gì-đó",
      subject_key: "Lâm",
      payload: { note: "x" },
      evidence: { start: 0, end: 5, quote: "Người anh không chối một câu nào." },
      confidence: 7,
    }],
  });
  const { envelope, validation } = finishAnalyze(JSON.stringify(output), context);

  assert.equal(validation.ok, true);
  assert.equal(envelope.projections[0].projection_type, "event");
  assert.equal(envelope.projections[0].confidence, 0.5);
});

test("prompt analyze nêu rõ luật trích nguyên văn và mang theo canon trước đó", () => {
  const prompt = buildAnalyzePrompt(CHAPTER_TEXT, pack(), CONFIG);

  assert.match(prompt.system, /trích NGUYÊN VĂN/);
  assert.match(prompt.user, /CANON TRƯỚC ĐÓ/);
  assert.match(prompt.user, /Lâm xuống hầm sách/);
});

/* ─── Kết xuất cho con người ─── */

test("blueprint xuất ra Markdown đọc được, có beat và bằng chứng", () => {
  const context = planContext(pack(), CONFIG);
  const { envelope } = finishPlan(JSON.stringify(planOutputFixture()), context);
  const markdown = blueprintMarkdown(envelope);

  assert.match(markdown, /^# Phiến đá thiếu/);
  assert.match(markdown, /Lâm xuống hầm sách/);
  assert.match(markdown, /#101 the-gioi\/gia-toc\.md/);
});
