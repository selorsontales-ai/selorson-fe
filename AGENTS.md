# Selorson maintenance

The five-phase Co-Writer upgrade is complete. Maintain the shipped system;
do not recreate phase boards, handoff logs, or task-claim workflows.

Before changing Co-Writer code, inspect the affected contracts in
`..\backend-v3\docs\co-writer\contracts\` and, when release compatibility
matters, `..\backend-v3\docs\co-writer\RELEASE_MATRIX.yaml`. Preserve all
existing uncommitted work in both repositories.

Git workflow:

- `main` is the production branch.
- `dev` is the integrated system-test branch.
- `qa` is the functional acceptance branch.
- Create temporary `feature/*` or `fix/*` branches from `qa`, then promote
  changes in order: `qa` -> `dev` -> `main`.
- Web, desktop-admin, desktop-user, android-admin, and android-user are build
  targets from shared source, not permanent flavor branches.
- Desktop Admin releases use only `desktop-admin-vX.Y.Z` tags.

Mandatory rules:

- Prefix shell commands with `rtk`.
- Prefer codebase-memory for structural discovery.
- Make surgical, verified changes.
- Keep Playwright, CDP, account profiles, and runner processes inside Tauri;
  web builds and Fly deploy must not contain them.
- NeuroForge is reference-only.

