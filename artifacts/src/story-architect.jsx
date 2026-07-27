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

// @inline ../lib/contracts.mjs
// @inline ../lib/runtime.mjs
// @inline ../lib/story-architect.mjs

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
