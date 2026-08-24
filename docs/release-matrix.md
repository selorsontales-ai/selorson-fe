# Release matrix

Every distributable is identified by two independent axes: platform and
audience. A user build is not an admin build with hidden navigation; its admin
route modules are absent from the compiled SvelteKit manifest.

| Flavor          | UI included                                       | Native capability                         | Release channel                                                 |
| --------------- | ------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `web-user`      | Public/user routes                                | Browser only                              | Automatic public Cloudflare deploy via `deploy.yml`             |
| `web-admin`     | Admin business routes, excluding desktop tools    | Browser only                              | Manual, dedicated Cloudflare project via `deploy-web-admin.yml` |
| `desktop-user`  | Public/user routes                                | Minimal Tauri shell                       | `desktop-user-vX.Y.Z` via `release-desktop-user.yml`            |
| `desktop-admin` | All admin routes, including local AI/update tools | Embedded backend, runner and admin bridge | `desktop-admin-vX.Y.Z` via `release-desktop-admin.yml`          |
| `android-user`  | Public/user routes                                | Capacitor user application ID/assets      | `android-user-vX.Y.Z` via `release-android.yml`                 |
| `android-admin` | Admin business routes, excluding desktop tools    | Capacitor admin application ID/assets     | `android-admin-vX.Y.Z` via `release-android.yml`                |

The repository currently has an Android native project only. “Mobile” in npm
scripts therefore means Android; there is no implied or partially configured
iOS release.

Android releases publish a **signed APK**, not an App Bundle. Neither audience
ships through Google Play, and an `.aab` cannot be installed on a device — it is
an upload format for the Play Console. Switching an audience to Play later means
changing that audience's gradle task to `bundle<Audience>Release` and adding a
Play upload step; nothing else in the workflow depends on the artifact type.

Because the release APK is signed with the audience keystore, it will not
install over a build signed by a different key — an earlier Android Studio debug
install has to be uninstalled first. After that, upgrades install in place as
long as `versionCode` keeps increasing.

## Boundary enforcement

- `scripts/flavor-routes.cjs` creates a build-specific route tree.
- `scripts/flavor-dev.cjs` applies the same route boundary during local
  development and refreshes the generated tree when routes or `app.css` change.
- `scripts/verify-flavor-bundle.cjs` fails when a user manifest contains admin
  routes, a non-desktop bundle contains desktop-admin routes/bridge symbols, or
  desktop-admin is missing a required local tool.
- `.github/workflows/flavor-boundaries.yml` builds all six bundles sequentially.
  It is separate from the public web gate so native-flavor checks cannot delay
  the production website.
- Both Cloudflare workflows upload static build artifacts and deploy them from a
  fresh runner. Application build scripts never share a runner with Cloudflare
  deployment credentials.
- The desktop-admin 30-day session policy remains intentional and independent
  of flavor routing.

## Required release configuration

Web admin:

- Repository variable `CLOUDFLARE_ADMIN_PROJECT_NAME`; it must not equal the
  public `selorson-frontend-v3` project.
- Existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

Desktop:

- `DESKTOP_BACKEND_REF` must be an immutable 40-character backend commit SHA.
- `BACKEND_REPO_TOKEN` when the backend repository is private. Both application
  repositories are private today, so this token is required, not optional: the
  workflow's fallback `github.token` cannot read a second private repository.
- Releases are published to a **public** repository, separate from the private
  source: `selorsontales-ai/selorson-ad` for admin,
  `selorsontales-ai/selorson-us` for user. This separation is what makes the
  updater work at all — the installed app fetches
  `releases/latest/download/latest.json` with no credentials, so a release
  parked in a private repository is invisible to every installed copy.
- `TAURI_UPDATER_PUBLIC_KEY` must be the exact public key already committed in
  `src-tauri/tauri.conf.json`. An installed app verifies the update signature
  against the key baked into *its own* build, so replacing the signing key
  strands every copy already in the field.
- Desktop-admin keeps its existing updater variables/secrets. Its publish token
  is injected only on a clean publish runner, never on the backend build runner.

Android uses separate signing identities for each audience:

- Admin: `ANDROID_ADMIN_KEYSTORE_BASE64`,
  `ANDROID_ADMIN_KEYSTORE_PASSWORD`, `ANDROID_ADMIN_KEY_ALIAS`,
  `ANDROID_ADMIN_KEY_PASSWORD`.
- User: `ANDROID_USER_KEYSTORE_BASE64`,
  `ANDROID_USER_KEYSTORE_PASSWORD`, `ANDROID_USER_KEY_ALIAS`,
  `ANDROID_USER_KEY_PASSWORD`.

Stable tagged Android releases derive `versionCode` deterministically as
`major * 1,000,000 + minor * 1,000 + patch`; minor and patch must be at most 999. Prereleases use a manual run with an explicitly monotonic `version_code`.
The build runner holds the selected keystore but only read repository
permissions; publishing occurs on a fresh runner that never receives the
keystore.
