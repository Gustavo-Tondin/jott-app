//! The Settings screen's two drawers, and the rule that tells them apart.
//!
//! **The rule of the split is the SECTION, not the key: Display is this
//! machine, every other section is the notebook** (2026-08-20, user call: "no
//! meu celular quero tema escuro e no desktop tema Jott"). The two choices
//! that used to sit in Display and are NOT about a screen moved to the section
//! they belong to rather than becoming exceptions — where a quick note lands
//! is the notebook's (Notebook), and whether an overdue task counts as urgent
//! is a rule about tasks (Day and week).
//!
//! Both drawers are described here, in the core, for the same reason every
//! other rule is: a second frontend has to resolve them the same way, and a
//! policy that only exists in the bridge is invisible to it. What the core
//! does NOT do is decide where either drawer is stored — the notebook's half
//! goes into `.jott/config.json` ([`crate::config::Config`]) and the machine's
//! into whatever file the shell keeps per install.

use serde::{Deserialize, Serialize};

use crate::config::{Config, DateFormat, RolloverMode};
use crate::{TurnOffset, WeekStart};

/// The Display choices, which answer to a SCREEN and not to a notebook
/// (2026-08-20).
///
/// This is the whole of the Settings screen's Display section, which is what
/// makes the split a rule instead of a list to remember — see the module
/// header.
///
/// Every field is optional, and absent is not "off": it means **this machine
/// has no answer, so the notebook's is used**. That fallback is what keeps the
/// look travelling — a notebook opened on a machine that never chose comes up
/// dressed the way it was left, and diverges the moment something is picked
/// here. It is also why nothing has to be migrated: a notebook written before
/// the split keeps its values in `.jott/config.json`, they keep being read,
/// and another version of Jott still finds them where it left them.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DisplayPrefs {
    pub theme: Option<String>,
    pub accent_color: Option<String>,
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    pub date_display_format: Option<String>,
    pub show_list_counts: Option<bool>,
    pub restore_last_screen: Option<bool>,
    pub close_inspector_on_click_away: Option<bool>,
}

impl DisplayPrefs {
    /// Takes one or more choices from `patch`, keeping everything it leaves
    /// out — so the settings screen can send the one key that changed. The
    /// same pact [`NotebookSettings`] makes about the notebook's own
    /// preferences.
    pub fn patch(&mut self, patch: DisplayPrefs) {
        take(&mut self.theme, patch.theme);
        take(&mut self.accent_color, patch.accent_color);
        take(&mut self.heading_color, patch.heading_color);
        take(&mut self.note_font_size, patch.note_font_size);
        take(&mut self.date_display_format, patch.date_display_format);
        take(&mut self.show_list_counts, patch.show_list_counts);
        take(&mut self.restore_last_screen, patch.restore_last_screen);
        take(
            &mut self.close_inspector_on_click_away,
            patch.close_inspector_on_click_away,
        );
    }
}

/// Overwrites `slot` with `value` only when `value` says something — an
/// absent key in the patch leaves the stored choice alone.
fn take<T>(slot: &mut Option<T>, value: Option<T>) {
    if value.is_some() {
        *slot = value;
    }
}

/// The display choices in force, machine over notebook.
///
/// Since 2026-08-20 the Settings screen's Display section answers to a SCREEN
/// and not to a notebook ([`DisplayPrefs`]): a phone can be dark while the
/// desktop stays in Jott's own black-on-white. What this machine has not
/// chosen falls back to the notebook, which is what lets a notebook still
/// carry a look to a machine that never picked one.
///
/// One type with one constructor, because four doors answer with these values
/// — the layout, the settings screen, the sidebar's counters and the screen to
/// restore — and they must not drift about which side wins.
#[derive(Debug, Clone, PartialEq)]
pub struct Display {
    pub theme: String,
    pub accent_color: String,
    pub heading_color: String,
    pub note_font_size: String,
    pub date_display_format: String,
    pub show_list_counts: bool,
    pub restore_last_screen: bool,
    pub close_inspector_on_click_away: bool,
}

