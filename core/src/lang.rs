//! The languages the interface speaks. Pure: the bridge tells it what the
//! user chose and what the system speaks, it answers which one to use. The
//! dictionaries themselves are the frontend's (`src/lib/locales/`).

/// What the user picks when they pick nothing: follow the system.
pub const SYSTEM: &str = "system";

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Lang {
    #[default]
    En,
    PtBr,
}

impl Lang {
    /// `pref` is what the user chose (`system` or a tag); `system` is the OS
    /// locale as it comes (`pt_BR.UTF-8`, `pt-PT`, `en-US`…). Any Portuguese
    /// is Brazilian for now; anything unknown is English.
    pub fn resolve(pref: &str, system: Option<&str>) -> Lang {
        let tag = if pref == SYSTEM { system.unwrap_or("") } else { pref };
        let lower = tag.to_ascii_lowercase();
        if lower == "pt" || lower.starts_with("pt-") || lower.starts_with("pt_") {
            Lang::PtBr
        } else {
            Lang::En
        }
    }

    /// The BCP 47 tag the frontend loads a dictionary by, and the document's `lang`.
    pub fn tag(self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::PtBr => "pt-BR",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_the_system_when_nothing_was_chosen() {
        assert_eq!(Lang::resolve(SYSTEM, Some("pt_BR.UTF-8")), Lang::PtBr);
        assert_eq!(Lang::resolve(SYSTEM, Some("pt-PT")), Lang::PtBr);
        assert_eq!(Lang::resolve(SYSTEM, Some("pt")), Lang::PtBr);
        assert_eq!(Lang::resolve(SYSTEM, Some("es-ES")), Lang::En);
        assert_eq!(Lang::resolve(SYSTEM, Some("en-US")), Lang::En);
        assert_eq!(Lang::resolve(SYSTEM, None), Lang::En);
    }

    #[test]
    fn a_choice_beats_the_system() {
        assert_eq!(Lang::resolve("en", Some("pt_BR.UTF-8")), Lang::En);
        assert_eq!(Lang::resolve("pt-BR", Some("en_US.UTF-8")), Lang::PtBr);
        // A tag this build does not know reads as English, not as an error.
        assert_eq!(Lang::resolve("klingon", Some("pt_BR")), Lang::En);
    }

    #[test]
    fn the_tag_round_trips() {
        for lang in [Lang::En, Lang::PtBr] {
            assert_eq!(Lang::resolve(lang.tag(), None), lang);
        }
    }
}
