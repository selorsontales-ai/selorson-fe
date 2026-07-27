// Dữ liệu mẫu dùng chung cho các bộ test Artifact.
//
// Fixture cố tình nhỏ và viết tay: nó mô tả đúng những gì backend gửi
// sang, không phải một bản chụp của một lần chạy thật. Một lần chạy thật
// đổi hình dạng thì test phải gãy chứ không được im lặng đi theo.

export function researchPackFixture(overrides = {}) {
  return {
    contract: "ChapterResearchPackV1",
    schema_version: 1,
    project_id: "selorson-tales",
    chapter_number: 12,
    generated_at: "2026-07-27T02:00:00.000Z",
    intent: {
      premise: "Lâm phát hiện người anh đã bán bí mật của gia tộc.",
      goals: ["đẩy Lâm tới quyết định rời nhà"],
      must_include: ["cây cầu đá"],
      must_avoid: ["đối thoại giải thích quá khứ"],
    },
    chapter_contract: {
      pov: "Lâm",
      tense: "quá khứ",
      language: "vi",
      target_words: 2600,
    },
    recent_canon: [{ chapter_number: 11, summary: "Lâm về làng sau ba năm.", content_hash: "abc" }],
    open_loops: [{ id: "loop-thu", description: "Bức thư chưa mở", opened_in_chapter: 9, status: "open" }],
    entities: [{ name: "Lâm", kind: "character", summary: "Em út, vừa về làng." }],
    blocks: [
      {
        chunk_id: 101,
        document_id: 4,
        source_file: "the-gioi/gia-toc.md",
        heading: "Luật giữ bí mật",
        chapter_number: null,
        text: "Gia tộc họ Đinh giữ một điều luật: ai để lộ vị trí hầm sách thì bị xoá tên khỏi gia phả.",
        token_count: 40,
        channels: ["lexical", "tree"],
        reason: "khớp từ khoá bí mật gia tộc",
        fused_score: 0.82,
      },
      {
        chunk_id: 102,
        document_id: 4,
        source_file: "the-gioi/dia-danh.md",
        heading: "Cầu đá",
        chapter_number: null,
        text: "Cây cầu đá bắc qua suối cạn, mỗi mùa lũ lại mất một phiến, không ai chịu sửa.",
        token_count: 32,
        channels: ["entity"],
        reason: "địa danh tác giả yêu cầu",
        fused_score: 0.61,
      },
    ],
    trace: { terms: ["bí", "mật", "gia", "tộc"], channel_counts: { lexical: 8, entity: 3, tree: 2 } },
    warnings: [],
    ...overrides,
  };
}

/** Đầu ra model cho hành động `plan`, ở dạng lỏng lẻo như model thật trả về. */
export function planOutputFixture(overrides = {}) {
  return {
    title: "Phiến đá thiếu",
    logline: "Lâm biết ai đã bán bí mật, và biết mình không thể ở lại.",
    pov: "Lâm",
    tense: "quá khứ",
    language: "vi",
    target_words: 2600,
    scenes: [
      {
        id: "scene-1",
        order: 1,
        purpose: "Đặt Lâm trước bằng chứng đầu tiên",
        setting: "hầm sách nhà họ Đinh",
        time: "rạng sáng",
        pov_character: "Lâm",
        characters: ["Lâm"],
        beats: ["Lâm xuống hầm sách", "Thấy dấu tay lạ trên bìa sổ", "Nhận ra nét chữ của anh"],
        conflict: "Lâm không muốn tin điều mình vừa thấy",
        turn: "Lâm nhận ra nét chữ",
        exit_state: "Lâm biết, nhưng chưa nói với ai",
        target_words: 1200,
        evidence: [{ chunk_id: 101, source: "the-gioi/gia-toc.md", why: "luật xoá tên làm hành vi của anh thành phản bội" }],
      },
      {
        id: "scene-2",
        order: 2,
        purpose: "Buộc Lâm chọn giữa im lặng và rời đi",
        setting: "cầu đá qua suối cạn",
        time: "chiều",
        pov_character: "Lâm",
        characters: ["Lâm", "người anh"],
        beats: ["Hai anh em gặp nhau trên cầu", "Người anh không chối", "Lâm quay lưng đi"],
        conflict: "người anh đưa ra lý do Lâm không bác được",
        turn: "Lâm quay lưng",
        exit_state: "Lâm rời làng",
        target_words: 1400,
        evidence: [
          { chunk_id: 102, source: "the-gioi/dia-danh.md", why: "cầu đá là nơi tác giả yêu cầu đưa vào" },
          { chunk_id: 999, source: "bịa.md", why: "id này không có trong Research Pack" },
        ],
      },
    ],
    continuity: {
      carried_state: [{ subject: "Lâm", fact: "vừa về làng sau ba năm", evidence: [] }],
      open_loops_touched: [{ id: "loop-thu", action: "deepen", note: "bức thư vẫn chưa mở" }],
      new_loops: [{ description: "Ai đã trả tiền cho người anh", payoff_horizon: "trong vòng năm chương" }],
      contradictions: [],
    },
    guardrails: { must_include: ["cây cầu đá"], must_avoid: ["đối thoại giải thích quá khứ"], forbidden_words: [] },
    risks: [{ risk: "cảnh 2 dễ thành đối thoại giải thích", mitigation: "để người anh nói ít, hành động nhiều" }],
    warnings: [],
    ...overrides,
  };
}

