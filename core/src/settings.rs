//! The Settings screen's two drawers, and the rule that tells them apart.
//!
//! **The rule of the split is the SECTION, not the key: Display is this
//! machine, every other section is the notebook** (2026-08-20, user call: "no
//! meu celular quero tema escuro e no desktop tema Jott"). The two choices
//! that used to sit in Display and are NOT about a screen moved to the section
//! they belong to rather than becoming exceptions — where a quick note lands
//! is the notebook's (Notebook), and whether an overdue task counts as urgent
//! is a rule about tasks (Date preferences).
//!
//! Both drawers are described here, in the core, for the same reason every
//! other rule is: a second frontend has to resolve them the same way, and a
//! policy that only exists in the bridge is invisible to it. What the core
//! does NOT do is decide where either drawer is stored — the notebook's half
//! goes into `.jott/config.json` ([`crate::config::Config`]) and the machine's
//! into whatever file the shell keeps per install.

use serde::{Deserialize, Serialize};

use crate::config::{Config, DateFormat, RolloverMode};
use crate::WeekStart;

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
    /// The MODE (2026-08-26): `jott` (black frame, white page), `light`,
    /// `dark`. Until then the three were the `theme`, which now names the
    /// PALETTE; an old `theme` holding one of them reads as a mode
    /// (`split_legacy_theme`), so nothing is migrated.
    pub mode: Option<String>,
    pub theme: Option<String>,
    pub accent_color: Option<String>,
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    /// The three faces (2026-08-24). Display, and the section is what decides
    /// it: which fonts exist is a fact about THIS machine, so the answer must
    /// not travel with the notebook to a machine that does not have them.
    /// Absent is not "the app's own" — it is "this machine did not answer",
    /// and then the notebook's own choice stands (the recuo that spares a
    /// migration).
    pub interface_font: Option<String>,
    pub note_font: Option<String>,
    pub mono_font: Option<String>,
    /// When the floating formatting bar shows, and which side of the canvas
    /// it hugs (2026-08-21). Display, and it is the section that decides:
    /// where a bar sits over a document is a fact about THIS screen — a phone
    /// has neither, and a wide monitor and a laptop do not agree about it.
    pub format_bar: Option<String>,
    pub format_bar_side: Option<String>,
    pub date_display_format: Option<String>,
    pub show_list_counts: Option<bool>,
    pub restore_last_screen: Option<bool>,
    pub close_inspector_on_click_away: Option<bool>,
    pub auto_space_colors: Option<bool>,
}

/// A font choice on its way in: kept when it is a name that can be written
/// into CSS or the empty "use the app's own", dropped otherwise — dropped
/// meaning the machine simply did not answer, which is a state this struct
/// already has a word for.
fn safe_font(choice: Option<String>) -> Option<String> {
    choice.filter(|name| name.trim().is_empty() || crate::fonts::is_safe_family(name.trim()))
}

impl DisplayPrefs {
    /// Takes one or more choices from `patch`, keeping everything it leaves
    /// out — so the settings screen can send the one key that changed. The
    /// same pact [`NotebookSettings`] makes about the notebook's own
    /// preferences.
    pub fn patch(&mut self, patch: DisplayPrefs) {
        let patch = patch.normalized();
        *self = self.normalized();
        take(&mut self.mode, patch.mode);
        take(&mut self.theme, patch.theme);
        take(&mut self.accent_color, patch.accent_color);
        take(&mut self.heading_color, patch.heading_color);
        take(&mut self.note_font_size, patch.note_font_size);
        // The one value a machine sends that came from ITS font library: a
        // family name is written into a CSS declaration, so a name that could
        // end the declaration is dropped here rather than stored and dealt
        // with at every reader. An empty name is not a bad one — it is how
        // the app's own face is asked for.
        take(&mut self.interface_font, safe_font(patch.interface_font));
        take(&mut self.note_font, safe_font(patch.note_font));
        take(&mut self.mono_font, safe_font(patch.mono_font));
        take(&mut self.format_bar, patch.format_bar);
        take(&mut self.format_bar_side, patch.format_bar_side);
        take(&mut self.date_display_format, patch.date_display_format);
        take(&mut self.show_list_counts, patch.show_list_counts);
        take(&mut self.auto_space_colors, patch.auto_space_colors);
        take(&mut self.restore_last_screen, patch.restore_last_screen);
        take(
            &mut self.close_inspector_on_click_away,
            patch.close_inspector_on_click_away,
        );
    }
}