impl Display {
    pub fn resolve(machine: &DisplayPrefs, config: &Config) -> Self {
        Self {
            theme: machine.theme.clone().unwrap_or_else(|| config.theme.clone()),
            accent_color: machine
                .accent_color
                .clone()
                .unwrap_or_else(|| config.accent_color.clone()),
            heading_color: machine
                .heading_color
                .clone()
                .unwrap_or_else(|| config.heading_color.clone()),
            note_font_size: machine
                .note_font_size
                .clone()
                .unwrap_or_else(|| config.note_font_size.clone()),
            date_display_format: machine
                .date_display_format
                .clone()
                .unwrap_or_else(|| config.date_display_format.render().to_string()),
            show_list_counts: machine.show_list_counts.unwrap_or(config.show_list_counts),
            restore_last_screen: machine
                .restore_last_screen
                .unwrap_or(config.restore_last_screen),
            close_inspector_on_click_away: machine
                .close_inspector_on_click_away
                .unwrap_or(config.close_inspector_on_click_away),
        }
    }
}

/// The notebook preferences, flattened for the UI.
///
/// Every field is a plain string or bool: the frontend should not have to know
/// the core's types, and a value it cannot parse still round-trips.
///
/// Everything is optional on the way **in**: a missing field keeps whatever is
/// stored, instead of failing the whole call. Otherwise adding a preference
/// here would break every caller that does not know about it yet — including
/// an older frontend against a newer shell. On the way **out** all fields are
/// filled.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotebookSettings {
    pub daily_mode: Option<String>,
    pub daily_at: Option<String>,
    pub weekly_mode: Option<String>,
    pub weekly_at: Option<String>,
    pub week_starts_on: Option<String>,
    pub restore_last_screen: Option<bool>,
    pub show_list_counts: Option<bool>,
    pub dated_tasks_join_period: Option<bool>,
    /// Ask before deleting. Turned off from the dialog itself.
    pub confirm_deletes: Option<bool>,
    /// Ask before fetching a picture from the internet. The user turns this
    /// off from the dialog itself ("don't ask again").
    pub confirm_image_downloads: Option<bool>,
    pub auto_urgent_by_date: Option<bool>,
    pub date_display_format: Option<String>,
    /// One of the seven, by name; empty goes back to the app's own.
    pub accent_color: Option<String>,
    /// A theme name; empty goes back to the app's own.
    pub theme: Option<String>,
    /// `"ink"` draws headings in plain ink; empty (or anything else) accents.
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    pub close_inspector_on_click_away: Option<bool>,
    pub quick_note_folder: Option<String>,
    /// Days a completed task stays in its `Completed.md` before the reaper
    /// files it away into the trash; 0 means never (2026-08-06).
    pub completed_retention_days: Option<i64>,
    /// Days a trashed item waits before the trash reaper clears it for good.
    pub trash_retention_days: Option<i64>,
}

impl NotebookSettings {
    /// Everything in force, for the settings screen to draw.
    ///
    /// The Display half comes from `display` and not from `config`, because
    /// that half answers to this machine — see the module header. Reading
    /// changes nothing on either side: the values already in force are what
    /// come back.
    pub fn of(config: &Config, display: &Display) -> Self {
        let rollover = &config.rollover;
        Self {
            daily_mode: Some(rollover.daily.mode.render().to_string()),
            daily_at: Some(rollover.daily.at.render()),
            weekly_mode: Some(rollover.weekly.mode.render().to_string()),
            weekly_at: Some(rollover.weekly.at.render()),
            week_starts_on: Some(rollover.weekly.starts_on.render().to_string()),
            restore_last_screen: Some(display.restore_last_screen),
            show_list_counts: Some(display.show_list_counts),
            dated_tasks_join_period: Some(config.dated_tasks_join_period),
            confirm_deletes: Some(config.confirm_deletes),
            confirm_image_downloads: Some(config.confirm_image_downloads),
            auto_urgent_by_date: Some(config.auto_urgent_by_date),
            date_display_format: Some(display.date_display_format.clone()),
            accent_color: Some(display.accent_color.clone()),
            theme: Some(display.theme.clone()),
            heading_color: Some(display.heading_color.clone()),
            note_font_size: Some(display.note_font_size.clone()),
            close_inspector_on_click_away: Some(display.close_inspector_on_click_away),
            quick_note_folder: Some(config.quick_note_folder.clone()),
            completed_retention_days: Some(config.completed_retention_days),
            trash_retention_days: Some(config.trash_retention_days),
        }
    }

