# Co-Writer maintenance

The five-phase Co-Writer upgrade is complete. Maintain the shipped system;
do not recreate phase boards, handoff logs, or task-claim workflows.

Before changing Co-Writer code, inspect the affected contracts in
..\backend-v3\docs\co-writer\contracts\ and, when release compatibility
matters, ..\backend-v3\docs\co-writer\RELEASE_MATRIX.yaml. Preserve all
existing uncommitted work in both repositories.

Mandatory rules:

- Prefix shell commands with tk.
- Prefer codebase-memory for structural discovery.
- Make surgical, verified changes.
- Keep Playwright, CDP, account profiles, and runner processes inside Tauri;
  web builds and Fly deploy must not contain them.
- NeuroForge is reference-only.