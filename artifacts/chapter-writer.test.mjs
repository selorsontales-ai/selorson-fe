import { test } from "node:test";
import assert from "node:assert/strict";

import { buildWriterPack, normalizeWriterPack, validateCheckpoint, buildCheckpoint } from "./lib/contracts.mjs";
import {
  buildRevisePrompt,
  buildSelfCheckPrompt,
  buildWritePrompt,
  draftMarkdown,
  finishDraft,
  parseSelfCheck,
  stripSceneMarks,
  TOOL_NAME,
  TOOL_VERSION,
  writerContext,
} from "./lib/chapter-writer.mjs";
import { blueprintFixture, DRAFT_PROSE, researchPackFixture, selfCheckOutputFixture } from "./fixtures.mjs";

const CONFIG = {
  model: "claude-opus-5",
  effort: "high",
  thinkingOn: true,
  instructions: "",
  inputHash: "job-hash-2",
};

function pack(overrides = {}) {
  return normalizeWriterPack(buildWriterPack({
    research: researchPackFixture(),
    blueprint: blueprintFixture({ projectId: "selorson-tales", chapterNumber: 12 }),
    style: { voice_notes: "điềm tĩnh, ít tính từ", forbidden_words: ["bất chợt"], sample_paragraphs: ["Trời chưa sáng."] },
    previousTail: "…rồi cửa khép lại.",
    ...overrides,
  }));
}

/* ─── CW-410: hành động write phải khớp hợp đồng ─── */

test("write sinh ra ChapterDraftEnvelopeV1 hợp lệ", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope, validation } = finishDraft({
    prose: DRAFT_PROSE,
    selfCheck: selfCheckOutputFixture(),
    truncated: false,
    context,
  });

  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.equal(envelope.contract, "ChapterDraftEnvelopeV1");
  assert.equal(envelope.project_id, "selorson-tales");
  assert.equal(envelope.chapter_number, 12);
  assert.equal(envelope.input_hash, "job-hash-2");
  assert.equal(envelope.producer.tool, TOOL_NAME);
  assert.equal(envelope.producer.tool_version, TOOL_VERSION);
});

test("dấu đánh dấu cảnh bị gỡ khỏi văn bản đi vào canon", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope } = finishDraft({ prose: DRAFT_PROSE, selfCheck: null, truncated: false, context });

  assert.doesNotMatch(envelope.text, /<!--/, "canon không được chứa dấu điều khiển của công cụ");
  assert.match(envelope.text, /Lâm xuống hầm sách/);
  assert.equal(envelope.char_count, envelope.text.length);
});

test("bản đồ cảnh trỏ vào bản còn dấu, và nói rõ mốc đó", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope } = finishDraft({ prose: DRAFT_PROSE, selfCheck: null, truncated: false, context });

  assert.equal(envelope.scene_map.length, 2);
  assert.deepEqual(envelope.scene_map.map((entry) => entry.scene_id), ["scene-1", "scene-2"]);
  assert.equal(envelope.scene_map.every((entry) => entry.matched === true), true);
  assert.equal(envelope.scene_map.every((entry) => entry.basis === "marked"), true);
});

test("cảnh model tự nghĩ ra bị đánh dấu là không khớp Blueprint", () => {
  const context = writerContext(pack(), CONFIG);
  const prose = `${DRAFT_PROSE}\n<!-- scene: scene-99 -->\nMột cảnh không có trong dàn ý.`;
  const { envelope, validation } = finishDraft({ prose, selfCheck: null, truncated: false, context });

  assert.equal(validation.ok, true);
  const stray = envelope.scene_map.find((entry) => entry.scene_id === "scene-99");
  assert.equal(stray.matched, false);
});

test("chưa tự kiểm thì envelope vẫn hợp lệ, trạng thái là not_run", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope, validation } = finishDraft({ prose: DRAFT_PROSE, selfCheck: null, truncated: false, context });

  assert.equal(validation.ok, true);
  assert.equal(envelope.self_check.status, "not_run");
  assert.deepEqual(envelope.self_check.checks, []);
});

test("tự kiểm có mục warn thì trạng thái tổng là warned", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope } = finishDraft({
    prose: DRAFT_PROSE,
    selfCheck: selfCheckOutputFixture(),
    truncated: false,
    context,
  });

  assert.equal(envelope.self_check.status, "warned");
  assert.equal(envelope.self_check.checks.length, 2);
  assert.equal(envelope.self_check.unresolved_beats[0].scene_id, "scene-2");
});

test("mục kiểm status lạ bị ép về warn thay vì lọt qua", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope, validation } = finishDraft({
    prose: DRAFT_PROSE,
    selfCheck: selfCheckOutputFixture({ checks: [{ id: "x", label: "X", status: "tuyệt vời", detail: "" }] }),
    truncated: false,
    context,
  });

  assert.equal(validation.ok, true);
  assert.equal(envelope.self_check.checks[0].status, "warn");
  assert.equal(envelope.self_check.status, "warned");
});

test("bản thảo bị cắt được đánh dấu truncated và mang cảnh báo", () => {
  const context = writerContext(pack(), { ...CONFIG }, { warnings: ["Bản thảo bị cắt vì hết token — chưa viết xong."] });
  const { envelope, validation } = finishDraft({ prose: DRAFT_PROSE, selfCheck: null, truncated: true, context });

  assert.equal(validation.ok, true);
  assert.equal(envelope.truncated, true);
  assert.match(envelope.warnings[0], /bị cắt/);
});

