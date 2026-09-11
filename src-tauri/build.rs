fn main() {
    // windows-msvc: the linker embeds the Common Controls v6 manifest into
    // EVERY target (app, cdylib, lib and integration test binaries), not
    // tauri-build, whose resource reaches the app binary only — a test binary
    // without it dies with STATUS_ENTRYPOINT_NOT_FOUND. The tauri crate does
    // the same for its own tests. See docs/platform-gotchas.md.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        tauri_build::build();
        return;
    }

    let manifest =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());

    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}
