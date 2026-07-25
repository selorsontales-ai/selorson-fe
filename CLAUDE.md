# Claude Code bootstrap

Before working on Selorson Co-Writer, read:

- `E:\Selorson\backend-v3\docs\co-writer\MASTER_PLAN.md`
- `E:\Selorson\backend-v3\docs\co-writer\WORK_BOARD.md`
- `E:\Selorson\backend-v3\docs\co-writer\HANDOFF.md`
- `E:\Selorson\backend-v3\docs\co-writer\RELEASE_MATRIX.yaml`

Run `rtk git status --short --branch` in backend and frontend, claim one task,
and preserve all uncommitted work. Use the same task ID across both repos when
a change crosses the boundary.

Runner code is Selorson-owned and desktop-only. Do not depend on NeuroForge.
Do not create desktop/dev/deploy branches. Update the canonical work board and
handoff before stopping or transferring work to Codex.
