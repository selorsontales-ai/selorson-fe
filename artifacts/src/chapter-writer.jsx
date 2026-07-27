import { useState, useCallback, useRef, useMemo, useEffect } from "react";

/* ════════════════════════════════════════════════════════════════════
   NGƯỜI VIẾT CHƯƠNG (Chapter Writer) — Selorson Co-Writer CW-410

   Bốn việc:
     write      WriterPackV1 (Blueprint đã duyệt) → bản thảo
     revise     bản thảo + ghi chú tác giả        → bản thảo mới
     selfcheck  bản thảo hiện có                  → báo cáo tự kiểm
     continue   viết tiếp phần bị cắt vì hết token

   Kết quả cuối cùng luôn là một ChapterDraftEnvelopeV1 đã qua hợp đồng.
   Văn xuôi được sinh dạng Markdown thuần chứ không nhét trong JSON: một
   chương dài bị cắt giữa chuỗi JSON là không cứu được, cắt giữa văn xuôi
   thì nối tiếp là chuyện bình thường.

   File trong dist/ là bản SINH RA. Sửa ở artifacts/src/ + artifacts/lib/
   rồi chạy `node artifacts/build.mjs`.
   ════════════════════════════════════════════════════════════════════ */

// @inline ../lib/contracts.mjs
// @inline ../lib/runtime.mjs
// @inline ../lib/chapter-writer.mjs