    /// Writes the preferences that arrived into `config`.
    ///
    /// A value that arrives unparseable falls back to the core's default,
    /// so the UI cannot write a broken config; a value that does not arrive
    /// at all is left exactly as it was.
    pub fn apply_to(&self, config: &mut Config) {
        let r = &mut config.rollover;

        if let Some(v) = &self.daily_mode {
            r.daily.mode = RolloverMode::parse_or_default(v);
        }
        if let Some(v) = &self.daily_at {
            r.daily.at = TurnOffset::parse_or_default(v);
        }
        if let Some(v) = &self.weekly_mode {
            r.weekly.mode = RolloverMode::parse_or_default(v);
        }
        if let Some(v) = &self.weekly_at {
            r.weekly.at = TurnOffset::parse_or_default(v);
        }
        if let Some(v) = &self.week_starts_on {
            r.weekly.starts_on = WeekStart::parse_or_default(v);
        }
        if let Some(v) = self.restore_last_screen {
            config.restore_last_screen = v;
        }
        if let Some(v) = self.show_list_counts {
            config.show_list_counts = v;
        }
        if let Some(v) = self.dated_tasks_join_period {
            config.dated_tasks_join_period = v;
        }
        if let Some(v) = self.confirm_deletes {
            config.confirm_deletes = v;
        }
        if let Some(v) = self.confirm_image_downloads {
            config.confirm_image_downloads = v;
        }
        if let Some(v) = self.auto_urgent_by_date {
            config.auto_urgent_by_date = v;
        }
        if let Some(v) = &self.date_display_format {
            config.date_display_format = DateFormat::parse_or_default(v);
        }
        // Not validated here: the seven colours and the list of themes are the
        // interface's, and a name this build does not know must round-trip
        // (core/src/config.rs).
        if let Some(v) = &self.accent_color {
            config.accent_color = v.trim().to_string();
        }
        if let Some(v) = &self.theme {
            config.theme = v.trim().to_string();
        }
        if let Some(v) = &self.note_font_size {
            config.note_font_size = v.trim().to_string();
        }
        if let Some(v) = &self.heading_color {
            config.heading_color = v.trim().to_string();
        }
        if let Some(v) = self.close_inspector_on_click_away {
            config.close_inspector_on_click_away = v;
        }
        if let Some(v) = &self.quick_note_folder {
            if !v.trim().is_empty() {
                config.quick_note_folder = v.clone();
            }
        }
        // A negative retention is meaningless; the core would drop it on the
        // next read anyway, so it never reaches the file.
        if let Some(v) = self.completed_retention_days.filter(|d| *d >= 0) {
            config.completed_retention_days = v;
        }
        if let Some(v) = self.trash_retention_days.filter(|d| *d >= 0) {
            config.trash_retention_days = v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(json: &str) -> NotebookSettings {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_field_that_does_not_arrive_leaves_the_stored_value_alone() {
        let mut config = Config::default();
        config.theme = "dark".to_string();
        config.trash_retention_days = 7;

        // The one key the screen changed, and nothing else.
        settings(r#"{"accentColor": "orange"}"#).apply_to(&mut config);

        assert_eq!(config.accent_color, "orange");
        assert_eq!(config.theme, "dark", "o tema não foi tocado");
        assert_eq!(config.trash_retention_days, 7);
    }

    #[test]
    fn an_unparseable_value_falls_back_to_the_default_instead_of_being_written() {
        let mut config = Config::default();
        settings(r#"{"dailyMode": "sempre que der", "weekStartsOn": "quartafeira"}"#)
            .apply_to(&mut config);

        assert_eq!(config.rollover.daily.mode, RolloverMode::default());
        assert_eq!(config.rollover.weekly.starts_on, WeekStart::default());
    }

    #[test]
    fn a_look_is_a_name_the_core_never_judges() {
        let mut config = Config::default();
        // A theme from a newer build, and the whitespace a text field leaves.
        settings(r#"{"theme": "  midnight  ", "accentColor": " turquesa "}"#)
            .apply_to(&mut config);

        assert_eq!(config.theme, "midnight");
        assert_eq!(config.accent_color, "turquesa");
    }

    #[test]
    fn a_meaningless_value_never_reaches_the_file() {
        let mut config = Config::default();
        let before = config.quick_note_folder.clone();

        // A retention cannot be negative, and a quick-note folder cannot be
        // nothing — the Home would have nowhere to write.
        settings(r#"{"trashRetentionDays": -1, "completedRetentionDays": -30,
                     "quickNoteFolder": "   "}"#)
            .apply_to(&mut config);

        assert_eq!(config.trash_retention_days, 30);
        assert_eq!(config.completed_retention_days, 30);
        assert_eq!(config.quick_note_folder, before);

        // Zero, though, is a choice: keep the Completed for ever.
        settings(r#"{"completedRetentionDays": 0}"#).apply_to(&mut config);
        assert_eq!(config.completed_retention_days, 0);
    }

    #[test]
    fn what_the_machine_did_not_answer_comes_from_the_notebook() {
        let mut config = Config::default();
        config.theme = "dark".to_string();
        config.accent_color = "orange".to_string();
        config.show_list_counts = false;

        // A machine that never picked anything wears the notebook's look,
        // which is what lets a notebook carry it to a new screen.
        let display = Display::resolve(&DisplayPrefs::default(), &config);
        assert_eq!(display.theme, "dark");
        assert_eq!(display.accent_color, "orange");
        assert!(!display.show_list_counts);
    }

    #[test]
    fn what_the_machine_answered_wins_over_the_notebook() {
        let mut config = Config::default();
        config.theme = "dark".to_string();
        config.show_list_counts = false;

        let machine = DisplayPrefs {
            theme: Some("default".to_string()),
            show_list_counts: Some(true),
            ..DisplayPrefs::default()
        };
        let display = Display::resolve(&machine, &config);

        assert_eq!(display.theme, "default", "esta tela escolheu");
        assert!(display.show_list_counts);
        // Untouched by this machine: still the notebook's.
        assert_eq!(display.accent_color, config.accent_color);
    }

    #[test]
    fn a_false_from_the_machine_is_an_answer_and_not_an_absence() {
        // The bug this shape prevents: `unwrap_or` on a bool that was never
        // an Option would read "off" as "did not answer" and hand back the
        // notebook's `true` for ever.
        let mut config = Config::default();
        config.restore_last_screen = true;

        let machine = DisplayPrefs {
            restore_last_screen: Some(false),
            ..DisplayPrefs::default()
        };
        assert!(!Display::resolve(&machine, &config).restore_last_screen);
    }

    #[test]
    fn a_patch_keeps_every_choice_it_does_not_mention() {
        let mut stored = DisplayPrefs {
            theme: Some("dark".to_string()),
            accent_color: Some("orange".to_string()),
            ..DisplayPrefs::default()
        };
        stored.patch(DisplayPrefs {
            note_font_size: Some("large".to_string()),
            ..DisplayPrefs::default()
        });

        assert_eq!(stored.theme.as_deref(), Some("dark"));
        assert_eq!(stored.accent_color.as_deref(), Some("orange"));
        assert_eq!(stored.note_font_size.as_deref(), Some("large"));
    }

    #[test]
    fn what_is_written_is_what_is_read_back() {
        // The round trip the settings screen makes: every field it can send
        // comes back filled, and the Display half comes back from the MACHINE
        // even though the write went to the notebook.
        let mut config = Config::default();
        settings(r#"{"theme": "light", "confirmDeletes": false, "dailyAt": "04:00"}"#)
            .apply_to(&mut config);

        let machine = DisplayPrefs {
            theme: Some("dark".to_string()),
            ..DisplayPrefs::default()
        };
        let read = NotebookSettings::of(&config, &Display::resolve(&machine, &config));

        assert_eq!(read.confirm_deletes, Some(false));
        assert_eq!(read.daily_at.as_deref(), Some("04:00"));
        assert_eq!(read.theme.as_deref(), Some("dark"), "a tela venceu o caderno");
    }
}
