//! The languages a notebook is WRITTEN in — not the interface's (`lang`).
//! Which one a note is drawn in (hyphenation takes one), a guess among the
//! declared ones from the words a text uses, and whether this machine has
//! the dictionaries the engines need. Nothing here writes a note.

use std::path::Path;

/// The language a note is drawn in: what it declares (`lang:`), else what
/// its text reads as among `languages`, else the first of them. `None` with
/// no language declared anywhere — the page's own `lang` applies.
pub fn drawn(declared: Option<String>, text: &str, languages: &[String]) -> Option<String> {
    declared
        .or_else(|| detect(text, languages))
        .or_else(|| languages.first().cloned())
}

/// A list of tags as it is kept: trimmed, no blanks, no repeats, in order.
pub fn tidy<'a>(tags: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in tags.into_iter().map(str::trim).filter(|t| !t.is_empty()) {
        if !out.iter().any(|t| t == tag) {
            out.push(tag.to_string());
        }
    }
    out
}

/// Hits the winner needs before a guess is made at all.
const MIN_HITS: usize = 5;

/// Which of `candidates` a text is written in, by counting each language's
/// function words. `None` is undecided: fewer than two candidates, a text
/// too short, or no clear winner (it must lead the next by half again).
pub fn detect(text: &str, candidates: &[String]) -> Option<String> {
    if candidates.len() < 2 {
        return None;
    }
    let mut hits = vec![0usize; candidates.len()];
    for word in text
        .split(|c: char| !c.is_alphabetic())
        .filter(|w| !w.is_empty())
    {
        let word = word.to_lowercase();
        for (count, tag) in hits.iter_mut().zip(candidates) {
            if function_words(tag).contains(&word.as_str()) {
                *count += 1;
            }
        }
    }
    let mut ranked: Vec<usize> = (0..candidates.len()).collect();
    ranked.sort_by(|a, b| hits[*b].cmp(&hits[*a]));
    let (best, next) = (hits[ranked[0]], hits[ranked[1]]);
    (best >= MIN_HITS && best * 2 > next * 3).then(|| candidates[ranked[0]].clone())
}

/// The primary subtag, lower case: `pt-BR` → `pt`.
fn primary(tag: &str) -> String {
    tag.split(['-', '_']).next().unwrap_or("").to_ascii_lowercase()
}

/// The commonest short words of a language — frequent in any text, rare in
/// the others. Empty for a language without a table: it is never guessed,
/// only declared or first.
fn function_words(tag: &str) -> &'static [&'static str] {
    match primary(tag).as_str() {
        "pt" => &[
            "não", "uma", "um", "com", "do", "da", "dos", "das", "os", "as", "é", "são", "em",
            "no", "na", "nos", "nas", "ao", "pelo", "pela", "mais", "mas", "também", "você",
            "isso", "isto", "foi", "tem", "muito", "quando", "que", "para", "de", "se", "eu",
            "ele", "ela", "então", "já", "só", "ou", "onde", "porque", "até",
        ],
        "es" => &[
            "una", "un", "con", "del", "los", "las", "el", "y", "es", "son", "en", "al", "más",
            "pero", "también", "usted", "esto", "eso", "fue", "tiene", "muy", "cuando", "que",
            "para", "de", "se", "yo", "él", "ella", "hay", "lo", "le", "por", "entonces", "ya",
            "sólo", "solo", "o", "donde", "porque", "hasta", "sí", "no",
        ],
        "en" => &[
            "the", "and", "of", "to", "is", "are", "in", "that", "it", "with", "for", "was",
            "on", "this", "be", "have", "not", "but", "you", "they", "at", "from", "or", "an",
            "which", "would", "there", "their", "what", "when", "will", "can", "all", "if",
        ],
        "fr" => &[
            "le", "la", "les", "et", "des", "est", "une", "un", "du", "dans", "que", "qui",
            "pour", "pas", "sur", "avec", "ce", "il", "elle", "au", "aux", "sont", "mais",
            "ou", "où", "nous", "vous", "je", "très", "aussi", "quand", "cette", "été",
        ],
        "de" => &[
            "der", "die", "das", "und", "ist", "nicht", "ein", "eine", "zu", "den", "dem",
            "mit", "sich", "auf", "für", "von", "auch", "es", "ich", "sie", "wir", "aber",
            "wenn", "oder", "noch", "nur", "sind", "war", "wie", "bei", "aus", "dass",
        ],
        "it" => &[
            "il", "lo", "la", "gli", "le", "di", "che", "è", "non", "una", "un", "per", "con",
            "del", "della", "dei", "nel", "nella", "sono", "ma", "anche", "come", "questo",
            "quando", "più", "io", "lui", "lei", "noi", "voi", "ci", "si", "e",
        ],
        "ca" => &[
            "el", "la", "els", "les", "i", "és", "una", "un", "amb", "del", "dels", "que",
            "per", "no", "són", "però", "també", "això", "quan", "molt", "jo", "ell", "ella",
            "nosaltres", "hi", "ho", "al", "als", "en", "de",
        ],
        "nl" => &[
            "de", "het", "een", "en", "van", "is", "niet", "dat", "die", "met", "voor", "op",
            "zijn", "maar", "ook", "als", "er", "ik", "je", "we", "wat", "om", "aan", "bij",
            "naar", "nog", "wordt", "werd", "dit", "hij", "zij",
        ],
        _ => &[],
    }
}

