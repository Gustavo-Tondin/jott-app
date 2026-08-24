//! The type faces a machine can offer (2026-08-24).
//!
//! Three of the app's choices are a font: the interface, the text of a note,
//! and the monospace. Each is either what the app ships with — Inter and DM
//! Mono, both carried inside the app so nothing is fetched at runtime — or a
//! family the user already has installed. This module is the pure half of
//! that: it turns whatever the machine's font tool prints into a list of
//! family names, and it says which names are safe to hand to CSS.
//!
//! Asking the machine is the bridge's job (`fc-list` on Linux, nothing on
//! Android): the core cannot spawn a process and stay a library.

/// The longest family name accepted. Real families are far shorter; the cap
/// is here so a broken listing cannot put a paragraph into a CSS declaration.
const MAX_NAME: usize = 64;

/// Whether a family name can be written into a CSS `font-family` value.
///
/// The name travels to the interface and is written on the document root as
/// a custom property, so what is refused here is what would end the quoted
/// string or the declaration around it — quotes, a backslash, a semicolon,
/// braces — plus control characters, which no font is named with. Everything
/// else is allowed: families carry accents, digits, spaces and hyphens.
pub fn is_safe_family(name: &str) -> bool {
    !name.is_empty()
        && name.chars().count() <= MAX_NAME
        && name.chars().any(char::is_alphanumeric)
        && !name
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '\'' | '\\' | ';' | '{' | '}' | '<' | '>'))
}

/// The families in a `fc-list : family` listing, ready to show.
///
/// One line per face, so the same family arrives once per weight and style;
/// a line can also carry the family's other names, comma-separated
/// (`Futura PT,Futura Cyrillic Book`), and the FIRST is the one fontconfig
/// answers to. Names that could not be written into CSS are dropped rather
/// than escaped — a font nobody can name is a font nobody chose.
///
/// The answer is deduplicated (case-insensitively: `Arial` and `arial` are
/// one family to fontconfig) and sorted the way a person reads a list,
/// which is not the way bytes sort: `Ubuntu` after `noto sans`, and `Ébano`
/// among the E's rather than after Z, where its byte lands it. Two keys,
/// because they answer different questions — `Ébano` and `Ebano` are two
/// families and sort together.
pub fn families(listing: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in listing.lines() {
        let name = line.split(',').next().unwrap_or("").trim();
        if !is_safe_family(name) {
            continue;
        }
        if seen.insert(fold(name)) {
            out.push(name.to_string());
        }
    }
    out.sort_by_key(|name| sort_key(name));
    out
}

/// The key two spellings of one family share. Lowercase is as far as this
/// goes on purpose: it is a dedup key, not a collation.
fn fold(name: &str) -> String {
    name.to_lowercase()
}

/// Where a name sits in the list. Case folded, and the Latin accents folded
/// onto their base letter — enough to put `Ébano` among the E's without
/// carrying a collation crate for a list of font names. A script with no
/// base letter here (Greek, Cyrillic, CJK) keeps its own order and lands
/// after the Latin names, which is where a reader of this list expects it.
fn sort_key(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_family_per_name_however_many_faces_it_has() {
        let listing = "Inter\nInter\nDM Mono\nInter\n";
        assert_eq!(families(listing), vec!["DM Mono", "Inter"]);
    }

    #[test]
    fn the_first_of_a_lines_names_is_the_one_fontconfig_answers_to() {
        let listing = "Futura PT,Futura Cyrillic Book\nFutura PT,Futura Cyrillic Bold\n";
        assert_eq!(families(listing), vec!["Futura PT"]);
    }

    #[test]
    fn two_spellings_of_one_family_are_one_row() {
        let listing = "Arial\narial\nARIAL\n";
        assert_eq!(families(listing), vec!["Arial"], "the first spelling is kept");
    }

    #[test]
    fn a_name_that_could_break_out_of_a_css_value_is_dropped_not_escaped() {
        for bad in [
            "Evil\"; color: red",
            "Evil'",
            "Evil\\",
            "Evil}",
            "Evil<script>",
            "",
            "   ",
        ] {
            assert!(!is_safe_family(bad.trim()), "{bad:?}");
        }
        let listing = "Inter\nEvil\"; color: red\nDM Mono\n";
        assert_eq!(families(listing), vec!["DM Mono", "Inter"]);
    }

    #[test]
    fn accents_spaces_digits_and_hyphens_are_ordinary_in_a_family_name() {
        for good in ["Inter", "DM Mono", "Noto Sans CJK JP", "IBM Plex Mono", "Ébano", "M+ 1c"] {
            assert!(is_safe_family(good), "{good}");
        }
    }

    #[test]
    fn the_list_reads_the_way_a_person_reads_it() {
        let listing = "Ubuntu\nnoto sans\nÉbano\nDejaVu Sans\n";
        assert_eq!(families(listing), vec!["DejaVu Sans", "Ébano", "noto sans", "Ubuntu"]);
        // Folding for the SORT never merges two families: the accent is part
        // of the name, and only the case is not.
        assert_eq!(families("Ébano\nEbano\n").len(), 2);
    }

    #[test]
    fn a_paragraph_is_not_a_font_name() {
        assert!(!is_safe_family(&"a".repeat(MAX_NAME + 1)));
        assert!(is_safe_family(&"a".repeat(MAX_NAME)));
    }
}
