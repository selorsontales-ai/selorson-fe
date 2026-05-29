# Selorson V3 — Frontend

Nền tảng nội dung đa phương tiện (Truyện, Video, Nhạc) và cộng đồng sáng tạo.

## Kiến trúc

Selorson V3 Frontend được xây dựng bằng **SvelteKit** và hỗ trợ 3 nền tảng từ cùng một codebase:

| Nền tảng | Công nghệ | Adapter | API Server |
|----------|-----------|---------|------------|
| **Web** | Cloudflare Pages | `adapter-cloudflare` | Fly.io (remote) |
| **Mobile** | Capacitor → Android APK | `adapter-static` (SPA) | Fly.io (remote) |
| **Desktop** | Tauri → Windows `.exe` | `adapter-static` (SPA) | Nhúng sẵn (localhost) |

## Environment Files

| File | Khi nào dùng | API trỏ tới |
|------|-------------|-------------|
| `.env` | `vite dev` (development) | `localhost:8001` |
| `.env.production` | `vite build` (web + mobile) | `fly.dev` (production) |
| `.env.desktop` | `vite build --mode desktop` (Tauri) | `localhost:8001` |

## Scripts

```bash
# ── Development ──
npm run dev              # Web development (browser)
npm run dev:mobile       # Mobile development (với --host)
npm run dev:desktop      # Desktop development (Tauri dev)

# ── Build ──
npm run build            # Web production (Cloudflare Pages)
npm run build:web        # Web production (alias)
npm run build:mobile     # Mobile SPA (Capacitor/Android)
npm run build:desktop    # Desktop SPA (Tauri, đọc .env.desktop)

# ── Tauri ──
npm run tauri build      # Đóng gói Desktop App (.exe + .msi)
npm run tauri dev        # Chạy Desktop App ở chế độ dev
```

## Desktop App (Tauri)

### Đặc điểm
- **Backend nhúng sẵn:** Không cần chạy server riêng, backend Rust (Axum) được nhúng trực tiếp trong app
- **Database local:** Dùng PostgreSQL + Redis trên máy local
- **Co-Writer:** Tự động bật chế độ read-write cho AI Co-Writer
- **Token dài hạn:** JWT token sống 30 ngày (chỉ cho desktop, production vẫn 30 phút)
- **CORS:** Backend cho phép origin `http://tauri.localhost` (Windows) và `tauri://localhost` (macOS)

### Cấu hình Desktop
- `src-tauri/tauri.conf.json` — Cấu hình Tauri (tên app, icons, bundler)
- `src-tauri/src/lib.rs` — Entry point, nhúng backend + set env vars
- `src-tauri/Cargo.toml` — Dependencies (tauri, tokio, selorson-backend)

### Build Desktop App
```bash
cd frontend-v3
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/Selorson_x.x.x_x64-setup.exe
```

### Lưu ý khi phát hành Desktop
> ⚠️ Trước khi phát hành bản Desktop công khai, cần chỉnh sửa:
> 1. **Token expiry:** Giảm `JWT_EXPIRY_MINUTES` từ 30 ngày về 30 phút (xóa dòng set_var trong `src-tauri/src/lib.rs`)
> 2. **Hardcoded env path:** Thay `dotenvy::from_path("E:\\Selorson\\...")` bằng đường dẫn tương đối hoặc bundled config
> 3. **Database:** Quyết định dùng remote DB (Neon) hay embed SQLite cho end-user
> 4. **Co-Writer data:** Đóng gói pre-trained data vào installer hoặc tải từ server

## Mobile App (Capacitor)

### Build Mobile
```bash
npm run build:mobile     # Build SPA
npx cap sync android     # Đồng bộ vào Android project
# Mở Android Studio để build APK
```

### Lưu ý
- Mobile dùng production API (`fly.dev`), giống bản web
- File `capacitor.config.json` cấu hình app name, bundle ID
- Thư mục `android/` chứa project Android Studio

## Web (Cloudflare Pages)

### Deploy
```bash
npm run build            # Build với adapter-cloudflare
# Deploy tự động qua Cloudflare Pages khi push lên main
```

### Cấu hình
- `wrangler.toml` — Cấu hình Cloudflare Workers
- `.env.production` — API URL production (fly.dev)
