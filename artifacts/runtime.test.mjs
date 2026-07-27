import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyReasoning,
  callClaude,
  continuationMessages,
  MODELS,
  modelInfo,
  readResponse,
  signalStatusFor,
} from "./lib/runtime.mjs";

function request(model, max = 8000) {
  return { model, max_tokens: max, system: "s", messages: [] };
}

test("mỗi model khai đủ năng lực để giao diện không phải đoán", () => {
  for (const model of MODELS) {
    assert.ok(model.id && model.label, "model phải có id và nhãn");
    assert.ok(["always", "adaptive", "budget"].includes(model.thinking), `${model.id}: chế độ suy nghĩ lạ`);
    assert.ok(Number.isInteger(model.maxOutput) && model.maxOutput > 0, `${model.id}: thiếu trần đầu ra`);
  }
});

test("adaptive thinking là cấu hình duy nhất gửi cho Opus 5", () => {
  const { body } = applyReasoning(request("claude-opus-5"), { model: "claude-opus-5", thinkingOn: true, effort: "high" });
  assert.deepEqual(body.thinking, { type: "adaptive" });
  assert.deepEqual(body.output_config, { effort: "high" });
  assert.equal("budget_tokens" in (body.thinking ?? {}), false);
});

test("Fable 5 không nhận bất kỳ cấu hình thinking nào", () => {
  const on = applyReasoning(request("claude-fable-5"), { model: "claude-fable-5", thinkingOn: true, effort: "max" });
  assert.equal("thinking" in on.body, false);

  const off = applyReasoning(request("claude-fable-5"), { model: "claude-fable-5", thinkingOn: false, effort: "max" });
  assert.equal("thinking" in off.body, false);
  assert.equal(off.notes.length, 1, "phải nói cho tác giả biết vì sao nút tắt không có tác dụng");
});

test("tắt suy nghĩ trên Opus 5 kéo effort xuống high thay vì để request chết", () => {
  const { body, effort, notes } = applyReasoning(request("claude-opus-5"), {
    model: "claude-opus-5",
    thinkingOn: false,
    effort: "xhigh",
  });
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(effort, "high");
  assert.deepEqual(body.output_config, { effort: "high" });
  assert.match(notes[0], /effort ≤ high/);
});

test("tắt suy nghĩ ở effort thấp thì giữ nguyên effort", () => {
  const { body, effort, notes } = applyReasoning(request("claude-opus-5"), {
    model: "claude-opus-5",
    thinkingOn: false,
    effort: "medium",
  });
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(effort, "medium");
  assert.deepEqual(notes, []);
});

test("Haiku 4.5 vẫn dùng budget_tokens và không nhận effort", () => {
  const { body, effort, notes } = applyReasoning(request("claude-haiku-4-5", 8000), {
    model: "claude-haiku-4-5",
    thinkingOn: true,
    effort: "high",
  });
  assert.equal(body.thinking.type, "enabled");
  assert.ok(body.thinking.budget_tokens < 8000);
  assert.equal(effort, null);
  assert.equal("output_config" in body, false);
  assert.deepEqual(notes, []);
});

test("effort model không hỗ trợ bị hạ về high kèm lời giải thích", () => {
  const { effort, notes } = applyReasoning(request("claude-opus-5"), {
    model: "claude-opus-5",
    thinkingOn: true,
    effort: "siêu-cao",
  });
  assert.equal(effort, "high");
  assert.match(notes[0], /không nhận effort/);
});

test("modelInfo rơi về model đầu tiên khi id lạ", () => {
  assert.equal(modelInfo("không-có-model").id, MODELS[0].id);
});

/* ─── Đọc câu trả lời ─── */

