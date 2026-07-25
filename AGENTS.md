# Co-Writer agent bootstrap

Canonical Co-Writer planning and handoff live in the sibling backend:

1. `..\backend-v3\docs\co-writer\MASTER_PLAN.md`
2. `..\backend-v3\docs\co-writer\WORK_BOARD.md`
3. `..\backend-v3\docs\co-writer\HANDOFF.md`
4. `..\backend-v3\docs\co-writer\RELEASE_MATRIX.yaml`

Read all four, then run `rtk git status --short --branch` in both repositories
and claim one task ID before editing.

Mandatory rules:

- Prefix shell commands with `rtk`.
- Prefer codebase-memory for structural discovery.
- Follow Karpathy guidelines and make surgical, verified changes.
- Preserve all existing uncommitted work.
- Keep Playwright, CDP, account profiles, and runner processes inside Tauri;
  web builds and Fly deploy must not contain them.
- NeuroForge is reference-only.
- Update the backend work board and handoff before pausing.