/// How the dictionaries spell a tag: `pt-BR` → `pt_BR`.
pub fn dictionary_name(tag: &str) -> String {
    tag.replace('-', "_")
}

/// The `.dic` in `dirs` that serves `tag`, by its stem after `prefix`
/// (`hyph_` for hyphenation, empty for spelling): the exact name first,
/// then the bare language (`pt`), then — for a tag with no region of its
/// own — the first region of it (`es_AR` for `es`).
fn find_dictionary(dirs: &[impl AsRef<Path>], prefix: &str, tag: &str) -> Option<String> {
    let exact = dictionary_name(tag).to_ascii_lowercase();
    let bare = primary(tag);
    let region = format!("{bare}_");
    let mut stems: Vec<String> = dirs
        .iter()
        .filter_map(|dir| std::fs::read_dir(dir).ok())
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;
            Some(name.strip_suffix(".dic")?.strip_prefix(prefix)?.to_string())
        })
        .collect();
    stems.sort();
    let first = |wanted: &dyn Fn(&str) -> bool| stems.iter().find(|s| wanted(&s.to_ascii_lowercase())).cloned();
    first(&|s| s == exact)
        .or_else(|| first(&|s| s == bare))
        .or_else(|| (exact == bare).then(|| first(&|s| s.starts_with(&region))).flatten())
}

/// Whether the hyphenation rules for `tag` are in `dirs` (`hyph_*.dic`).
pub fn has_hyphenation(dirs: &[impl AsRef<Path>], tag: &str) -> bool {
    find_dictionary(dirs, "hyph_", tag).is_some()
}

/// The spelling dictionary in `dirs` that serves `tag` — the name to hand
/// the spell checker, which may be a region of it (`es_AR` for `es`).
pub fn spelling_dictionary(dirs: &[impl AsRef<Path>], tag: &str) -> Option<String> {
    find_dictionary(dirs, "", tag)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(list: &[&str]) -> Vec<String> {
        list.iter().map(|t| t.to_string()).collect()
    }

    const PT: &str = "Ontem fui ao mercado com a minha irmã e não encontramos o que \
        queríamos, então voltamos para casa mais cedo. É uma pena, mas também foi bom.";
    const ES: &str = "Ayer fui al mercado con mi hermana y no encontramos lo que \
        queríamos, así que volvimos a casa más temprano. Es una pena, pero también fue bueno.";

    #[test]
    fn tells_portuguese_from_spanish() {
        let both = tags(&["pt-BR", "es"]);
        assert_eq!(detect(PT, &both).as_deref(), Some("pt-BR"));
        assert_eq!(detect(ES, &both).as_deref(), Some("es"));
        // The order of the list does not decide a clear text.
        assert_eq!(detect(PT, &tags(&["es", "pt-BR"])).as_deref(), Some("pt-BR"));
    }

    #[test]
    fn undecided_is_none() {
        let both = tags(&["pt-BR", "es"]);
        assert_eq!(detect("Lista de compras", &both), None, "too short");
        assert_eq!(detect("", &both), None);
        assert_eq!(detect(PT, &tags(&["pt-BR"])), None, "one language: nothing to detect");
        assert_eq!(detect(PT, &tags(&["pt-BR", "pt-PT"])), None, "a tie is not a guess");
        assert_eq!(detect(PT, &tags(&["pt-BR", "xx"])).as_deref(), Some("pt-BR"));
    }

    #[test]
    fn markdown_is_not_a_word() {
        let text = format!("# Título\n\n- [ ] {PT}\n\n**negrito** `código`");
        assert_eq!(detect(&text, &tags(&["en", "pt-BR"])).as_deref(), Some("pt-BR"));
    }

    #[test]
    fn drawn_prefers_the_declared_then_the_text_then_the_first() {
        let both = tags(&["es", "pt-BR"]);
        assert_eq!(drawn(Some("fr".into()), PT, &both).as_deref(), Some("fr"));
        assert_eq!(drawn(None, PT, &both).as_deref(), Some("pt-BR"));
        assert_eq!(drawn(None, "Hola", &both).as_deref(), Some("es"));
        assert_eq!(drawn(None, PT, &[]), None);
    }

    #[test]
    fn finds_the_dictionary_that_serves_a_tag() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["hyph_pt_BR.dic", "hyph_en_US.dic", "es_ES.dic", "es_AR.dic", "de.dic", "fr.aff"] {
            std::fs::write(dir.path().join(name), "").unwrap();
        }
        let dirs = [dir.path(), Path::new("/nonexistent/jott")];
        assert!(has_hyphenation(&dirs, "pt-BR"));
        assert!(has_hyphenation(&dirs, "en"), "any region of a bare tag");
        assert!(!has_hyphenation(&dirs, "pt-PT"), "another region is not this one");
        assert!(!has_hyphenation(&dirs, "es"));
        assert_eq!(spelling_dictionary(&dirs, "es").as_deref(), Some("es_AR"));
        assert_eq!(spelling_dictionary(&dirs, "es-ES").as_deref(), Some("es_ES"));
        assert_eq!(spelling_dictionary(&dirs, "de-AT").as_deref(), Some("de"));
        assert_eq!(spelling_dictionary(&dirs, "fr"), None, "an .aff alone is no dictionary");
    }
}
