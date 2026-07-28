# Runtime audit

Last reviewed: 2026-07-28

This is the living list of confirmed, unresolved issues found while checking
the development server, the packaged Tauri desktop app, and the Cloudflare web
deployment. Resolved findings are removed rather than archived here.

## Remaining issues

No confirmed unresolved runtime defect remains after focused validation.

## Deployment readiness

- Production stays on the provider hostnames because no custom domain has been
  purchased: `selorson-v3-api.fly.dev` and
  `selorson-frontend-v3.pages.dev`.
- GitHub repository secrets were confirmed by name for Fly and Cloudflare.
  Values were not displayed.
- The production dependency audit (`npm audit --omit=dev`) reported zero
  vulnerabilities. No package was updated and no audit fix was run.
- Backend must deploy before frontend. The OpenAI provider migration is an
  optional idempotent data insert, not a schema prerequisite, and is deferred
  from this release.
- Direct `flyctl` rollback requires a fresh CLI login on this machine. Normal
  deployment uses GitHub Actions and the existing `FLY_API_TOKEN` secret.

## Runtime model verified

- Development: Vite/SvelteKit at `http://localhost:5173`, with the Rust backend
  at `http://localhost:8001`.
- Desktop development: Tauri opens the Vite URL and starts the embedded Rust
  backend.
- Packaged desktop: `adapter-static` SPA in `build`, with the embedded backend
  and desktop environment configuration. The release workflow now builds MSI
  and NSIS installers and smoke-tests packaged Profile, Settings, Messages,
  Admin, and direct navigation.
- Web deployment: `adapter-cloudflare` SSR using the remote Fly.io API.

Focused verification on 2026-07-28: all nine runtime regression tests passed,
Svelte check completed with zero errors and zero warnings, the backend compiled
for all targets, the focused health API test passed, the public web bundle had
no desktop-only symbol, the Git diff passed whitespace validation, and the web
SSR/client production build completed successfully.
