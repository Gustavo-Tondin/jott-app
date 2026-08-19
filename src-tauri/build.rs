fn main() {
    tauri_build::build();

    // Tauri embeds its Windows application manifest — the Common Controls v6
    // dependency its dialogs import — into the APP binary only
    // (`rustc-link-arg-bins`). A test binary links the same code without the
    // manifest, so on windows-msvc it loads Common Controls v5 and dies at
    // startup with STATUS_ENTRYPOINT_NOT_FOUND before running a single test.
    // Known upstream limitation (tauri-apps discussion #11179); this is the
    // same workaround the Tauri workspace itself carries. Linux and the
    // Android build never enter this branch.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os == "windows" && target_env == "msvc" {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-test-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
