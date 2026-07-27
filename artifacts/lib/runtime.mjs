// ═══════════════════════════════════════════════════════════════════
//  Runtime dùng chung cho hai Artifact Co-Writer — CW-400 / CW-410
// ═══════════════════════════════════════════════════════════════════
// Gọi API, phân loại lỗi, phát tín hiệu cho Playwright sidecar. Không
// chứa UI, nên chạy được trong `node --test` y như trong Artifact.

export const ARTIFACT_TOOL_VERSION = "1.0.0";

/**
 * Model và năng lực của nó, khai tường minh thay vì đoán từ tên.
 *
 * `thinking` là ba chế độ khác nhau về mặt API, không phải ba mức của
 * cùng một tham số:
 *   always   — Fable 5: luôn nghĩ, gửi bất kỳ cấu hình `thinking` nào là 400.
 *   adaptive — Opus 5 / 4.8 / Sonnet 5: `{type:"adaptive"}`.
 *   budget   — Haiku 4.5: vẫn dùng `budget_tokens` kiểu cũ.
 */
export const MODELS = [
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

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export const DEFAULT_MODEL = "claude-opus-5";
export const DEFAULT_EFFORT = "high";

const API_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function modelInfo(id) {
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
export function applyReasoning(body, { model, thinkingOn, effort }) {
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
export function readResponse(status, data) {
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
export async function callClaude(body, { fetchImpl = fetch, allowFallback = true } = {}) {
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
export function continuationMessages(userPrompt, produced, instruction) {
  return [
    { role: "user", content: userPrompt },
    { role: "assistant", content: produced },
    { role: "user", content: instruction },
  ];
}

export const CONTINUE_JSON =
  "Câu trả lời bị cắt vì hết token. VIẾT TIẾP từ đúng ký tự cuối cùng ở trên để ghép lại " +
  "thành một JSON object hợp lệ duy nhất. KHÔNG lặp lại phần đã có, KHÔNG mở lại dấu ngoặc " +
  "đầu tiên, KHÔNG thêm lời dẫn hay rào ```.";

export const CONTINUE_PROSE =
  "Bản thảo bị cắt vì hết token. VIẾT TIẾP từ đúng chỗ dừng, giữ nguyên giọng văn, ngôi kể " +
  "và định dạng. KHÔNG lặp lại phần đã có, KHÔNG chào lại, KHÔNG tóm tắt phần trước. " +
  "Chỉ trả về phần còn thiếu.";

/**
 * Tín hiệu cho Playwright sidecar (`window.__nf_signal`).
 *
 * Sidecar chỉ xoay tài khoản khi thấy trạng thái `rate_limited`; mọi
 * trạng thái lỗi khác dừng job và giữ lại chẩn đoán.
 */
export function emitSignal(tool, status, extra = {}) {
  if (typeof window === "undefined") return null;
  const signal = { tool, status, timestamp: Date.now(), ...extra };
  try {
    window.__nf_signal = signal;
  } catch {
    // Sandbox chặn ghi vào window thì mất tín hiệu, không mất kết quả.
  }
  return signal;
}

export function clearSignal() {
  if (typeof window === "undefined") return;
  try {
    delete window.__nf_signal;
  } catch {
    // Không xoá được cũng không sao — lần chạy sau sẽ ghi đè.
  }
}

/** Trạng thái sidecar hiểu được, ánh xạ từ kết quả `callClaude`. */
export function signalStatusFor(result) {
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
