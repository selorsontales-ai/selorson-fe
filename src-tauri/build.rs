fn main() {
    println!("cargo:rustc-check-cfg=cfg(selorson_desktop_user)");
    println!("cargo:rerun-if-env-changed=SELORSON_APP_FLAVOR");

    if std::env::var("SELORSON_APP_FLAVOR").as_deref() == Ok("desktop-user") {
        println!("cargo:rustc-cfg=selorson_desktop_user");
    }

    tauri_build::build()
}
