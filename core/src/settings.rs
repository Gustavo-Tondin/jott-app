//! The Settings screen's two drawers, and the rule that tells them apart:
//! **the split is the SECTION, not the key — Display is this machine, every
//! other section is the notebook.** Both are resolved here in the core so a
//! second frontend agrees; where each is stored is the shell's business
//! (`.jott/config.json` via [`crate::config::Config`] vs. a per-install file).

use serde::{Deserialize, Serialize};

use crate::config::{Config, DateFormat, RolloverMode};
use crate::WeekStart;

/// The Display choices, which answer to a SCREEN, not a notebook — the whole
/// Display section, which is what makes the split a rule. Every field is
/// optional, and absent is not "off": **this machine has no answer, so the
/// notebook's is used** — which is also why nothing had to be migrated.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DisplayPrefs {
    /// The MODE: `jott` (black frame, white page), `light`, `dark`. An old
    /// `theme` holding one of them reads as a mode (`split_legacy_theme`), so
    /// nothing is migrated; `theme` now names the PALETTE.
    pub mode: Option<String>,
    pub theme: Option<String>,
    pub accent_color: Option<String>,
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    /// How many lines of a note a card on the board draws, and how a notes
    /// space arranges that board (`grid` / `tree`) until it chooses for
    /// itself. Display, because both answer to a SCREEN: the same board is a
    /// wall of cards on a monitor and a column on a phone.
    pub card_lines: Option<i64>,
    pub note_layout: Option<String>,
    /// The three faces. Display, because which fonts exist is a fact about
    /// THIS machine and must not travel with the notebook. Absent is "this
    /// machine did not answer", and the notebook's own choice stands.
    pub interface_font: Option<String>,
    pub note_font: Option<String>,
    pub mono_font: Option<String>,
    /// When the floating formatting bar shows, and which side of the canvas
    /// it hugs. Display: where a bar sits over a document is a fact about
    /// THIS screen — a phone has neither, a wide monitor and a laptop disagree.
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
        take(&mut self.card_lines, patch.card_lines);
        take(&mut self.note_layout, patch.note_layout);
        // A family name is written into a CSS declaration, so a name that
        // could end the declaration is dropped here rather than at every
        // reader. An empty name is how the app's own face is asked for.
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

/// The display choices in force, machine over notebook: what this machine has
/// not chosen falls back to the notebook ([`DisplayPrefs`]). One type with one
/// constructor, because four doors answer with these values — layout, settings
/// screen, sidebar counters, screen to restore — and must not drift on who wins.
#[derive(Debug, Clone, PartialEq)]
pub struct Display {
    pub mode: String,
    pub theme: String,
    pub accent_color: String,
    pub heading_color: String,
    pub note_font_size: String,
    pub card_lines: i64,
    pub note_layout: String,
    pub interface_font: String,
    pub note_font: String,
    pub mono_font: String,
    pub format_bar: String,
    pub format_bar_side: String,
    pub date_display_format: String,
    pub show_list_counts: bool,
    pub restore_last_screen: bool,
    pub close_inspector_on_click_away: bool,
    /// The sidebar's rainbow: every entry takes the next of the seven,
    /// starting from the accent. This screen's, like the accent.
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
            card_lines: machine.card_lines.unwrap_or(config.card_lines),
            note_layout: machine
                .note_layout
                .clone()
                .unwrap_or_else(|| config.note_layout.clone()),
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

/// The notebook preferences, flattened for the UI: plain strings and bools,
/// so a value the frontend cannot parse still round-trips. Everything is
/// optional on the way **in** — a missing field keeps what is stored, so a
/// new preference breaks no older caller. On the way **out** all are filled.
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
    /// Whether the Timeline names deleted tasks, and deleted notes
    /// (`Config::timeline_ghost_tasks` / `_notes`).
    pub timeline_ghost_tasks: Option<bool>,
    pub timeline_ghost_notes: Option<bool>,
    pub auto_urgent_by_date: Option<bool>,
    /// `off` / `dayOf` / `dayBefore` / `both` — see `reminders::AutoRemind`.
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
    /// How many lines of a note a card on the board draws; a number outside
    /// the interface's range goes back to the app's own.
    pub card_lines: Option<i64>,
    /// The three faces, by family name; empty goes back to the app's own. A
    /// name that could not be written into CSS is refused on the way IN — the
    /// one Display value that arrives from a machine's own font library
    /// (`fonts::is_safe_family`, same gate as the config reader).
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
    /// instead of the Inbox alone.
    pub tasks_show_all: Option<bool>,
    /// Whether the task panel offers the fields that are off (`Config`).
    pub offer_task_fields: Option<bool>,
    /// The board layout of a notes space that never chose one (`grid` /
    /// `tree`); empty goes back to the app's own.
    pub note_layout: Option<String>,
    /// How a table in a note sits in the column (`""` squeezed to fit /
    /// `scroll`); empty goes back to the app's own.
    pub table_layout: Option<String>,
    /// Days a completed task stays in its `Completed.md` before the reaper
    /// files it away into the trash; 0 means never.
    pub completed_retention_days: Option<i64>,
    /// Days a trashed item waits before the trash reaper clears it for good.
    pub trash_retention_days: Option<i64>,
}

