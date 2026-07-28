# Claude Code bootstrap

Before working on Selorson Co-Writer, read:

- `E:\Selorson\backend-v3\docs\co-writer\MASTER_PLAN.md`
- `E:\Selorson\backend-v3\docs\co-writer\WORK_BOARD.md`
- `E:\Selorson\backend-v3\docs\co-writer\HANDOFF.md`
- `E:\Selorson\backend-v3\docs\co-writer\RELEASE_MATRIX.yaml`

Run `rtk git status --short --branch` in backend and frontend, claim one task,
and preserve all uncommitted work. Use the same task ID across both repos when
a change crosses the boundary.

## Behavioral Rules (Karpathy Guidelines)

**Tradeoff:** Bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
- State assumptions explicitly. If unsure, ask.
- Multiple interpretations → present all, don't pick silently.
- Simpler approach exists → say so, push back when warranted.

### 2. Simplicity First
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- 200 lines when 50 would do → rewrite.

### 3. Surgical Changes
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing code style, even if you'd do it differently.
- Spot unrelated dead code → mention it, don't delete it.
- Every changed line must trace back to the user's request.

### 4. Goal-Driven Execution
- Turn tasks into verifiable goals:
  - "Add validation" → "Write tests for bad input, then make them pass"
  - "Fix bug" → "Write a test that reproduces it, then make it pass"
- Multi-step work → list a brief plan with verification for each step.

Runner code is Selorson-owned and desktop-only. Do not depend on NeuroForge.
Do not create desktop/dev/deploy branches. Update the canonical work board and
handoff before stopping or transferring work to Codex.
