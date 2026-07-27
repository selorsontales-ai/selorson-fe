import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONTRACT_VERSION,
  buildCheckpoint,
  buildDraftEnvelope,
  buildWriterPack,
  countWords,
  deriveSelfCheckStatus,
  extractJson,
  locateQuote,
  mapScenes,
  normalizeResearchPack,
  validateBlueprint,
  validateCheckpoint,
  validateDraftEnvelope,
  validateResearchPack,
  validateWriterPack,
} from "./lib/contracts.mjs";
import { blueprintFixture, researchPackFixture } from "./fixtures.mjs";

test("Research Pack hợp lệ đi qua, pack thiếu tiền đề thì không", () => {
  const good = normalizeResearchPack(researchPackFixture());
  assert.equal(validateResearchPack(good).ok, true);

  const bare = normalizeResearchPack(researchPackFixture({ intent: {} }));
  const check = validateResearchPack(bare);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((error) => error.startsWith("$.intent.premise")));
});

test("normalize chịu được pack rỗng thay vì ném lỗi", () => {
  const pack = normalizeResearchPack(null);
  assert.equal(pack.contract, "ChapterResearchPackV1");
  assert.equal(pack.schema_version, CONTRACT_VERSION);
  assert.deepEqual(pack.blocks, []);
});

test("hợp đồng từ chối envelope sai tên, sai phiên bản, và thiếu bằng chứng", () => {
  const context = { projectId: "p", chapterNumber: 3 };

  const wrongName = { ...blueprintFixture(context), contract: "ChapterDraftEnvelopeV1" };
  assert.ok(validateBlueprint(wrongName).errors.some((error) => error.startsWith("$.contract")));

  const wrongVersion = { ...blueprintFixture(context), schema_version: 2 };
  assert.ok(validateBlueprint(wrongVersion).errors.some((error) => error.startsWith("$.schema_version")));

  const noScenes = { ...blueprintFixture(context), scenes: [] };
  assert.ok(validateBlueprint(noScenes).errors.some((error) => error.includes("ít nhất 1")));

  const noProducer = { ...blueprintFixture(context) };
  delete noProducer.producer;
  assert.ok(validateBlueprint(noProducer).errors.some((error) => error.startsWith("$.producer")));
});

test("một cảnh không beat nào là lỗi hợp đồng", () => {
  const blueprint = blueprintFixture({ projectId: "p", chapterNumber: 3 });
  blueprint.scenes[1] = { ...blueprint.scenes[1], beats: [] };
  const check = validateBlueprint(blueprint);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((error) => error.startsWith("$.scenes[1].beats")));
});

test("locateQuote tự sửa vị trí sai và từ chối trích dẫn bịa", () => {
  const body = "một hai ba bốn năm";
  assert.deepEqual(locateQuote(body, "ba bốn", 999), { start: 8, end: 14, quote: "ba bốn" });
  assert.deepEqual(locateQuote(body, "ba bốn", 8), { start: 8, end: 14, quote: "ba bốn" });
  assert.equal(locateQuote(body, "sáu bảy", 0), null);
});

test("mapScenes đọc ranh giới từ dấu đánh dấu, và nói thật khi không có", () => {
  const body = "<!-- scene: a -->\nmột hai\n<!-- scene: b -->\nba bốn năm";
  const scenes = [{ id: "a" }, { id: "b" }];
  const mapped = mapScenes(body, scenes);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].scene_id, "a");
  assert.equal(mapped[0].matched, true);
  assert.equal(mapped[1].words, 3, "dấu đánh dấu không được tính là từ của cảnh");

  const unmarked = mapScenes("không có dấu nào", scenes);
  assert.equal(unmarked.every((entry) => entry.matched === false && entry.words === 0), true);
});

test("trạng thái tự kiểm suy ra từ mục nặng nhất", () => {
  assert.equal(deriveSelfCheckStatus([]), "not_run");
  assert.equal(deriveSelfCheckStatus([{ status: "pass" }]), "passed");
  assert.equal(deriveSelfCheckStatus([{ status: "pass" }, { status: "warn" }]), "warned");
  assert.equal(deriveSelfCheckStatus([{ status: "warn" }, { status: "fail" }]), "failed");
});

test("bản thảo rỗng không bao giờ là envelope hợp lệ", () => {
  const context = {
    tool: "chapter_writer", toolVersion: "1.0.0", model: "claude-opus-5",
    projectId: "p", chapterNumber: 3, inputHash: "h",
    blueprint: blueprintFixture({ projectId: "p", chapterNumber: 3 }),
    blocksAvailable: [], warnings: [],
  };
  const empty = buildDraftEnvelope({ prose: "", selfCheck: null, truncated: false, context });
  const check = validateDraftEnvelope(empty);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((error) => error.startsWith("$.text")));
  assert.ok(check.errors.some((error) => error.startsWith("$.word_count")));
});

test("WriterPack ghép từ Research Pack + Blueprint, và bỏ khối bị veto", () => {
  const research = researchPackFixture();
  research.blocks[1].vetoed = true;
  const pack = buildWriterPack({
    research,
    blueprint: blueprintFixture({ projectId: "selorson-tales", chapterNumber: 12 }),
    style: { voice_notes: "điềm tĩnh", forbidden_words: ["bất chợt"] },
    previousTail: "…rồi cửa khép lại.",
  });
  assert.equal(validateWriterPack(pack).ok, true);
  assert.equal(pack.context_blocks.length, 1);
  assert.equal(pack.context_blocks[0].chunk_id, 101);
  assert.equal(pack.previous_tail, "…rồi cửa khép lại.");
});

test("WriterPack không có Blueprint bị từ chối", () => {
  const pack = buildWriterPack({
    research: researchPackFixture(),
    blueprint: { contract: "ChapterBlueprintV1" },
    style: {},
    previousTail: "",
  });
  const check = validateWriterPack(pack);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((error) => error.startsWith("$.blueprint.")));
});

test("checkpoint đi vòng qua JSON vẫn hợp lệ và giữ nguyên phần dở dang", () => {
  const checkpoint = buildCheckpoint({
    tool: "story_architect",
    toolVersion: "1.0.0",
    action: "plan",
    config: { model: "claude-opus-5" },
    inputs: { research: "{}" },
    raw: '{"title":"còn dở',
    truncated: true,
  });
  const revived = JSON.parse(JSON.stringify(checkpoint));
  assert.equal(validateCheckpoint(revived).ok, true);
  assert.equal(revived.truncated, true);
  assert.equal(revived.raw, '{"title":"còn dở');

  delete revived.raw;
  assert.equal(validateCheckpoint(revived).ok, false);
});

test("extractJson bóc được qua rào ``` và lời dẫn", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Đây là kết quả:\n{"a":[1,2]}\nHết.'), { a: [1, 2] });
  assert.throws(() => extractJson("không có json ở đây"), /JSON object/);
  assert.throws(() => extractJson("   "), /không trả về gì/);
});

test("đếm từ hoạt động với tiếng Việt", () => {
  assert.equal(countWords("Lâm xuống hầm sách"), 4);
  assert.equal(countWords("   "), 0);
});
