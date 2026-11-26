fn main() {
    println!("cargo:rustc-check-cfg=cfg(selorson_desktop_user)");
    println!("cargo:rerun-if-env-changed=SELORSON_APP_FLAVOR");

    let flavor = std::env::var("SELORSON_APP_FLAVOR").unwrap_or_default();
    let has_admin_backend = std::env::var_os("CARGO_FEATURE_ADMIN_BACKEND").is_some();

    match flavor.trim() {
        "desktop-user" => {
            if has_admin_backend {
                panic!(
                    "SELORSON_APP_FLAVOR=desktop-user must NOT enable feature 'admin-backend'. Build with `--no-default-features`."
                );
            }
            println!("cargo:rustc-cfg=selorson_desktop_user");
        }
        "desktop-admin" => {
            if !has_admin_backend {
                panic!(
                    "SELORSON_APP_FLAVOR=desktop-admin requires feature 'admin-backend'."
                );
            }
        }
        other => {
            panic!(
                "SELORSON_APP_FLAVOR must be explicitly set to 'desktop-admin' or 'desktop-user' (got {:?}). Fail-open desktop builds are forbidden.",
                other
            );
        }
    }

    tauri_build::build()
}