/* ─── ICONS ─── */
const IconUp = ({ s = 15 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
const IconDown = ({ s = 15 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const IconPlay = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IconCopy = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
const IconSpin = ({ s = 14 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "cw-spin 1s linear infinite" }}><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.9" y1="4.9" x2="7.8" y2="7.8" /><line x1="16.2" y1="16.2" x2="19.1" y2="19.1" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.9" y1="19.1" x2="7.8" y2="16.2" /><line x1="16.2" y1="7.8" x2="19.1" y2="4.9" /></svg>;

/* ─── STYLE ─── */
const C = {
  bg: "#12100C", panel: "#1D1913", panel2: "#171310", border: "#3A3126",
  text: "#F2EDE4", dim: "#B0A491", accent: "#E0A458", accent2: "#D98A3C",
  ok: "#6EC28B", warn: "#E5B84B", danger: "#E2795F", input: "#0C0A07",
};
const box = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 };
const inp = { width: "100%", background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" };
const btn = (bg, fg = "#12100C") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });
const ghost = { ...btn("transparent", C.text), border: `1px solid ${C.border}`, fontWeight: 600 };
const cap = { display: "block", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: C.dim, marginBottom: 5, fontWeight: 700 };
const chip = (color) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: `${color}1F`, color, border: `1px solid ${color}55`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700 });
const hidden = { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" };

const MAX_CONTINUES = 4;
// Trần 16K cho mỗi lượt: request không stream vượt ngưỡng đó có nguy cơ
// chết vì timeout HTTP trước khi model viết xong. Chương dài đi tiếp
// bằng vòng nối, không bằng cách nâng trần.
const PROSE_MAX_TOKENS = 16000;
const CHECK_MAX_TOKENS = 8000;

const STATUS_COLOR = { passed: C.ok, warned: C.warn, failed: C.danger, not_run: C.dim };
const CHECK_COLOR = { pass: C.ok, warn: C.warn, fail: C.danger };

/** Trạng thái sidecar hiểu; "invalid" phải hạ về "error" để job dừng thay vì treo. */
const PHASE_META = {
  idle: [C.dim, "chờ", "idle"],
  writing: [C.accent, "đang viết", "running"],
  continuing: [C.warn, "đang viết tiếp", "running"],
  checking: [C.accent, "đang tự kiểm", "running"],
  truncated: [C.warn, "còn dở dang", "max_tokens"],
  max_tokens: [C.warn, "bị cắt", "max_tokens"],
  rate_limited: [C.warn, "hết hạn mức", "rate_limited"],
  invalid: [C.danger, "sai hợp đồng", "error"],
  error: [C.danger, "lỗi", "error"],
  ready: [C.ok, "xong", "done"],
};

export default function ChapterWriter() {
  /* ── cấu hình ── */
  const [action, setAction] = useState("write");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [effort, setEffort] = useState(DEFAULT_EFFORT);
  const [thinkingOn, setThinkingOn] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [autoSelfCheck, setAutoSelfCheck] = useState(true);
  const [jobId, setJobId] = useState("");
  const [inputHash, setInputHash] = useState("");

  /* ── đầu vào ── */
  const [pack, setPack] = useState(null);
  const [packName, setPackName] = useState("");
  const [packIssues, setPackIssues] = useState([]);
  const [reviseNotes, setReviseNotes] = useState("");

  /* ── kết quả ── */
  const [prose, setProse] = useState("");
  const [selfCheck, setSelfCheck] = useState(null);
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
  const [tab, setTab] = useState("prose");

  const promptRef = useRef(null);
  const packFileRef = useRef(null);
  const draftFileRef = useRef(null);
  const checkpointFileRef = useRef(null);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  const info = useMemo(() => modelInfo(model), [model]);
  const resultText = useMemo(() => (envelope ? JSON.stringify(envelope, null, 2) : ""), [envelope]);
  const validResult = envelope && issues.length === 0 ? resultText : "";
  const cleanProse = useMemo(() => stripSceneMarks(prose), [prose]);
  const ready = !!pack && (action === "write" || prose.trim().length > 0);

  const say = (message) => setToast(message);

  /* ─────────────── nạp đầu vào ─────────────── */

  /**
   * Nhận cả WriterPackV1 lẫn cặp Research Pack + Blueprint.
   *
   * CW-420 sẽ ghép hai cái sau thành WriterPack ở phía backend, nhưng
   * cho tới lúc đó tác giả vẫn phải chạy tay được, nên Artifact tự ghép.
   */
  const applyPack = useCallback((body, name) => {
    try {
      const parsed = JSON.parse(body);
      let normalized;
      if (parsed?.contract === CONTRACT_NAMES.writer) {
        normalized = normalizeWriterPack(parsed);
      } else if (parsed?.research && parsed?.blueprint) {
        normalized = normalizeWriterPack(buildWriterPack({
          research: parsed.research,
          blueprint: parsed.blueprint,
          style: parsed.style,
          previousTail: parsed.previous_tail,
        }));
      } else if (parsed?.contract === CONTRACT_NAMES.blueprint) {
        normalized = normalizeWriterPack(buildWriterPack({ research: {}, blueprint: parsed, style: {}, previousTail: "" }));
      } else {
        throw new Error("không nhận ra WriterPackV1, ChapterBlueprintV1, hay cặp {research, blueprint}");
      }

      const check = validateWriterPack(normalized);
      setPack(normalized);
      setPackName(name || "writer-pack.json");
      setPackIssues(check.errors);
      setError("");
      say(check.ok
        ? `✓ Đã nạp gói viết — ${normalized.blueprint?.scenes?.length ?? 0} cảnh`
        : "⚠ Nạp được nhưng gói viết có cảnh báo hợp đồng");
      return true;
    } catch (failure) {
      setError(`Gói viết lỗi: ${failure.message}`);
      return false;
    }
  }, []);

  const applyDraft = useCallback((body) => {
    setProse(String(body ?? ""));
    setSelfCheck(null);
    setEnvelope(null);
    setIssues([]);
    setError("");
    say("✓ Đã nạp bản thảo");
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
    if (typeof config.autoSelfCheck === "boolean") setAutoSelfCheck(config.autoSelfCheck);
    if (typeof config.instructions === "string") setInstructions(config.instructions);
    if (typeof config.reviseNotes === "string") setReviseNotes(config.reviseNotes);
    if (config.jobId) setJobId(config.jobId);
    if (config.inputHash) setInputHash(config.inputHash);

    if (typeof data.inputs?.pack === "string") applyPack(data.inputs.pack, data.inputs.pack_name);

    setAction(ACTIONS.includes(data.action) && data.action !== "continue" ? data.action : "write");
    setLastAction(data.action === "revise" ? "revise" : "write");
    setProse(data.raw ?? "");
    setSelfCheck(null);
    setTruncated(data.truncated === true);
    setEnvelope(null);
    setIssues([]);
    promptRef.current = null;
    setPhase(data.truncated ? "truncated" : "idle");
    say(data.truncated ? "⚠ Checkpoint còn dở dang — bấm “Viết tiếp”" : "✓ Đã nạp checkpoint");
    return true;
  }, [applyPack]);

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
    model, effort, thinkingOn, instructions,
    jobId: jobId || null,
    inputHash: inputHash || "manual",
  }), [model, effort, thinkingOn, instructions, jobId, inputHash]);

  /** Một lượt gọi, đã gắn cấu hình suy nghĩ và xử lý mọi kết cục. */
  const askOnce = useCallback(async (prompt, produced, continueWith, maxTokens, config) => {
    const request = {
      model: config.model,
      max_tokens: Math.min(maxTokens, modelInfo(config.model).maxOutput),
      system: prompt.system,
      messages: produced
        ? continuationMessages(prompt.user, produced, continueWith)
        : [{ role: "user", content: prompt.user }],
    };
    const tuned = applyReasoning(request, { model: config.model, thinkingOn: config.thinkingOn, effort: config.effort });
    if (tuned.notes.length) setNotes(tuned.notes);
    return callClaude(tuned.body);
  }, []);

  /** Chuyển một kết cục không-ok thành trạng thái UI + tín hiệu. Trả về true nếu đã dừng. */
  const handleFailure = useCallback((result, which, keep) => {
    if (result.outcome === "rate_limit") {
      setTruncated(true);
      setPhase("rate_limited");
      setError(`Hết hạn mức${result.resetTime ? ` — reset lúc ${result.resetTime}` : ""}. Xuất checkpoint rồi viết tiếp ở tài khoản khác.`);
      emitSignal(TOOL_NAME, "rate_limited", { action: which, resetsAt: result.resetsAt, resetTime: result.resetTime, keptChars: keep });
      return true;
    }
    if (result.outcome === "refusal") {
      setPhase("error");
      setError(`Bộ lọc an toàn từ chối${result.category ? ` (${result.category})` : ""}. Thử đổi sang Opus 4.8 hoặc viết lại chỉ thị.`);
      emitSignal(TOOL_NAME, "error", { action: which, reason: "refusal", category: result.category });
      return true;
    }
    if (result.outcome === "error") {
      setPhase("error");
      setError(result.message);
      emitSignal(TOOL_NAME, "error", { action: which, message: result.message });
      return true;
    }
    return false;
  }, []);

  const sealDraft = useCallback((body, wasTruncated, check, which) => {
    const context = writerContext(pack, currentConfig(), {
      warnings: wasTruncated ? ["Bản thảo bị cắt vì hết token — chưa viết xong."] : [],
      revisionOf: which === "revise" ? (envelope?.input_hash ?? null) : null,
    });
    const outcome = finishDraft({ prose: body, selfCheck: check, truncated: wasTruncated, context });
    setEnvelope(outcome.envelope);
    setIssues(outcome.validation.errors);
    setLastAction(which);

    if (!outcome.validation.ok) {
      setPhase("invalid");
      emitSignal(TOOL_NAME, "error", { action: which, reason: "contract_invalid", errors: outcome.validation.errors.slice(0, 8) });
      say(`⚠ Bản thảo chưa khớp hợp đồng (${outcome.validation.errors.length} lỗi)`);
      return outcome;
    }
    setPhase(wasTruncated ? "max_tokens" : "ready");
    emitSignal(TOOL_NAME, wasTruncated ? "max_tokens" : "ready", {
      action: which,
      contract: outcome.envelope.contract,
      chapter: outcome.envelope.chapter_number,
      words: outcome.envelope.word_count,
      selfCheck: outcome.envelope.self_check.status,
    });
    say(`✓ Bản thảo ${outcome.envelope.word_count.toLocaleString()} từ · tự kiểm ${outcome.envelope.self_check.status}`);
    return outcome;
  }, [pack, currentConfig, envelope]);

  /**
   * Lượt tự kiểm: đọc lại chính bản thảo vừa sinh, trả JSON.
   *
   * Trả về `{ stopped }` tách bạch với `{ check: null }`: một báo cáo
   * không đọc được vẫn cho phép đóng gói bản thảo (self_check = not_run),
   * còn hết hạn mức thì phải dừng hẳn để không ghi đè trạng thái xoay
   * tài khoản mà `handleFailure` vừa dựng.
   */
  const runSelfCheck = useCallback(async (body, config, which) => {
    setPhase("checking");
    emitSignal(TOOL_NAME, "generating", { action: "selfcheck", of: which });
    const prompt = buildSelfCheckPrompt(pack, stripSceneMarks(body), config);
    let produced = "";
    for (let round = 0; round <= 1; round += 1) {
      const result = await askOnce(prompt, produced, CONTINUE_JSON, CHECK_MAX_TOKENS, config);
      if (handleFailure(result, "selfcheck", body.length)) return { stopped: true, check: null };
      produced += result.text;
      setUsage(result.usage);
      if (!result.truncated) {
        try {
          return { stopped: false, check: parseSelfCheck(produced) };
        } catch (failure) {
          setNotes((current) => [...current, `Không đọc được báo cáo tự kiểm: ${failure.message}`]);
          return { stopped: false, check: null };
        }
      }
    }
    setNotes((current) => [...current, "Báo cáo tự kiểm bị cắt — bản thảo vẫn giữ nguyên."]);
    return { stopped: false, check: null };
  }, [pack, askOnce, handleFailure]);

  /**
   * Một lượt chạy trọn vẹn.
   *
   * Văn xuôi bị cắt thì nối tiếp tối đa MAX_CONTINUES lượt. Hết hạn mức
   * thì dừng ngay và giữ nguyên phần đã viết — sidecar đọc tín hiệu, lấy
   * checkpoint, rồi mới xoay tài khoản; viết tiếp lúc đó là ném đi công
   * đã làm.
   */
  const execute = useCallback(async (which, { resume = false } = {}) => {
    if (busy) return;
    const config = currentConfig();

    if (!pack) { setError("Cần nạp gói viết (WriterPack hoặc Blueprint) trước."); return; }
    if ((which === "revise" || which === "selfcheck") && !prose.trim()) {
      setError("Cần có bản thảo trước khi sửa hoặc tự kiểm.");
      return;
    }

    setBusy(true);
    setError("");
    setNotes([]);

    try {
      if (which === "selfcheck") {
        const outcome = await runSelfCheck(prose, config, "selfcheck");
        if (outcome.stopped) return;
        setSelfCheck(outcome.check);
        sealDraft(prose, truncated, outcome.check, "selfcheck");
        return;
      }

      setPhase("writing");
      emitSignal(TOOL_NAME, "generating", { action: which, resumed: resume });

      let prompt = promptRef.current;
      if (!resume || !prompt) {
        prompt = which === "revise"
          ? buildRevisePrompt(pack, stripSceneMarks(prose), reviseNotes, config)
          : buildWritePrompt(pack, config);
        promptRef.current = prompt;
      }

      // Sửa bài bắt đầu từ trang trắng: model trả về TOÀN BỘ bản mới, nên
      // giữ lại bản cũ ở đây sẽ nối bản mới vào đuôi bản cũ.
      let produced = resume ? prose : "";
      if (!resume) { setProse(""); setSelfCheck(null); setEnvelope(null); setIssues([]); setUsage(null); setTruncated(false); }

      let finished = false;
      for (let round = 0; round <= MAX_CONTINUES; round += 1) {
        const result = await askOnce(prompt, produced, CONTINUE_PROSE, PROSE_MAX_TOKENS, config);
        if (handleFailure(result, which, produced.length)) { setProse(produced); return; }

        produced += result.text;
        setProse(produced);
        setUsage(result.usage);
        if (!result.truncated) { finished = true; break; }
        setTruncated(true);
        setPhase("continuing");
      }

      if (!finished) {
        setPhase("truncated");
        setError(`Vẫn bị cắt sau ${MAX_CONTINUES} lượt nối. Bấm “Viết tiếp”, hoặc chia chương thành hai.`);
        emitSignal(TOOL_NAME, "max_tokens", { action: which, chars: produced.length });
        return;
      }

      setTruncated(false);
      const outcome = autoSelfCheck ? await runSelfCheck(produced, config, which) : { stopped: false, check: null };
      if (outcome.stopped) return;
      setSelfCheck(outcome.check);
      sealDraft(produced, false, outcome.check, which);
    } catch (failure) {
      setPhase("error");
      setError(`Lỗi không lường trước: ${failure.message}`);
      emitSignal(TOOL_NAME, "error", { action: which, message: failure.message });
    } finally {
      setBusy(false);
    }
  }, [busy, currentConfig, pack, prose, reviseNotes, autoSelfCheck, truncated, askOnce, handleFailure, runSelfCheck, sealDraft]);

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
    config: { model, effort, thinkingOn, autoSelfCheck, instructions, reviseNotes, jobId, inputHash },
    inputs: { pack: pack ? JSON.stringify(pack) : null, pack_name: packName },
    raw: prose,
  }), [lastAction, action, truncated, model, effort, thinkingOn, autoSelfCheck, instructions, reviseNotes, jobId, inputHash, pack, packName, prose]);

  const exportResult = () => {
    if (!envelope) return;
    download(resultText, `${envelope.contract}-ch${envelope.chapter_number}.json`, "application/json");
  };
  const exportMarkdown = () => {
    if (!envelope) return;
    download(draftMarkdown(envelope), `chuong-${envelope.chapter_number}.md`, "text/markdown");
  };
  const exportCheckpoint = () => download(JSON.stringify(checkpointData(), null, 2), `chapter-writer-checkpoint-${Date.now()}.json`, "application/json");
  const copyProse = () => { navigator.clipboard?.writeText(cleanProse); say("✓ Đã chép bản thảo"); };

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
    setProse(""); setSelfCheck(null); setReviseNotes("");
    setTruncated(false); setEnvelope(null); setIssues([]); setLastAction("");
    setUsage(null); setError(""); setNotes([]); setPhase("idle");
    setJobId(""); setInputHash(""); setInstructions("");
    say("Đã reset — dữ liệu đã sạch hoàn toàn");
  };

  /* ─────────────── BRIDGE __nf_ctl ─────────────── */

  // Runner gọi bridge ngoài vòng render của React, nên mọi thứ nó cần đi
  // qua một ref được gán lại mỗi lần render. Đóng gói trực tiếp vào
  // window sẽ khoá cứng state của lần render đầu tiên.
  const live = useRef({});
  live.current = {
    execute, checkpointData, resetAll, applyPack, applyDraft, applyCheckpoint,
    lastAction: lastAction || action,
    result: () => (envelope && issues.length === 0 ? resultText : null),
    set: { setAction, setModel, setEffort, setThinkingOn, setInstructions, setAutoSelfCheck, setReviseNotes, setJobId, setInputHash },
  };

  useEffect(() => {
    window.__nf_ctl = {
      tool: TOOL_NAME,
      version: TOOL_VERSION,
      schema: {
        contracts: { draft: CONTRACT_NAMES.draft, input: CONTRACT_NAMES.writer },
        config: [
          { key: "action", type: "enum", options: ["write", "revise", "selfcheck"] },
          { key: "model", type: "model", options: MODELS.map((entry) => entry.id) },
          { key: "effort", type: "enum", options: EFFORTS },
          { key: "thinkingOn", type: "bool" },
          { key: "autoSelfCheck", type: "bool" },
          { key: "instructions", type: "text" },
          { key: "reviseNotes", type: "text" },
          { key: "jobId", type: "string" },
          { key: "inputHash", type: "string" },
        ],
        imports: [
          { slot: "writer", label: "WriterPackV1 hoặc ChapterBlueprintV1 (.json)", accept: ".json" },
          { slot: "draft", label: "Bản thảo để sửa/tự kiểm (.md/.txt)", accept: ".md,.txt" },
          { slot: "checkpoint", label: "Checkpoint (.json)", accept: ".json" },
        ],
        actions: [
          { id: "write", label: "Viết chương" },
          { id: "revise", label: "Sửa theo ghi chú" },
          { id: "selfcheck", label: "Tự kiểm bản thảo" },
          { id: "continue", label: "Viết tiếp phần bị cắt" },
        ],
        outputs: ["result", "checkpoint"],
      },
      configure(config = {}) {
        const set = live.current.set;
        if (["write", "revise", "selfcheck"].includes(config.action)) set.setAction(config.action);
        if (config.model) set.setModel(String(config.model));
        if (config.effort) set.setEffort(String(config.effort));
        if (typeof config.thinkingOn === "boolean") set.setThinkingOn(config.thinkingOn);
        if (typeof config.autoSelfCheck === "boolean") set.setAutoSelfCheck(config.autoSelfCheck);
        if (config.instructions != null) set.setInstructions(String(config.instructions));
        if (config.reviseNotes != null) set.setReviseNotes(String(config.reviseNotes));
        if (config.jobId) set.setJobId(String(config.jobId));
        if (config.inputHash) set.setInputHash(String(config.inputHash));
        return true;
      },
      importFile(slot, name, body) {
        try {
          if (slot === "writer") return live.current.applyPack(String(body), name);
          if (slot === "draft") return live.current.applyDraft(String(body));
          if (slot === "checkpoint") return live.current.applyCheckpoint(JSON.parse(String(body)));
          return false;
        } catch {
          return false;
        }
      },
      run(requested) {
        const wanted = typeof requested === "string" && requested.trim() ? requested.trim() : "write";
        if (wanted === "continue") {
          live.current.execute(live.current.lastAction === "revise" ? "revise" : "write", { resume: true });
          return true;
        }
        if (!["write", "revise", "selfcheck"].includes(wanted)) return `ERR: hành động không hợp lệ: ${wanted}`;
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
  const blueprint = pack?.blueprint ?? null;
  const targetWords = blueprint?.target_words || 0;
  const written = countWords(cleanProse);

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: 18, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{`@keyframes cw-spin{to{transform:rotate(360deg)}} *{scrollbar-width:thin;scrollbar-color:${C.border} transparent}`}</style>

      {/* Đường DOM dự phòng khi bridge không dựng được. Chỉ trả kết quả
          đã qua hợp đồng, để một envelope hỏng không lọt vào canon. */}
      <textarea data-selorson-result readOnly value={validResult} style={hidden} tabIndex={-1} aria-hidden="true" />
      <span data-selorson-state style={hidden} aria-hidden="true">{wireState}</span>

      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>Người Viết Chương</div>
        <span style={chip(C.accent2)}>{TOOL_NAME} v{TOOL_VERSION}</span>
        <span style={chip(phaseColor)}>{phaseLabel}</span>
        {written > 0 && <span style={chip(targetWords && written < targetWords * 0.7 ? C.warn : C.dim)}>{written.toLocaleString()} / {targetWords ? targetWords.toLocaleString() : "?"} từ</span>}
        {usage && <span style={chip(C.dim)}>{usage.input.toLocaleString()} vào · {usage.output.toLocaleString()} ra</span>}
        <div style={{ marginLeft: "auto", fontSize: 12, color: C.dim }}>Selorson Co-Writer · CW-410</div>
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
            <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
              {[["write", "Viết"], ["revise", "Sửa"], ["selfcheck", "Tự kiểm"]].map(([id, title]) => (
                <button key={id} onClick={() => setAction(id)} style={{ ...(action === id ? btn(C.accent) : ghost), flex: 1, justifyContent: "center" }}>{title}</button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
              {action === "write" && "Viết trọn chương theo Blueprint đã duyệt, đủ cảnh, đủ beat, đúng ngôi kể và giọng tác giả đặt ra."}
              {action === "revise" && "Sửa đúng những gì ghi chú yêu cầu. Đoạn nào ghi chú không đụng tới thì giữ nguyên từng chữ."}
              {action === "selfcheck" && "Đối chiếu bản thảo hiện có với Blueprint và guardrails, rồi báo cáo mọi vấn đề — kể cả loại nhỏ."}
            </p>
            {action === "revise" && (
              <div style={{ marginTop: 12 }}>
                <span style={cap}>Ghi chú sửa của tác giả</span>
                <textarea value={reviseNotes} onChange={(event) => setReviseNotes(event.target.value)} rows={5} placeholder="Ví dụ: cảnh 2 quá nhanh, thêm khoảng lặng trước khi nhân vật quyết định. Bỏ đoạn giải thích ở cuối cảnh 3." style={{ ...inp, resize: "vertical" }} />
              </div>
            )}
          </section>

          <section style={box}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>2 · Nguồn</div>

            <div style={{ marginBottom: 12 }}>
              <span style={cap}>Gói viết <em style={{ color: C.accent2, fontStyle: "normal" }}>· bắt buộc</em></span>
              <input ref={packFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={(event) => readFile(event, applyPack)} />
              <button onClick={() => packFileRef.current?.click()} style={{ ...ghost, width: "100%", justifyContent: "center" }}><IconUp /> {packName || "Chọn WriterPack / Blueprint (.json)"}</button>
              {pack && (
                <div style={{ marginTop: 7, fontSize: 12, color: C.dim }}>
                  <code style={{ color: C.text }}>{pack.project_id}</code> · chương {pack.chapter_number} · {blueprint?.scenes?.length ?? 0} cảnh · {pack.context_blocks.length} khối tư liệu
                  {packIssues.length > 0 && <div style={{ color: C.warn, marginTop: 4 }}>⚠ {packIssues.length} cảnh báo — {packIssues[0]}</div>}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <span style={cap}>Bản thảo có sẵn {(action === "revise" || action === "selfcheck") && <em style={{ color: C.accent2, fontStyle: "normal" }}>· bắt buộc</em>}</span>
              <input ref={draftFileRef} type="file" accept=".md,.txt" style={{ display: "none" }} onChange={(event) => readFile(event, applyDraft)} />
              <button onClick={() => draftFileRef.current?.click()} style={{ ...ghost, width: "100%", justifyContent: "center" }}><IconUp /> Nạp bản thảo (.md/.txt)</button>
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
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={autoSelfCheck} onChange={(event) => setAutoSelfCheck(event.target.checked)} />
              Tự kiểm ngay sau khi viết xong
            </label>
            <div style={{ marginTop: 10 }}>
              <span style={cap}>Chỉ thị thêm của tác giả</span>
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="Ví dụ: đối thoại ngắn, ít tính từ, không tổng kết ở cuối cảnh." style={{ ...inp, resize: "vertical" }} />
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
            </div>
          </section>
        </div>

        {/* ── CỘT PHẢI ── */}
        <div style={{ display: "grid", gap: 12 }}>
          <section style={{ ...box, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button data-selorson-run onClick={() => execute(action)} disabled={busy || !ready} style={{ ...btn(ready && !busy ? C.accent : C.border, ready && !busy ? "#12100C" : C.dim), cursor: busy || !ready ? "not-allowed" : "pointer" }}>
              {busy ? <IconSpin /> : <IconPlay />} {busy ? "Đang chạy…" : action === "write" ? "Viết chương" : action === "revise" ? "Sửa bản thảo" : "Tự kiểm"}
            </button>
            {prose && (truncated || phase === "truncated" || phase === "rate_limited") && (
              <button onClick={() => execute(lastAction === "revise" ? "revise" : "write", { resume: true })} disabled={busy} style={btn(C.warn)}>Viết tiếp</button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={copyProse} disabled={!prose} style={{ ...ghost, opacity: prose ? 1 : 0.45 }}><IconCopy /> Chép bản thảo</button>
            <button onClick={exportMarkdown} disabled={!envelope} style={{ ...ghost, opacity: envelope ? 1 : 0.45 }}><IconDown /> Markdown</button>
            <button onClick={exportResult} disabled={!envelope} style={{ ...ghost, opacity: envelope ? 1 : 0.45 }}><IconDown /> Xuất JSON</button>
            <button onClick={() => resetAll(false)} style={{ ...ghost, borderColor: clearArmed ? C.danger : C.border, color: clearArmed ? C.danger : C.text }}>{clearArmed ? "Bấm lần nữa" : "Reset"}</button>
          </section>

          {issues.length > 0 && (
            <section style={{ ...box, borderColor: `${C.danger}66`, background: `${C.danger}0F` }}>
              <div style={{ fontWeight: 800, color: C.danger, marginBottom: 8 }}>Bản thảo chưa khớp hợp đồng ({issues.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
                {issues.slice(0, 12).map((issue, index) => <li key={index}><code>{issue}</code></li>)}
              </ul>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 10 }}>Runner không nhận kết quả này. Viết lại, hoặc sửa rồi tự kiểm lần nữa.</div>
            </section>
          )}

          {envelope && <SelfCheckView envelope={envelope} />}

          <section style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {[["prose", "Bản thảo"], ["outline", "Đối chiếu Blueprint"], ["json", "Envelope thô"]].map(([id, title]) => (
                <button key={id} onClick={() => setTab(id)} style={{ ...(tab === id ? btn(C.accent) : ghost), padding: "6px 12px", fontSize: 12.5 }}>{title}</button>
              ))}
              <span style={{ ...chip(phaseColor), marginLeft: "auto" }}>{phase}</span>
            </div>

            {tab === "prose" && (
              <textarea
                readOnly
                value={cleanProse}
                rows={24}
                placeholder="Bản thảo sẽ hiện ở đây sau khi chạy."
                style={{ ...inp, fontSize: 14.5, lineHeight: 1.85, resize: "vertical" }}
              />
            )}
            {tab === "outline" && <OutlineView blueprint={blueprint} envelope={envelope} />}
            {tab === "json" && (
              <textarea
                readOnly
                value={resultText}
                rows={22}
                placeholder="Envelope sẽ hiện ở đây sau khi bản thảo qua hợp đồng."
                style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.55, resize: "vertical" }}
              />
            )}
          </section>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, boxShadow: "0 10px 34px rgba(0,0,0,.5)" }}>{toast}</div>
      )}
    </div>
  );
}

/* ─── Báo cáo tự kiểm ─── */
function SelfCheckView({ envelope }) {
  const check = envelope.self_check;
  return (
    <section style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800 }}>Tự kiểm</div>
        <span style={chip(STATUS_COLOR[check.status] ?? C.dim)}>{check.status}</span>
        <span style={chip(C.dim)}>{envelope.word_count.toLocaleString()} từ</span>
        {envelope.truncated && <span style={chip(C.warn)}>chưa viết xong</span>}
        {check.unresolved_beats.length > 0 && <span style={chip(C.danger)}>{check.unresolved_beats.length} beat còn thiếu</span>}
      </div>
      {check.status === "not_run" && <div style={{ fontSize: 12.5, color: C.dim }}>Chưa chạy tự kiểm. Bấm “Tự kiểm” để soi bản thảo này.</div>}
      {check.checks.map((entry) => (
        <div key={entry.id} style={{ display: "flex", gap: 9, alignItems: "baseline", fontSize: 12.5, padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
          <span style={{ ...chip(CHECK_COLOR[entry.status] ?? C.dim), minWidth: 54, justifyContent: "center" }}>{entry.status}</span>
          <div>
            <strong>{entry.label}</strong>
            {entry.detail && <div style={{ color: C.dim, lineHeight: 1.55 }}>{entry.detail}</div>}
          </div>
        </div>
      ))}
      {check.unresolved_beats.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <div style={{ fontWeight: 800, color: C.danger, marginBottom: 5 }}>Beat chưa thấy trong bản thảo</div>
          {check.unresolved_beats.map((entry, index) => (
            <div key={index} style={{ color: C.dim }}>{entry.scene_id || "?"} — {entry.beat}</div>
          ))}
        </div>
      )}
      {envelope.warnings.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: C.warn }}>
          {envelope.warnings.map((warning, index) => <div key={index}>⚠ {warning}</div>)}
        </div>
      )}
    </section>
  );
}

/* ─── Đối chiếu cảnh Blueprint với bản thảo ─── */
function OutlineView({ blueprint, envelope }) {
  if (!blueprint?.scenes?.length) {
    return <div style={{ fontSize: 12.5, color: C.dim }}>Chưa nạp Blueprint nên không đối chiếu được.</div>;
  }
  const written = new Map((envelope?.scene_map ?? []).map((entry) => [entry.scene_id, entry]));
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {blueprint.scenes.map((scene) => {
        const actual = written.get(scene.id);
        const gap = actual && scene.target_words ? Math.round((actual.words / scene.target_words) * 100) : null;
        return (
          <div key={scene.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 11 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 5 }}>
              <span style={{ fontWeight: 800, color: C.accent2 }}>{scene.order}.</span>
              <span style={{ fontWeight: 700 }}>{scene.purpose}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: actual ? (gap !== null && gap < 60 ? C.warn : C.dim) : C.danger }}>
                {actual ? `${actual.words} / ${scene.target_words} từ${gap !== null ? ` · ${gap}%` : ""}` : "chưa thấy trong bản thảo"}
              </span>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: C.dim }}>
              {scene.beats.map((beat, index) => <li key={index}>{beat}</li>)}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