impl NotebookSettings {
    /// Everything in force, for the settings screen to draw. The Display half
    /// comes from `display`, not `config`: it answers to this machine. Reading
    /// changes nothing on either side.
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
            timeline_ghost_tasks: Some(config.timeline_ghost_tasks),
            timeline_ghost_notes: Some(config.timeline_ghost_notes),
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
            card_lines: Some(display.card_lines),
            interface_font: Some(display.interface_font.clone()),
            note_font: Some(display.note_font.clone()),
            mono_font: Some(display.mono_font.clone()),
            format_bar: Some(display.format_bar.clone()),
            format_bar_side: Some(display.format_bar_side.clone()),
            close_inspector_on_click_away: Some(display.close_inspector_on_click_away),
            quick_note_folder: Some(config.quick_note_folder.clone()),
            quick_task_list: Some(config.quick_task_list.clone()),
            tasks_show_all: Some(config.tasks_show_all),
            offer_task_fields: Some(config.offer_task_fields),
            note_layout: Some(display.note_layout.clone()),
            table_layout: Some(config.table_layout.clone()),
            completed_retention_days: Some(config.completed_retention_days),
            trash_retention_days: Some(config.trash_retention_days),
        }
    }

    /// Writes the preferences that arrived into `config`. An unparseable value
    /// falls back to the core's default, so the UI cannot write a broken
    /// config; a value that does not arrive is left exactly as it was.
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
        if let Some(v) = self.timeline_ghost_tasks {
            config.timeline_ghost_tasks = v;
        }
        if let Some(v) = self.timeline_ghost_notes {
            config.timeline_ghost_notes = v;
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
        // A card of no lines is not a card; the range itself is the
        // interface's, so nothing else is judged here.
        if let Some(v) = self.card_lines.filter(|lines| *lines > 0) {
            config.card_lines = v;
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
        if let Some(v) = self.offer_task_fields {
            config.offer_task_fields = v;
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

/// The pages of Settings a "Reset this section" can put back, by the key the
/// screen calls them. Display is not here: it is this machine's drawer, and
/// the bridge clears it (`prefs::clear_display`).
pub const RESETTABLE_SECTIONS: [&str; 5] = ["dates", "notebook", "tasks", "notes", "time"];

/// Puts every notebook setting of one page back to what the app ships with —
/// `Config::default()` is the source, so a new default needs no second list.
/// `false` for a section with no page here (`display` included). What each
/// page holds is what the screen DRAWS on it: a key that moves, moves here too.
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
            config.offer_task_fields = d.offer_task_fields;
            config.auto_remind = d.auto_remind;
            config.reminder_time = d.reminder_time;
            config.new_tasks_on_top = d.new_tasks_on_top;
        }
        "time" => {
            config.timeline_ghost_tasks = d.timeline_ghost_tasks;
            config.timeline_ghost_notes = d.timeline_ghost_notes;
        }
        "notes" => {
            config.table_layout = d.table_layout;
            config.confirm_image_downloads = d.confirm_image_downloads;
            config.format_bar = d.format_bar;
            config.format_bar_side = d.format_bar_side;
        }
        _ => return false,
    }
    true
}
