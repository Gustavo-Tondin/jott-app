//! Rewriting the references a notebook carries when their target is renamed.
//! A body holds `[[/foto.jpg]]` (a library file) and `[[Guardiões]]` (a note,
//! by TITLE; the slash separates the namespaces, see `embeds.js`), plus the
//! `](assets/foto.jpg)` form; the banner is retargeted by [`crate::note`]. Only
//! forms the app WRITES are rewritten: a loose scan would eat `foto.jpg` out of `foto.jpg.bak`.

/// The body with every reference to the file `old` pointing at `new`, or
/// `None` when nothing changed — so a rename leaves alone every note that
/// never mentioned the file.
pub fn retarget_file(body: &str, old: &str, new: &str) -> Option<String> {
    if old == new {
        return None;
    }
    let changed = replace_all(body, &format!("[[/{old}]]"), &format!("[[/{new}]]"));
    let changed = replace_all(
        changed.as_deref().unwrap_or(body),
        &format!("](assets/{old})"),
        &format!("](assets/{new})"),
    )
    .or(changed);
    changed
}

/// The body with every link to the note called `old` pointing at `new`. A
/// note link carries the TITLE (see `embeds.js`), so a rename is exactly
/// when its links would go stale.
pub fn retarget_note(body: &str, old: &str, new: &str) -> Option<String> {
    // The leading slash is the file namespace, and a note's title can never
    // start with one (a title is a file name). Refusing here is what keeps a
    // rename of one from ever reaching the other.
    if old == new || old.is_empty() || new.is_empty() {
        return None;
    }
    if old.starts_with('/') || new.starts_with('/') {
        return None;
    }
    replace_all(body, &format!("[[{old}]]"), &format!("[[{new}]]"))
}

/// `str::replace`, but saying whether it did anything.
fn replace_all(text: &str, from: &str, to: &str) -> Option<String> {
    text.contains(from).then(|| text.replace(from, to))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_renamed_file_is_followed_in_every_form_the_app_writes() {
        let body = "olha\n\n[[/foto.jpg]]\n\n![alt](assets/foto.jpg)\n[o arquivo](assets/foto.jpg)\n";
        let after = retarget_file(body, "foto.jpg", "ferias.jpg").unwrap();

        assert!(after.contains("[[/ferias.jpg]]"));
        assert_eq!(after.matches("assets/ferias.jpg").count(), 2);
        assert!(!after.contains("foto.jpg"));
    }

    #[test]
    fn a_name_that_is_the_start_of_another_is_left_alone() {
        // The reason only the written forms are rewritten: a loose scan would
        // turn `foto.jpg.bak` into `ferias.jpg.bak` inside someone's note.
        let body = "[[/foto.jpg]] e [[/foto.jpg.bak]] e assets/foto.jpg.bak\n";
        let after = retarget_file(body, "foto.jpg", "ferias.jpg").unwrap();

        assert!(after.contains("[[/ferias.jpg]]"));
        assert!(after.contains("[[/foto.jpg.bak]]"), "{after}");
        assert!(after.contains("assets/foto.jpg.bak"));
    }

    #[test]
    fn a_body_that_never_mentioned_it_is_not_touched() {
        assert!(retarget_file("nada aqui\n", "foto.jpg", "outra.jpg").is_none());
        assert!(retarget_file("[[/foto.jpg]]", "foto.jpg", "foto.jpg").is_none());
    }

    #[test]
    fn a_renamed_note_is_followed_by_its_links() {
        let body = "veja [[Guardiões do império]] e [[Outra]]\n";
        let after = retarget_note(body, "Guardiões do império", "Guardiões").unwrap();

        assert_eq!(after, "veja [[Guardiões]] e [[Outra]]\n");
    }

    #[test]
    fn a_file_reference_is_not_a_note_link() {
        // The slash is the whole difference, and a note called `/foto.jpg`
        // cannot exist — but the shapes must not collide anyway.
        assert!(retarget_note("[[/foto.jpg]]", "/foto.jpg", "outra").is_none());
    }
}
