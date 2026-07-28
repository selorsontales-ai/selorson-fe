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
- **Dữ liệu ứng dụng:** Backend đọc PostgreSQL từ `DATABASE_URL`; Redis là tùy chọn và có cơ chế fallback khi không khả dụng
- **Dữ liệu Co-Writer:** Lưu riêng trong SQLite `co_writer.db`, mặc định dưới `./co-writer-data` hoặc thư mục được cấu hình bằng `CO_WRITER_DATA_DIR`
- **Co-Writer:** Tự động bật chế độ read-write cho AI Co-Writer
- **Token dài hạn:** JWT token sống 30 ngày (chỉ cho desktop, production vẫn 30 phút)
- **CORS:** Backend cho phép origin `http://tauri.localhost` (Windows) và `tauri://localhost` (macOS)

### Cấu hình Desktop
- `src-tauri/tauri.conf.json` — Cấu hình Tauri (tên app, icons, bundler)
- `src-tauri/src/lib.rs` — Entry point, nhúng backend + set env vars
- `src-tauri/Cargo.toml` — Dependencies (tauri, tokio, selorson-backend)
- Bản đóng gói đọc cấu hình backend ở `%APPDATA%\com.selorson.app\backend.env`
- Khi chạy từ workspace phát triển, app có thể fallback sang `backend-v3/.env`
- Có thể đặt `CO_WRITER_DATA_DIR` trong `backend.env` để chọn nơi lưu kho Co-Writer

### Build Desktop App
```bash
cd frontend-v3
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/Selorson_x.x.x_x64-setup.exe
```

### Phát hành Desktop
- Workflow `.github/workflows/release-desktop.yml` build installer Windows và chạy smoke test trên app đóng gói
- Installer không chứa đường dẫn tuyệt đối của máy phát triển
- Trước khi dùng app trên máy mới, tạo `backend.env` trong thư mục app-data với các biến backend cần thiết, tối thiểu là `DATABASE_URL` và `JWT_SECRET`
- Kho SQLite của Co-Writer độc lập với PostgreSQL của phần web/cộng đồng; sao lưu cả hai nếu cần giữ toàn bộ dữ liệu

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
