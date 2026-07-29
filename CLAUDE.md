# Co-Writer maintenance context

The five-phase Co-Writer upgrade is complete. Maintain the shipped system;
do not recreate phase boards, handoff logs, or task-claim workflows.

Before editing, inspect the affected contracts in
E:\Selorson\backend-v3\docs\co-writer\contracts\. For release
compatibility, use E:\Selorson\backend-v3\docs\co-writer\RELEASE_MATRIX.yaml.
Preserve existing work in both repositories and run the applicable checks.

Use the shared Git flow: temporary `feature/*` or `fix/*` branches promote to
`qa`, then `dev`, then production `main`. Build flavors are selected by
workflow/tag and must not become separate long-lived source branches.

