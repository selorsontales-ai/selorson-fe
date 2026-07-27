import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderArtifact, distPath, TARGETS } from "./build.mjs";

/** esbuild đi kèm Vite ở workspace gốc; thiếu nó thì bỏ qua chứ không đỏ. */
async function loadEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    return null;
  }
}

// dist/ là thứ được dán vào claude.ai. Nếu nó lệch với src/ + lib/, mọi
// bài test ở đây vẫn xanh trong khi Artifact thật chạy mã cũ — nên bản
// đồng bộ được kiểm ngay trong bộ test, không chỉ ở CI.
test("dist khớp với src + lib", () => {
  for (const name of TARGETS) {
    const rendered = renderArtifact(name);
    const current = readFileSync(distPath(name), "utf8");
    assert.equal(current, rendered, `dist/${name}.jsx đã lệch — chạy \`node artifacts/build.mjs\``);
  }
});

test("bản nội tuyến không còn import tương đối hay từ khoá export", () => {
  for (const name of TARGETS) {
    const rendered = renderArtifact(name);
    assert.doesNotMatch(rendered, /from\s+"\.\//, `dist/${name}.jsx còn import tương đối`);
    assert.doesNotMatch(rendered, /^export\s+(const|let|function|class|async)\b/m, `dist/${name}.jsx còn export lẻ`);
    assert.match(rendered, /^import \{[^}]*\} from "react";/m, "phải giữ đúng một import react");
    assert.match(rendered, /export default function/, "Artifact cần một component mặc định");
  }
});

test("mỗi Artifact mang đủ hợp đồng, runtime và lõi của nó", () => {
  const architect = renderArtifact("story-architect");
  assert.match(architect, /function validateBlueprint/);
  assert.match(architect, /function validateCommitDelta/);
  assert.match(architect, /function callClaude/);
  assert.match(architect, /function buildPlanPrompt/);
  assert.match(architect, /function buildAnalyzePrompt/);

  const writer = renderArtifact("chapter-writer");
  assert.match(writer, /function validateDraftEnvelope/);
  assert.match(writer, /function callClaude/);
  assert.match(writer, /function buildWritePrompt/);
  assert.match(writer, /function buildSelfCheckPrompt/);
});

// Nội tuyến hoá là thao tác trên chuỗi, nên nó có thể tạo ra một file
// vẫn "trông đúng" với mọi regex ở trên mà lại không parse được. Bản dán
// vào claude.ai hỏng cú pháp thì không có gì bắt được, ngoài chỗ này.
test("bản dist là JSX parse được", async (t) => {
  const esbuild = await loadEsbuild();
  if (!esbuild) {
    t.skip("không tìm thấy esbuild — bỏ qua kiểm cú pháp");
    return;
  }
  for (const name of TARGETS) {
    const source = readFileSync(distPath(name), "utf8");
    assert.doesNotThrow(
      () => esbuild.transformSync(source, { loader: "jsx", format: "esm" }),
      `dist/${name}.jsx không parse được`
    );
  }
});

test("cả hai Artifact dựng bridge và đường DOM dự phòng", () => {
  for (const name of TARGETS) {
    const rendered = renderArtifact(name);
    assert.match(rendered, /window\.__nf_ctl = \{/, `${name} thiếu bridge`);
    assert.match(rendered, /getCheckpoint\(\)/, `${name} thiếu getCheckpoint`);
    assert.match(rendered, /data-selorson-run/, `${name} thiếu nút cho đường DOM dự phòng`);
    assert.match(rendered, /data-selorson-result/, `${name} thiếu ô kết quả cho đường DOM dự phòng`);
    assert.match(rendered, /data-selorson-state/, `${name} thiếu ô trạng thái cho đường DOM dự phòng`);
  }
});