export const CHAPTER_TEXT = [
  "Lâm xuống hầm sách khi trời còn chưa rạng.",
  "Trên bìa sổ có một dấu tay không phải của ông nội.",
  "Đến chiều, hai anh em đứng ở hai đầu cầu đá.",
  "Người anh không chối một câu nào.",
].join("\n\n");

/** Đầu ra model cho hành động `analyze`. Trích dẫn thứ hai là bịa. */
export function analyzeOutputFixture(overrides = {}) {
  return {
    summary: {
      short: "Lâm phát hiện anh mình phản bội và rời làng.",
      long: "Lâm xuống hầm sách, thấy dấu tay lạ, rồi đối mặt người anh trên cầu đá.",
      scenes: [
        { order: 1, title: "Hầm sách", summary: "Lâm thấy dấu tay lạ." },
        { order: 2, title: "Cầu đá", summary: "Người anh không chối." },
      ],
    },
    projections: [
      {
        projection_type: "event",
        subject_key: "lam-phat-hien-dau-tay",
        payload: { chapter: 12, actor: "Lâm" },
        evidence: { start: 0, end: 10, quote: "Trên bìa sổ có một dấu tay không phải của ông nội." },
        confidence: 0.9,
      },
      {
        projection_type: "entity_state",
        subject_key: "Lâm",
        payload: { location: "rời làng" },
        evidence: { start: 0, end: 5, quote: "Câu này không hề có trong chương." },
        confidence: 0.7,
      },
      {
        projection_type: "relationship",
        subject_key: "Lâm↔người anh",
        payload: { state: "đổ vỡ" },
        evidence: { start: 0, end: 0, quote: "Người anh không chối một câu nào." },
        confidence: 0.85,
      },
    ],
    contradictions: [],
    warnings: [],
    ...overrides,
  };
}

export function blueprintFixture(context) {
  return {
    contract: "ChapterBlueprintV1",
    schema_version: 1,
    project_id: context.projectId,
    chapter_number: context.chapterNumber,
    job_id: null,
    input_hash: "hash-1",
    producer: {
      tool: "story_architect",
      tool_version: "1.0.0",
      model: "claude-opus-5",
      effort: "high",
      thinking: true,
      generated_at: "2026-07-27T02:05:00.000Z",
    },
    title: "Phiến đá thiếu",
    logline: "Lâm biết ai đã bán bí mật.",
    pov: "Lâm",
    tense: "quá khứ",
    language: "vi",
    target_words: 2600,
    scenes: [
      {
        id: "scene-1", order: 1, purpose: "Đặt Lâm trước bằng chứng", setting: "hầm sách", time: "rạng sáng",
        pov_character: "Lâm", characters: ["Lâm"], beats: ["Lâm xuống hầm sách"],
        conflict: "", turn: "", exit_state: "", target_words: 1200, evidence: [],
      },
      {
        id: "scene-2", order: 2, purpose: "Buộc Lâm chọn", setting: "cầu đá", time: "chiều",
        pov_character: "Lâm", characters: ["Lâm"], beats: ["Hai anh em gặp nhau"],
        conflict: "", turn: "", exit_state: "", target_words: 1400, evidence: [],
      },
    ],
    continuity: { carried_state: [], open_loops_touched: [], new_loops: [], contradictions: [] },
    guardrails: { must_include: [], must_avoid: [], forbidden_words: [] },
    risks: [],
    warnings: [],
    provenance: { research_input_hash: "hash-1", blocks_used: [101], blocks_unused: [102] },
  };
}

export const DRAFT_PROSE = [
  "<!-- scene: scene-1 -->",
  "Lâm xuống hầm sách khi trời còn chưa rạng. Bậc thang thứ tư vẫn kêu như ba năm trước.",
  "",
  "<!-- scene: scene-2 -->",
  "Chiều xuống, cây cầu đá lại thiếu một phiến. Người anh đứng ở đầu bên kia, không bước qua.",
].join("\n");

export function selfCheckOutputFixture(overrides = {}) {
  return {
    checks: [
      { id: "scene_coverage", label: "Đủ cảnh", status: "pass", detail: "cả hai cảnh đều có dấu đánh dấu." },
      { id: "length", label: "Độ dài", status: "warn", detail: "mới đạt khoảng 5% mục tiêu 2600 từ." },
    ],
    unresolved_beats: [{ scene_id: "scene-2", beat: "Lâm quay lưng đi" }],
    notes: "",
    ...overrides,
  };
}