test("bốn kết cục được phân biệt, không gộp thành một lỗi chung", () => {
  const ok = readResponse(200, { content: [{ type: "text", text: "xong" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } });
  assert.equal(ok.outcome, "ok");
  assert.equal(ok.truncated, false);
  assert.equal(ok.text, "xong");
  assert.deepEqual(ok.usage, { input: 5, output: 2 });

  const cut = readResponse(200, { content: [{ type: "text", text: "một nửa" }], stop_reason: "max_tokens" });
  assert.equal(cut.outcome, "ok");
  assert.equal(cut.truncated, true);

  const refused = readResponse(200, { content: [], stop_reason: "refusal", stop_details: { category: "cyber", explanation: "không" } });
  assert.equal(refused.outcome, "refusal");
  assert.equal(refused.category, "cyber");

  const limited = readResponse(429, { error: { type: "rate_limit_error", message: "resetsAt\":1790000000" } });
  assert.equal(limited.outcome, "rate_limit");
  assert.equal(limited.resetsAt, 1790000000);
});

test("lỗi hạn mức trả về mã 200 vẫn được nhận ra", () => {
  const limited = readResponse(200, { error: { type: "rate_limit_error", message: "You are out of quota" } });
  assert.equal(limited.outcome, "rate_limit");
});

test("lỗi HTTP thường không bị nhầm thành hết hạn mức", () => {
  const failed = readResponse(500, { error: { type: "api_error", message: "sập" } });
  assert.equal(failed.outcome, "error");
  assert.equal(failed.status, 500);
});

test("chỉ hết hạn mức mới thành tín hiệu xoay tài khoản", () => {
  assert.equal(signalStatusFor({ outcome: "rate_limit" }), "rate_limited");
  assert.equal(signalStatusFor({ outcome: "refusal" }), "error");
  assert.equal(signalStatusFor({ outcome: "error" }), "error");
  assert.equal(signalStatusFor({ outcome: "ok", truncated: true }), "max_tokens");
  assert.equal(signalStatusFor({ outcome: "ok", truncated: false }), "ready");
});

/* ─── Gọi API ─── */

function stubFetch(responses) {
  const seen = [];
  const impl = async (_url, options) => {
    seen.push(JSON.parse(options.body));
    const next = responses.shift();
    return { status: next.status, json: async () => next.body };
  };
  return { impl, seen };
}

test("fallback được bật mặc định, và bỏ đi khi proxy không biết tham số đó", async () => {
  const { impl, seen } = stubFetch([
    { status: 400, body: { error: { type: "invalid_request_error", message: "unexpected parameter: fallbacks" } } },
    { status: 200, body: { content: [{ type: "text", text: "ổn" }], stop_reason: "end_turn" } },
  ]);

  const result = await callClaude(request("claude-opus-5"), { fetchImpl: impl });

  assert.equal(result.outcome, "ok");
  assert.equal(result.fallbackUnavailable, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].fallbacks, "default");
  assert.equal("fallbacks" in seen[1], false, "lần thử lại phải sạch, không mang beta không được hỗ trợ");
});

test("lỗi thường không kích hoạt thử lại lần hai", async () => {
  const { impl, seen } = stubFetch([{ status: 500, body: { error: { type: "api_error", message: "sập" } } }]);

  const result = await callClaude(request("claude-opus-5"), { fetchImpl: impl });

  assert.equal(result.outcome, "error");
  assert.equal(seen.length, 1);
});

test("model không hỗ trợ fallback thì không gửi tham số đó", async () => {
  const { impl, seen } = stubFetch([{ status: 200, body: { content: [{ type: "text", text: "ổn" }], stop_reason: "end_turn" } }]);

  await callClaude(request("claude-haiku-4-5"), { fetchImpl: impl });

  assert.equal("fallbacks" in seen[0], false);
});

test("mạng đứt thành lỗi có thông điệp, không phải exception rơi ra ngoài", async () => {
  const impl = async () => { throw new Error("ECONNRESET"); };
  const result = await callClaude(request("claude-opus-5"), { fetchImpl: impl, allowFallback: false });

  assert.equal(result.outcome, "error");
  assert.match(result.message, /ECONNRESET/);
});

test("lượt nối tiếp mang phần đã sinh làm lượt assistant", () => {
  const messages = continuationMessages("đề bài", "một nửa", "viết tiếp");
  assert.deepEqual(messages.map((entry) => entry.role), ["user", "assistant", "user"]);
  assert.equal(messages[1].content, "một nửa");
});
