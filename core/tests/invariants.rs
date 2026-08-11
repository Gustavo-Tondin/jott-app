//! Rules of the codebase that no unit test can guard, enforced by reading the
//! source. Same idea as `dialog_helpers_are_never_called_from_a_blocking_command`
//! in the bridge suite: when the rule only lives in a doc, it stops being true
//! the day someone does not read the doc.

use std::path::PathBuf;

fn core_sources() -> Vec<(String, String)> {
    let src = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
    std::fs::read_dir(&src)
        .expect("core/src must be readable")
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension()? != "rs" {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().to_string();
            let body = std::fs::read_to_string(&path).ok()?;
            Some((name, body))
        })
        .collect()
}

/// Strips line comments and the `#[cfg(test)]` module, so a comment
/// *explaining* the rule cannot trip it and a test writing its own fixture
/// stays free to. The rules below bind production code.
fn code_of(body: &str) -> String {
    let production = body.split("#[cfg(test)]").next().unwrap_or(body);
    production
        .lines()
        .map(|line| line.split("//").next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn only_clock_and_id_read_the_wall_clock() {
    // `clock.rs` owns the logical day: calling `Local::now()` anywhere else
    // silently ignores the configured turn, and the bug only shows up in the
    // hours around midnight. `id.rs` is the one documented exception — it
    // reads the clock as *entropy* for unique ids, never as a date, so no
    // calendar decision can leak through it.
    for (name, body) in core_sources() {
        if name == "clock.rs" || name == "id.rs" {
            continue;
        }
        let code = code_of(&body);
        for marker in ["Local::now", "SystemTime::now", "Instant::now", "Utc::now"] {
            assert!(
                !code.contains(marker),
                "{name} calls {marker} — the logical day lives in clock.rs, \
                 and reading the wall clock anywhere else bypasses the \
                 configured turn"
            );
        }
    }
}

#[test]
fn every_file_write_goes_through_the_atomic_helper() {
    // A sync tool may read any file at any instant; a half-written file is a
    // corrupted notebook. `fsio::write_atomically` is the single door.
    for (name, body) in core_sources() {
        if name == "fsio.rs" {
            continue;
        }
        let code = code_of(&body);
        assert!(
            !code.contains("fs::write("),
            "{name} calls fs::write directly — use fsio::write_atomically, \
             a torn write corrupts the notebook under sync"
        );
    }
}
