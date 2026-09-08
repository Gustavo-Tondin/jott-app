//! The type faces a machine can offer. The pure half: turns whatever the
//! machine's font tool prints into a list of family names, and says which
//! names are safe to hand to CSS. Asking the machine is the bridge's job
//! (`fc-list` on Linux, nothing on Android): the core cannot spawn a process.

/// The longest family name accepted. Real families are far shorter; the cap
/// is here so a broken listing cannot put a paragraph into a CSS declaration.
const MAX_NAME: usize = 64;

/// Whether a family name can be written into a CSS `font-family` value. It
/// lands on the document root as a custom property, so what is refused is
/// what would end the quoted string or the declaration — quotes, backslash,
/// semicolon, braces — plus control characters. Accents, digits, spaces stay.
pub fn is_safe_family(name: &str) -> bool {
    !name.is_empty()
        && name.chars().count() <= MAX_NAME
        && name.chars().any(char::is_alphanumeric)
        && !name
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '\'' | '\\' | ';' | '{' | '}' | '<' | '>'))
}

/// The style words a desktop font description may carry between the family
/// and the size (Pango's `FAMILY [STYLES] SIZE`). Dropped from the end, one
/// at a time, so `Cantarell Bold 11` is the family `Cantarell`.
const STYLE_WORDS: [&str; 22] = [
    "thin",
    "ultra-light",
    "extralight",
    "extra-light",
    "light",
    "semilight",
    "semi-light",
    "book",
    "regular",
    "medium",
    "semibold",
    "semi-bold",
    "demibold",
    "bold",
    "ultra-bold",
    "extrabold",
    "extra-bold",
    "black",
    "heavy",
    "italic",
    "oblique",
    "condensed",
];

/// The family in a DESKTOP's font description — what `gtk-font-name` and
/// `org.gnome.desktop.interface font-name` hold, as `gsettings` prints it:
/// `'TRIAL Rooftop 11'` is the family `TRIAL Rooftop`. The quotes, the size
/// and any trailing style words go; `None` when nothing usable is left.
///
/// It exists because CSS `system-ui` does NOT answer with this family on
/// every engine — the desktop has to be asked, and the name written in front
/// of the stack (see documentation/theming.md).
pub fn ui_family(description: &str) -> Option<String> {
    let text = description.trim().trim_matches(['\'', '"']).trim();
    let mut words: Vec<&str> = text.split_whitespace().collect();
    // The size is last, and may be fractional (`11.5`) or absolute (`11px`).
    if words
        .last()
        .is_some_and(|w| w.trim_end_matches("px").parse::<f32>().is_ok())
    {
        words.pop();
    }
    while words.len() > 1
        && words
            .last()
            .is_some_and(|w| STYLE_WORDS.contains(&w.to_lowercase().as_str()))
    {
        words.pop();
    }
    let family = words.join(" ");
    is_safe_family(&family).then_some(family)
}

/// The families in a `fc-list : family` listing, ready to show. One line per
/// face; a line may carry several comma-separated names, and the FIRST is the
/// one fontconfig answers to. Unsafe names are dropped, not escaped. The list is
/// deduplicated case-insensitively and sorted as a person reads it (`sort_key`).
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

/// Where a name sits in the list: case folded, Latin accents folded onto the
/// base letter (`Ébano` among the E's, no collation crate). A script with no
/// base letter here keeps its own order and lands after the Latin names.
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
    fn the_desktops_font_name_is_read_down_to_the_family() {
        // What `gsettings get org.gnome.desktop.interface font-name` prints.
        assert_eq!(ui_family("'TRIAL Rooftop 11'\n").as_deref(), Some("TRIAL Rooftop"));
        assert_eq!(ui_family("Cantarell 11").as_deref(), Some("Cantarell"));
        assert_eq!(ui_family("Cantarell Bold 11").as_deref(), Some("Cantarell"));
        assert_eq!(ui_family("\"Noto Sans\"").as_deref(), Some("Noto Sans"));
        assert_eq!(ui_family("Inter Semi-Bold Italic 12.5").as_deref(), Some("Inter"));
    }

    #[test]
    fn a_family_that_is_only_a_style_word_survives_it() {
        // The words are dropped from the END and never all of them: a family
        // really called "Black" is a family.
        assert_eq!(ui_family("Black 11").as_deref(), Some("Black"));
        assert_eq!(ui_family("Roboto Condensed 11").as_deref(), Some("Roboto"));
    }

    #[test]
    fn nothing_usable_is_none() {
        assert_eq!(ui_family(""), None);
        assert_eq!(ui_family("   "), None);
        assert_eq!(ui_family("11"), None);
        // The same gate as every other family name: it lands in a CSS value.
        assert_eq!(ui_family("Ev'il; }"), None);
    }

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