impl DisplayPrefs {
    /// The same choices with an old-style `theme` (`default`, `light`,
    /// `dark`) read as the `mode` it meant. Applied wherever the struct is
    /// read or patched, never written back on its own: a file this build
    /// never touches keeps its old key, and a file it writes gets `mode`.
    pub fn normalized(&self) -> Self {
        let mut out = self.clone();
        if out.mode.is_none() {
            if let Some(theme) = out.theme.as_deref() {
                if let (Some(mode), rest) = split_legacy_theme(theme) {
                    out.mode = Some(mode.to_string());
                    out.theme = Some(rest.to_string());
                }
            }
        }
        out
    }
}

/// What an old `theme` value means now that the palette is the theme: the
/// three names that were the app's own looks are MODES (`default` was the
/// jott mode's first name), and anything else is a palette name. Returns the
/// mode, if the value was one, and the theme that is left.
pub fn split_legacy_theme(theme: &str) -> (Option<&'static str>, &str) {
    match theme.trim() {
        "default" | "jott" => (Some("jott"), ""),
        "light" => (Some("light"), ""),
        "dark" => (Some("dark"), ""),
        other => (None, other),
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
    pub mode: String,
    pub theme: String,
    pub accent_color: String,
    pub heading_color: String,
    pub note_font_size: String,
    pub interface_font: String,
    pub note_font: String,
    pub mono_font: String,
    pub format_bar: String,
    pub format_bar_side: String,
    pub date_display_format: String,
    pub show_list_counts: bool,
    pub restore_last_screen: bool,
    pub close_inspector_on_click_away: bool,
    /// The sidebar's rainbow (2026-08-24): every entry takes the next of
    /// the seven, starting from the accent. This screen's, like the accent.
    pub auto_space_colors: bool,
}

impl Display {
    pub fn resolve(machine: &DisplayPrefs, config: &Config) -> Self {
        let machine = machine.normalized();
        Self {
            mode: machine.mode.clone().unwrap_or_else(|| config.mode.clone()),
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
            interface_font: machine
                .interface_font
                .clone()
                .unwrap_or_else(|| config.interface_font.clone()),
            note_font: machine
                .note_font
                .clone()
                .unwrap_or_else(|| config.note_font.clone()),
            mono_font: machine
                .mono_font
                .clone()
                .unwrap_or_else(|| config.mono_font.clone()),
            format_bar: machine
                .format_bar
                .clone()
                .unwrap_or_else(|| config.format_bar.clone()),
            format_bar_side: machine
                .format_bar_side
                .clone()
                .unwrap_or_else(|| config.format_bar_side.clone()),
            date_display_format: machine
                .date_display_format
                .clone()
                .unwrap_or_else(|| config.date_display_format.render().to_string()),
            show_list_counts: machine.show_list_counts.unwrap_or(config.show_list_counts),
            auto_space_colors: machine.auto_space_colors.unwrap_or(config.auto_space_colors),
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
    /// `monday` / `sunday` — what the Home's calendar strip starts on.
    pub week_starts_on: Option<String>,
    pub restore_last_screen: Option<bool>,
    pub show_list_counts: Option<bool>,
    pub dated_tasks_join_period: Option<bool>,
    /// Ask before deleting. Turned off from the dialog itself.
    pub confirm_deletes: Option<bool>,
    /// Ask before fetching a picture from the internet. The user turns this
    /// off from the dialog itself ("don't ask again").
    pub confirm_image_downloads: Option<bool>,
    /// Whether the Timeline names deleted things (`Config::timeline_ghost_titles`).
    pub timeline_ghost_titles: Option<bool>,
    pub auto_urgent_by_date: Option<bool>,
    /// `off` / `dayOf` / `dayBefore` — see `reminders::AutoRemind`.
    pub auto_remind: Option<String>,
    /// `HH:MM`.
    pub reminder_time: Option<String>,
    pub new_tasks_on_top: Option<bool>,
    pub auto_space_colors: Option<bool>,
    pub date_display_format: Option<String>,
    /// One of the eight, by name; empty goes back to the app's own.
    pub accent_color: Option<String>,
    /// The mode (`jott` / `light` / `dark`); empty goes back to the app's own.
    pub mode: Option<String>,
    /// A theme (palette) name; empty goes back to the app's own.
    pub theme: Option<String>,
    /// `"ink"` draws headings in plain ink; empty (or anything else) accents.
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    /// The three faces, by family name; empty goes back to the one the app
    /// carries (2026-08-24). A name that could not be written into CSS is
    /// refused on the way IN — this is the one Display value that arrives
    /// from a machine's own font library, and the config reader keeps the
    /// same gate (`fonts::is_safe_family`).
    pub interface_font: Option<String>,
    pub note_font: Option<String>,
    pub mono_font: Option<String>,
    /// `always` / `selection` / `off`, and `top` / `left` / `right` /
    /// `bottom`. Names, never policed here — see `DisplayPrefs`.
    pub format_bar: Option<String>,
    pub format_bar_side: Option<String>,
    pub close_inspector_on_click_away: Option<bool>,
    pub quick_note_folder: Option<String>,
    pub quick_task_list: Option<String>,
    /// Whether the fixed Tasks screen shows every list, arranged by space,
    /// instead of the Inbox alone (2026-09-04).
    pub tasks_show_all: Option<bool>,
    /// The board layout of a notes space that never chose one (`grid` /
    /// `tree`); empty goes back to the app's own.
    pub note_layout: Option<String>,
    /// How a table in a note sits in the column (`""` squeezed to fit /
    /// `scroll`); empty goes back to the app's own.
    pub table_layout: Option<String>,
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
            week_starts_on: Some(config.week_starts_on.render().to_string()),
            restore_last_screen: Some(display.restore_last_screen),
            show_list_counts: Some(display.show_list_counts),
            dated_tasks_join_period: Some(config.dated_tasks_join_period),
            confirm_deletes: Some(config.confirm_deletes),
            confirm_image_downloads: Some(config.confirm_image_downloads),
            timeline_ghost_titles: Some(config.timeline_ghost_titles),
            auto_urgent_by_date: Some(config.auto_urgent_by_date),
            auto_remind: Some(config.auto_remind.render().to_string()),
            reminder_time: Some(config.reminder_time.render()),
            new_tasks_on_top: Some(config.new_tasks_on_top),
            auto_space_colors: Some(display.auto_space_colors),
            date_display_format: Some(display.date_display_format.clone()),
            accent_color: Some(display.accent_color.clone()),
            mode: Some(display.mode.clone()),
            theme: Some(display.theme.clone()),
            heading_color: Some(display.heading_color.clone()),
            note_font_size: Some(display.note_font_size.clone()),
            interface_font: Some(display.interface_font.clone()),
            note_font: Some(display.note_font.clone()),
            mono_font: Some(display.mono_font.clone()),
            format_bar: Some(display.format_bar.clone()),
            format_bar_side: Some(display.format_bar_side.clone()),
            close_inspector_on_click_away: Some(display.close_inspector_on_click_away),
            quick_note_folder: Some(config.quick_note_folder.clone()),
            quick_task_list: Some(config.quick_task_list.clone()),
            tasks_show_all: Some(config.tasks_show_all),
            note_layout: Some(config.note_layout.clone()),
            table_layout: Some(config.table_layout.clone()),
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
        if let Some(v) = &self.week_starts_on {
            config.week_starts_on = WeekStart::parse_or_default(v);
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
        if let Some(v) = self.timeline_ghost_titles {
            config.timeline_ghost_titles = v;
        }
        if let Some(v) = self.auto_urgent_by_date {
            config.auto_urgent_by_date = v;
        }
        if let Some(v) = &self.auto_remind {
            config.auto_remind = crate::reminders::AutoRemind::parse_or_default(v);
        }
        if let Some(v) = &self.reminder_time {
            config.reminder_time = crate::reminders::ReminderTime::parse_or_default(v);
        }
        if let Some(v) = self.new_tasks_on_top {
            config.new_tasks_on_top = v;
        }
        if let Some(v) = self.auto_space_colors {
            config.auto_space_colors = v;
        }
        if let Some(v) = &self.date_display_format {
            config.date_display_format = DateFormat::parse_or_default(v);
        }
        // Not validated here: the eight colours and the list of themes are the
        // interface's, and a name this build does not know must round-trip
        // (core/src/config.rs).
        if let Some(v) = &self.accent_color {
            config.accent_color = v.trim().to_string();
        }
        if let Some(v) = &self.mode {
            config.mode = v.trim().to_string();
        }
        if let Some(v) = &self.theme {
            config.theme = v.trim().to_string();
        }
        if let Some(v) = &self.note_font_size {
            config.note_font_size = v.trim().to_string();
        }
        // The one Display value with a gate: a family name is written into a
        // CSS declaration, so a name that could end the declaration is not
        // stored. Clearing (an empty name) is always allowed — it is how the
        // app's own face is asked for.
        for (value, field) in [
            (&self.interface_font, &mut config.interface_font),
            (&self.note_font, &mut config.note_font),
            (&self.mono_font, &mut config.mono_font),
        ] {
            if let Some(v) = value {
                let name = v.trim();
                if name.is_empty() || crate::fonts::is_safe_family(name) {
                    *field = name.to_string();
                }
            }
        }
        if let Some(v) = &self.format_bar {
            config.format_bar = v.trim().to_string();
        }
        if let Some(v) = &self.format_bar_side {
            config.format_bar_side = v.trim().to_string();
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
        // Path-like strings, not validated (the front resolves them against
        // what exists and falls back): empty is each one's default reading.
        if let Some(v) = &self.quick_task_list {
            config.quick_task_list = v.trim().to_string();
        }
        if let Some(v) = self.tasks_show_all {
            config.tasks_show_all = v;
        }
        // Not validated, like the looks above: the layouts are the
        // interface's list, and a name this build does not know round-trips.
        if let Some(v) = &self.note_layout {
            config.note_layout = v.trim().to_string();
        }
        if let Some(v) = &self.table_layout {
            config.table_layout = v.trim().to_string();
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

/// The pages of Settings a "Reset this section" can put back (2026-08-24),
/// by the key the screen calls them. Display is not here: it is this
/// machine's drawer, and the bridge clears it (`prefs::clear_display`).
pub const RESETTABLE_SECTIONS: [&str; 5] = ["dates", "notebook", "tasks", "notes", "time"];

/// Puts every notebook setting of one page back to what the app ships
/// with, and nothing else — `Config::default()` is the source, so a new
/// default reaches the reset without a second list. `false` for a section
/// that has no page here (including `display`, which is not the notebook's).
///
/// What each page holds is what the screen DRAWS on it: a key that moves
/// between pages moves here too, or the button lies.
pub fn reset_section(config: &mut Config, section: &str) -> bool {
    let d = Config::default();
    match section {
        "dates" => {
            config.rollover = d.rollover;
            config.week_starts_on = d.week_starts_on;
            config.dated_tasks_join_period = d.dated_tasks_join_period;
        }
        "notebook" => {
            config.quick_note_folder = d.quick_note_folder;
            config.quick_task_list = d.quick_task_list;
            config.confirm_deletes = d.confirm_deletes;
            config.completed_retention_days = d.completed_retention_days;
            config.trash_retention_days = d.trash_retention_days;
        }
        "tasks" => {
            config.auto_urgent_by_date = d.auto_urgent_by_date;
            config.tasks_show_all = d.tasks_show_all;
            config.auto_remind = d.auto_remind;
            config.reminder_time = d.reminder_time;
            config.new_tasks_on_top = d.new_tasks_on_top;
        }
        "time" => {
            config.timeline_ghost_titles = d.timeline_ghost_titles;
        }
        "notes" => {
            config.note_layout = d.note_layout;
            config.table_layout = d.table_layout;
            config.confirm_image_downloads = d.confirm_image_downloads;
            config.format_bar = d.format_bar;
            config.format_bar_side = d.format_bar_side;
        }
        _ => return false,
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(json: &str) -> NotebookSettings {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn resetting_a_section_touches_only_that_page() {
        let mut config = Config::default();
        config.new_tasks_on_top = true;
        config.trash_retention_days = 7;
        config.theme = "dark".to_string();

        assert!(reset_section(&mut config, "tasks"));
        assert!(!config.new_tasks_on_top, "the Tasks page went back");
        assert_eq!(config.trash_retention_days, 7, "the Notebook page did not");
        assert_eq!(config.theme, "dark");

        assert!(reset_section(&mut config, "notebook"));
        assert_eq!(config.trash_retention_days, Config::default().trash_retention_days);

        // Display is the machine's, and an unknown page is nobody's.
        assert!(!reset_section(&mut config, "display"));
        assert!(!reset_section(&mut config, "banana"));
        for section in RESETTABLE_SECTIONS {
            assert!(reset_section(&mut Config::default(), section));
        }
    }

    #[test]
    fn a_font_name_that_could_break_a_css_declaration_is_never_stored() {
        let mut prefs = DisplayPrefs::default();
        prefs.patch(DisplayPrefs {
            interface_font: Some("Fira Sans".into()),
            note_font: Some("Evil\"; color: red".into()),
            mono_font: Some(String::new()),
            ..Default::default()
        });

        assert_eq!(prefs.interface_font.as_deref(), Some("Fira Sans"));
        assert_eq!(prefs.note_font, None, "the machine did not answer");
        assert_eq!(prefs.mono_font.as_deref(), Some(""), "empty asks for the app's own");
    }

    #[test]
    fn a_machine_without_a_font_answer_reads_the_notebooks() {
        let mut config = Config::default();
        config.interface_font = "Charter".to_string();
        config.mono_font = "Fira Code".to_string();
        let machine = DisplayPrefs { note_font: Some("Literata".into()), ..Default::default() };

        let display = Display::resolve(&machine, &config);

        assert_eq!(display.interface_font, "Charter", "o caderno responde");
        assert_eq!(display.note_font, "Literata", "a máquina venceu");
        assert_eq!(display.mono_font, "Fira Code");
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
        assert_eq!(config.week_starts_on, WeekStart::default());
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
    fn the_default_note_layout_is_a_notebook_setting() {
        let mut config = Config::default();
        settings(r#"{"noteLayout": " tree "}"#).apply_to(&mut config);
        assert_eq!(config.note_layout, "tree");
        assert_eq!(
            NotebookSettings::of(&config, &Display::resolve(&Default::default(), &config))
                .note_layout
                .as_deref(),
            Some("tree")
        );
        // Absent on the way in leaves it alone; empty sends it back to the
        // app's own.
        settings(r#"{}"#).apply_to(&mut config);
        assert_eq!(config.note_layout, "tree");
        settings(r#"{"noteLayout": ""}"#).apply_to(&mut config);
        assert_eq!(config.note_layout, "");
        settings(r#"{"tableLayout": " scroll "}"#).apply_to(&mut config);
        assert_eq!(config.table_layout, "scroll");
        assert_eq!(
            NotebookSettings::of(&config, &Display::resolve(&DisplayPrefs::default(), &config))
                .table_layout
                .as_deref(),
            Some("scroll")
        );
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
        config.mode = "dark".to_string();
        config.accent_color = "orange".to_string();
        config.show_list_counts = false;

        // A machine that never picked anything wears the notebook's look,
        // which is what lets a notebook carry it to a new screen.
        let display = Display::resolve(&DisplayPrefs::default(), &config);
        assert_eq!(display.mode, "dark");
        assert_eq!(display.accent_color, "orange");
        assert!(!display.show_list_counts);
    }

    #[test]
    fn what_the_machine_answered_wins_over_the_notebook() {
        let mut config = Config::default();
        config.mode = "dark".to_string();
        config.show_list_counts = false;

        let machine = DisplayPrefs {
            mode: Some("jott".to_string()),
            show_list_counts: Some(true),
            ..DisplayPrefs::default()
        };
        let display = Display::resolve(&machine, &config);

        assert_eq!(display.mode, "jott", "esta tela escolheu");
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
    fn where_the_formatting_bar_sits_is_this_screens_answer() {
        // It is Display, so the machine wins — and a phone, which has no
        // floating bar at all, leaves the notebook's answer alone for the
        // desktop that shares it.
        let mut config = Config::default();
        config.format_bar = "off".to_string();
        config.format_bar_side = "bottom".to_string();

        let unanswered = Display::resolve(&DisplayPrefs::default(), &config);
        assert_eq!(unanswered.format_bar, "off", "o caderno respondeu");
        assert_eq!(unanswered.format_bar_side, "bottom");

        let machine = DisplayPrefs {
            format_bar: Some("selection".to_string()),
            ..DisplayPrefs::default()
        };
        let display = Display::resolve(&machine, &config);
        assert_eq!(display.format_bar, "selection", "esta tela escolheu");
        // The side was not answered here, so it is still the notebook's.
        assert_eq!(display.format_bar_side, "bottom");

        // And it round-trips through the screen's own shape.
        let read = NotebookSettings::of(&config, &display);
        assert_eq!(read.format_bar.as_deref(), Some("selection"));
        assert_eq!(read.format_bar_side.as_deref(), Some("bottom"));
    }

    #[test]
    fn a_mode_this_build_does_not_know_is_written_as_it_arrived() {
        // Same covenant as the accent and the theme: the list of modes is the
        // interface's, so the core trims and stores rather than judging.
        let mut config = Config::default();
        settings(r#"{"formatBar": "  hover  ", "formatBarSide": " float "}"#)
            .apply_to(&mut config);

        assert_eq!(config.format_bar, "hover");
        assert_eq!(config.format_bar_side, "float");
    }

    #[test]
    fn a_patch_keeps_every_choice_it_does_not_mention() {
        let mut stored = DisplayPrefs {
            mode: Some("dark".to_string()),
            accent_color: Some("orange".to_string()),
            ..DisplayPrefs::default()
        };
        stored.patch(DisplayPrefs {
            note_font_size: Some("large".to_string()),
            ..DisplayPrefs::default()
        });

        assert_eq!(stored.mode.as_deref(), Some("dark"));
        assert_eq!(stored.accent_color.as_deref(), Some("orange"));
        assert_eq!(stored.note_font_size.as_deref(), Some("large"));
    }

    #[test]
    fn what_is_written_is_what_is_read_back() {
        // The round trip the settings screen makes: every field it can send
        // comes back filled, and the Display half comes back from the MACHINE
        // even though the write went to the notebook.
        let mut config = Config::default();
        settings(r#"{"mode": "light", "confirmDeletes": false, "dailyMode": "carry"}"#)
            .apply_to(&mut config);

        let machine = DisplayPrefs {
            mode: Some("dark".to_string()),
            ..DisplayPrefs::default()
        };
        let read = NotebookSettings::of(&config, &Display::resolve(&machine, &config));

        assert_eq!(read.confirm_deletes, Some(false));
        assert_eq!(read.daily_mode.as_deref(), Some("carry"));
        assert_eq!(read.mode.as_deref(), Some("dark"), "a tela venceu o caderno");
    }

    #[test]
    fn an_old_theme_of_the_three_reads_as_a_mode() {
        // Until 2026-08-26 `theme` held `default`/`light`/`dark`. Nothing is
        // migrated: the value is read as the mode it meant, and the theme
        // (the palette) it leaves behind is the app's own.
        let machine = DisplayPrefs {
            theme: Some("dark".to_string()),
            ..DisplayPrefs::default()
        };
        let display = Display::resolve(&machine, &Config::default());
        assert_eq!(display.mode, "dark");
        assert_eq!(display.theme, "");

        // A palette name is a palette name, and a `mode` already there wins.
        let both = DisplayPrefs {
            mode: Some("light".to_string()),
            theme: Some("dark".to_string()),
            ..DisplayPrefs::default()
        };
        let display = Display::resolve(&both, &Config::default());
        assert_eq!((display.mode.as_str(), display.theme.as_str()), ("light", "dark"));
        assert_eq!(split_legacy_theme(" default "), (Some("jott"), ""));
        assert_eq!(split_legacy_theme("solarized"), (None, "solarized"));

        // Patching an old file writes `mode` from then on.
        let mut stored = DisplayPrefs {
            theme: Some("light".to_string()),
            ..DisplayPrefs::default()
        };
        stored.patch(DisplayPrefs {
            accent_color: Some("red".into()),
            ..DisplayPrefs::default()
        });
        assert_eq!(stored.mode.as_deref(), Some("light"));
        assert_eq!(stored.theme.as_deref(), Some(""));
    }
}