/* ─── CW-410: hành động revise ─── */

test("revise ghi lại nó sửa từ bản nào", () => {
  const context = writerContext(pack(), CONFIG, { revisionOf: "job-hash-1" });
  const { envelope, validation } = finishDraft({
    prose: DRAFT_PROSE,
    selfCheck: selfCheckOutputFixture(),
    truncated: false,
    context,
  });

  assert.equal(validation.ok, true);
  assert.equal(envelope.provenance.revision_of, "job-hash-1");
  assert.equal(envelope.provenance.blueprint_scene_count, 2);
});

test("prompt revise đưa ghi chú lên trước và cấm viết lại từ đầu", () => {
  const prompt = buildRevisePrompt(pack(), "bản thảo cũ", "cảnh 2 quá nhanh", CONFIG);

  assert.match(prompt.system, /Không viết lại chương từ đầu/);
  assert.match(prompt.user, /cảnh 2 quá nhanh/);
  assert.match(prompt.user, /bản thảo cũ/);
});

test("revise không có ghi chú vẫn dựng được prompt, và nói rõ là chưa có", () => {
  const prompt = buildRevisePrompt(pack(), "bản thảo cũ", "   ", CONFIG);
  assert.match(prompt.user, /tác giả chưa ghi chú/);
});

/* ─── CW-410: hành động selfcheck ─── */

test("prompt tự kiểm liệt kê đủ các mục bắt buộc", () => {
  const prompt = buildSelfCheckPrompt(pack(), stripSceneMarks(DRAFT_PROSE), CONFIG);

  for (const id of ["scene_coverage", "beat_coverage", "pov_tense", "continuity", "guardrails", "length", "prose_quality"]) {
    assert.match(prompt.system, new RegExp(id));
  }
  assert.match(prompt.system, /Báo cáo mọi vấn đề tìm thấy/);
  assert.doesNotMatch(prompt.user, /<!-- scene/, "bản gửi đi soi không nên còn dấu điều khiển");
});

test("báo cáo tự kiểm bóc được qua rào ```", () => {
  const parsed = parseSelfCheck("```json\n" + JSON.stringify(selfCheckOutputFixture()) + "\n```");
  assert.equal(parsed.checks.length, 2);
});

/* ─── CW-410: checkpoint ─── */

test("checkpoint của người viết đi vòng qua JSON vẫn hợp lệ và giữ phần đã viết", () => {
  const checkpoint = buildCheckpoint({
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    action: "write",
    truncated: true,
    config: { model: "claude-opus-5", autoSelfCheck: true, reviseNotes: "" },
    inputs: { pack: JSON.stringify(pack()), pack_name: "writer-pack.json" },
    raw: DRAFT_PROSE,
  });
  const revived = JSON.parse(JSON.stringify(checkpoint));

  assert.equal(validateCheckpoint(revived).ok, true);
  assert.equal(revived.tool, TOOL_NAME);
  assert.equal(revived.truncated, true);
  assert.equal(revived.raw, DRAFT_PROSE);
  assert.equal(normalizeWriterPack(JSON.parse(revived.inputs.pack)).blueprint.scenes.length, 2);
});

test("checkpoint thiếu trường bắt buộc bị từ chối thay vì nạp một phần", () => {
  const broken = { contract: "ArtifactCheckpointV1", schema_version: 1, tool: TOOL_NAME };
  const check = validateCheckpoint(broken);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((error) => error.startsWith("$.action")));
  assert.ok(check.errors.some((error) => error.startsWith("$.raw")));
});

/* ─── Prompt viết ─── */

test("prompt write mang Blueprint, giọng tác giả, đuôi chương trước và luật đánh dấu cảnh", () => {
  const prompt = buildWritePrompt(pack(), { ...CONFIG, instructions: "đối thoại ngắn" });

  assert.match(prompt.system, /<!-- scene: ID -->/);
  assert.match(prompt.system, /Bám Blueprint/);
  assert.match(prompt.user, /Phiến đá thiếu/);
  assert.match(prompt.user, /điềm tĩnh, ít tính từ/);
  assert.match(prompt.user, /Từ cấm: bất chợt/);
  assert.match(prompt.user, /rồi cửa khép lại/);
  assert.match(prompt.user, /đối thoại ngắn/);
});

test("stripSceneMarks chỉ gỡ dấu, không đụng vào chú thích khác", () => {
  const body = "<!-- scene: a -->\nmột\n<!-- ghi chú -->\nhai";
  const stripped = stripSceneMarks(body);
  assert.doesNotMatch(stripped, /scene: a/);
  assert.match(stripped, /<!-- ghi chú -->/);
});

test("bản thảo xuất ra Markdown kèm báo cáo tự kiểm", () => {
  const context = writerContext(pack(), CONFIG);
  const { envelope } = finishDraft({
    prose: DRAFT_PROSE,
    selfCheck: selfCheckOutputFixture(),
    truncated: false,
    context,
  });
  const markdown = draftMarkdown(envelope);

  assert.match(markdown, /^# Phiến đá thiếu/);
  assert.match(markdown, /Báo cáo tự kiểm/);
  assert.match(markdown, /Beat chưa thấy trong bản thảo/);
});
