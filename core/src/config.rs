//! The notebook's `.jott/config.json`: preferences that travel with the
//! notebook. Machine preferences live in the OS config folder, never here.
//! Reading is forgiving (missing or malformed key = default, unreadable file
//! recreated); an unknown key written by another version survives a rewrite.

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::{Map, Value};

use crate::clock::WeekStart;
use crate::error::Result;

/// Schema version this build understands. A notebook declaring more than this
/// was written by a newer app and opens read-only.
pub const SUPPORTED_SCHEMA_VERSION: u64 = 1;

/// What happens to unfinished tasks when the period turns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RolloverMode {
    /// Empty the state; unfinished tasks go back to being suggestions. The
    /// default: the day is an active choice, not a queue that piles up.
    #[default]
    Reset,
    /// Keep the pulled references, so they show up already pulled.
    Carry,
}

impl RolloverMode {
    pub fn parse_or_default(text: &str) -> Self {
        match text.trim().to_ascii_lowercase().as_str() {
            "carry" => Self::Carry,
            _ => Self::Reset,
        }
    }

    pub fn render(self) -> &'static str {
        match self {
            Self::Reset => "reset",
            Self::Carry => "carry",
        }
    }
}

/// Rollover preferences for the day. A `daily.at` a notebook still carries
/// is an unknown key now: it round-trips, and nothing reads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DailyRollover {
    pub mode: RolloverMode,
}

/// The turn of the day. A `rollover.weekly` a notebook still carries is an
/// unknown key: it round-trips, and only the `weekStartsOn` fallback reads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Rollover {
    pub daily: DailyRollover,
}

/// How a date is shown. The file always stores ISO; this is display only.
/// A closed set, not a free pattern: an unparseable value would fall back silently.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DateFormat {
    /// `07/25/2026` — the default.
    #[default]
    MonthDayYear,
    /// `25/07/2026`
    DayMonthYear,
    /// `2026/07/25` — ISO order, drawn with the same separator as the rest.
    YearMonthDay,
}

impl DateFormat {
    /// Every shape uses `/`; the hyphen spellings a notebook may still carry
    /// parse too, landing on the matching slash shape.
    pub fn parse_or_default(text: &str) -> Self {
        match text.trim().to_ascii_lowercase().as_str() {
            "dd/mm/yyyy" | "dd-mm-yyyy" => Self::DayMonthYear,
            "yyyy/mm/dd" | "yyyy-mm-dd" => Self::YearMonthDay,
            _ => Self::MonthDayYear,
        }
    }

    pub fn render(self) -> &'static str {
        match self {
            Self::MonthDayYear => "mm/dd/yyyy",
            Self::DayMonthYear => "dd/mm/yyyy",
            Self::YearMonthDay => "yyyy/mm/dd",
        }
    }

    /// Formats a date for display.
    pub fn format(self, date: chrono::NaiveDate) -> String {
        use chrono::Datelike;
        let (d, m, y) = (date.day(), date.month(), date.year());
        match self {
            Self::MonthDayYear => format!("{m:02}/{d:02}/{y}"),
            Self::DayMonthYear => format!("{d:02}/{m:02}/{y}"),
            Self::YearMonthDay => format!("{y}/{m:02}/{d:02}"),
        }
    }
}

/// A notebook's config file, in memory.
#[derive(Debug, Clone)]
pub struct Config {
    schema_version: u64,
    pub rollover: Rollover,
    /// Which weekday the Home's calendar strip starts on. Travels with the
    /// notebook; `rollover.weekly.startsOn` is still read when this is absent.
    pub week_starts_on: WeekStart,
    /// Reopen on the screen the user left instead of Today. The preference
    /// lives here; the screen it points at is machine-specific (OS config folder).
    pub restore_last_screen: bool,
    /// Show how many open tasks each list has, in the navigation.
    pub show_list_counts: bool,
    /// A dated task shows up in the Day on its own, without being pulled.
    /// Never writes to the state: the task is added when the period is READ,
    /// so un-dating takes it straight out and a hand-pulled task stays pulled.
    pub dated_tasks_join_period: bool,
    /// Ask before deleting. Turned off from the dialog itself ("don't ask
    /// again"); safe to offer because every delete goes to `.jott/trash/`.
    pub confirm_deletes: bool,
    /// Ask before the app fetches an image from the internet: a pasted
    /// `https://` picture must be DOWNLOADED to be drawn, the one thing that
    /// reaches outside the machine. The dialog names the host (principle 9).
    pub confirm_image_downloads: bool,
    /// Whether the Timeline names what was deleted. Off: a ghost reads as
    /// "deleted task" in its space's colour. The log keeps the birth title
    /// either way — this is only what the SCREEN says.
    pub timeline_ghost_tasks: bool,
    /// The same, for deleted notes.
    pub timeline_ghost_notes: bool,
    /// Treat a task due today or overdue as urgent. Switchable; a hand-written
    /// `#urgent` tag always counts.
    pub auto_urgent_by_date: bool,
    /// `HH:MM`: the hour the inspector's reminder presets land on.
    pub reminder_time: crate::reminders::ReminderTime,
    /// One notification at the start of the day, listing what the day holds.
    /// The notebook's answer to "remind me of my dates" — a task rings only
    /// if it asked (`remind:`), the day is announced once.
    pub day_summary: bool,
    /// `HH:MM`: when that announcement is made.
    pub day_summary_time: crate::reminders::ReminderTime,
    /// Where a new task lands in its list: above the first (`true`) or below
    /// the last. `List::add_first` keeps whatever sits above the checklist there.
    pub new_tasks_on_top: bool,
    /// The sidebar's rainbow: every top-level entry takes the next of the
    /// seven colours in sidebar order, starting from the accent. It IGNORES
    /// the colour a space chose. A Display choice: the notebook's fallback
    /// for a machine that never answered (`settings::Display::resolve`).
    pub auto_space_colors: bool,
    /// How dates are shown. The file always stores ISO.
    pub date_display_format: DateFormat,
    /// Which of the app's colours is the accent. A NAME (`"orange"`), never a
    /// hex: each has a light and a dark half, and only the interface knows the
    /// ground it lands on. Not policed here — a name from a newer build
    /// round-trips. Empty means what the app ships as.
    pub accent_color: String,
    /// Which MODE is on (`jott`, `light`, `dark`). A NAME, not policed here;
    /// empty means the app's own. A file with no `mode` and a `theme` of the
    /// old three reads that as the mode (`settings::split_legacy_theme`).
    pub mode: String,
    /// Which THEME (`.jott/themes/<name>`) is on. Same covenant as
    /// `accent_color`: a NAME, not policed here; a theme this build cannot
    /// draw round-trips. Empty means the app's own.
    pub theme: String,
    /// Whether headings are drawn in the accent or in plain ink: `"ink"`
    /// turns the colour off; anything else, including empty, means the
    /// accent. Same covenant as `accent_color`: a NAME, not policed here.
    pub heading_color: String,
    /// How big a note's body is drawn (`small` / `medium` / `large`). A NAME,
    /// not policed here. Travels WITH the notebook, unlike the interface's
    /// zoom, which answers to a monitor. Empty means the app's own size.
    pub note_font_size: String,
    /// The three faces: interface, note body, monospace. A family NAME as the
    /// machine spells it, or empty for the bundled default. Policed only by
    /// `fonts::is_safe_family` (it goes into CSS): which fonts exist is a fact
    /// about a MACHINE, and a notebook moved to another one keeps the answer.
    pub interface_font: String,
    pub note_font: String,
    pub mono_font: String,
    /// When the floating formatting bar is drawn (`always` / `selection` /
    /// `off`). Says nothing about the DOCKED panel. Empty means `always`.
    /// A NAME, not policed here — the list of modes is the interface's.
    pub format_bar: String,
    /// Which SIDE of the canvas the floating bar hugs (`top` / `left` /
    /// `right` / `bottom`), always centred on it. Empty means `top`. Unpoliced.
    pub format_bar_side: String,
    /// The user's keyboard bindings, `command id → chord`. Opaque to the
    /// core: kept and handed back untouched, so bindings from a newer build
    /// survive; the frontend ignores what it cannot honour
    /// (`services/commands.js`). Travels WITH the notebook, unlike zoom.
    pub shortcuts: Map<String, Value>,
    /// Close the task panel when clicking outside it. Off by default: it
    /// fires too easily and loses a half-typed task; kept for muscle memory.
    pub close_inspector_on_click_away: bool,
    /// Where the Home's quick capture writes, relative to the notes space.
    pub quick_note_folder: String,
    /// Where the Home's quick capture writes a TASK: empty is the fixed
    /// space's Inbox; a list's name is a list of the fixed space; a
    /// root-relative path is a user task space (its main list). Same
    /// path-like contract as `quick_note_folder`.
    pub quick_task_list: String,
    /// Whether the fixed Tasks screen shows every list of the notebook
    /// arranged by space, instead of the Inbox alone (the default).
    pub tasks_show_all: bool,
    /// Whether the task panel offers the task fields that are switched off
    /// (a card that opens Settings › Tasks). Closing that card once turns
    /// this off; the Settings row turns it back on.
    pub offer_task_fields: bool,
    /// How a notes space draws its board (`grid` / `tree`) when it has not
    /// chosen for itself in its `.space.json`. Empty means the app's own; the
    /// frontend owns the default and the list, so an unknown name round-trips.
    pub note_layout: String,
    /// How a table sits in the column: empty is the app's own (squeezed to
    /// content width, cells wrapping); `scroll` lets it run wide. An unknown
    /// name round-trips.
    pub table_layout: String,
    /// How tall a note card on the board may grow (`short` / `medium` /
    /// `tall`); empty means the app's own. A Display choice, so this is the
    /// notebook's answer for a machine that has none. Unpoliced, like the
    /// looks above: the list of heights is the interface's.
    pub card_height: String,
    /// Where "fresh", "stale" and "forgotten" begin, in days (`crate::age`).
    /// A notebook preference, not a machine one.
    pub age: crate::age::Thresholds,
    /// How many days a trashed item waits in `.jott/trash/` before the reaper
    /// clears it for good.
    pub trash_retention_days: i64,
    /// How many days a completed task stays in `Completed.md` before the
    /// reaper moves it to `.jott/trash/` (where `trash_retention_days` then
    /// applies). `0` means never.
    pub completed_retention_days: i64,
    /// Manual ordering set by dragging, keyed by namespace (`"spaces"`,
    /// `"lists:<folder>"`, …) → item names in order. Lives here, not in the
    /// files: on disk items sort by the filter. [`Config::apply_order`] applies it.
    pub order: BTreeMap<String, Vec<String>>,
    /// How the day is arranged (`name` / `created` / `completed`), today and
    /// the days planned ahead alike. A day has no `.space.json`, so it lives
    /// here. Empty means the state file's own (pulled) order.
    pub day_sort: String,
    /// Which parts of the app the user has an OPINION about. **Absent means
    /// "the default", and the core does not know what that is**: the defaults
    /// live in `src/lib/services/features.js` alone, so this map holds only
    /// what was deliberately changed.
    pub features: BTreeMap<String, bool>,
    /// How the sidebar arranges spaces and groups: `name` for alphabetical,
    /// anything else (the default) for the hand-dragged `order`.
    pub spaces_sort: String,
    /// The document exactly as it was read, so keys this build does not know
    /// about are written back instead of being silently dropped. This is what
    /// protects a notebook opened by two different app versions.
    raw: Map<String, Value>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            schema_version: SUPPORTED_SCHEMA_VERSION,
            rollover: Rollover::default(),
            week_starts_on: WeekStart::default(),
            restore_last_screen: false,
            show_list_counts: true,
            dated_tasks_join_period: true,
            confirm_deletes: true,
            confirm_image_downloads: true,
            timeline_ghost_tasks: false,
            timeline_ghost_notes: false,
            auto_urgent_by_date: true,
            reminder_time: Default::default(),
            day_summary: false,
            day_summary_time: crate::reminders::ReminderTime::parse("08:00")
                .expect("08:00 is a valid time"),
            new_tasks_on_top: true,
            auto_space_colors: false,
            date_display_format: DateFormat::default(),
            accent_color: String::new(),
            mode: String::new(),
            theme: String::new(),
            heading_color: String::new(),
            note_font_size: String::new(),
            interface_font: String::new(),
            note_font: String::new(),
            mono_font: String::new(),
            format_bar: String::new(),
            format_bar_side: String::new(),
            shortcuts: Map::new(),
            close_inspector_on_click_away: false,
            quick_note_folder: crate::notefolder::NOTES_INBOX.to_string(),
            quick_task_list: String::new(),
            tasks_show_all: false,
            offer_task_fields: true,
            note_layout: String::new(),
            table_layout: String::new(),
            card_height: String::new(),
            age: crate::age::Thresholds::default(),
            trash_retention_days: 30,
            completed_retention_days: 30,
            order: BTreeMap::new(),
            day_sort: String::new(),
            features: BTreeMap::new(),
            spaces_sort: String::new(),
            raw: Map::new(),
        }
    }
}

impl Config {
    pub fn schema_version(&self) -> u64 {
        self.schema_version
    }

    /// True when the file came from a newer app than this one: open
    /// read-only rather than corrupt fields this build does not know.
    pub fn is_read_only(&self) -> bool {
        self.schema_version > SUPPORTED_SCHEMA_VERSION
    }

    /// Reorders `items` in place by the manual order under `namespace`: named
    /// items first in stored order, the rest keep their relative order after
    /// them. A no-op when nothing is stored for the namespace.
    pub fn apply_order<T>(&self, namespace: &str, items: &mut [T], name_of: impl Fn(&T) -> &str) {
        let Some(order) = self.order.get(namespace) else {
            return;
        };
        by_rank(items, |item| order.iter().position(|o| o == name_of(item)));
    }

    /// What the user said about a feature, if anything. `None` means they
    /// never touched it, and the answer is its default — which the interface
    /// knows and the core deliberately does not.
    pub fn feature(&self, key: &str) -> Option<bool> {
        self.features.get(key).copied()
    }

    /// Records an opinion, or **forgets** one: `None` removes the key, which
    /// is what the interface sends when a switch returns to its default. The
    /// file only ever carries what differs from how the app ships.
    pub fn set_feature(&mut self, key: &str, on: Option<bool>) {
        match on {
            Some(value) => {
                self.features.insert(key.to_string(), value);
            }
            None => {
                self.features.remove(key);
            }
        }
    }

    /// Records the manual order for `namespace`. An empty list clears it, so the
    /// namespace falls back to the on-disk (filter) order.
    pub fn set_order(&mut self, namespace: &str, names: Vec<String>) {
        if names.is_empty() {
            self.order.remove(namespace);
        } else {
            self.order.insert(namespace.to_string(), names);
        }
    }

    /// Repoints every stored arrangement after a folder moved or was renamed;
    /// true when something changed. A `lists:<dir>` KEY is a root-relative
    /// path and moves with the dir; the `spaces` order holds bare leaves, so
    /// the old leaf becomes the new one (folder names are unique, spec 3.5).
    pub fn relocate_orders(&mut self, from_rel: &str, to_rel: &str) -> bool {
        if from_rel == to_rel {
            return false;
        }
        let from_leaf = crate::relpath::leaf_of(from_rel).to_string();
        let to_leaf = crate::relpath::leaf_of(to_rel).to_string();

        let mut changed = false;
        let rekeyed: Vec<(String, String)> = self
            .order
            .keys()
            .filter_map(|key| {
                let dir = key.strip_prefix("lists:")?;
                let rest = dir
                    .strip_prefix(from_rel)
                    .filter(|rest| rest.is_empty() || rest.starts_with('/'))?;
                Some((key.clone(), format!("lists:{to_rel}{rest}")))
            })
            .collect();
        for (old, new) in rekeyed {
            if let Some(value) = self.order.remove(&old) {
                self.order.insert(new, value);
                changed = true;
            }
        }

        if from_leaf != to_leaf {
            for names in self.order.values_mut() {
                for name in names.iter_mut() {
                    if *name == from_leaf {
                        *name = to_leaf.clone();
                        changed = true;
                    }
                }
            }
        }
        changed
    }

    /// Reads the config. A missing or unreadable file yields the defaults: a
    /// broken preference file must never stop someone opening their notebook.
    pub fn load(path: impl AsRef<Path>) -> Self {
        Self::from_doc(crate::jsondoc::load(path))
    }

    pub fn parse(text: &str) -> Self {
        Self::from_doc(crate::jsondoc::parse(text))
    }

    fn from_doc(raw: crate::jsondoc::Doc) -> Self {
        let schema_version = crate::jsondoc::schema_version(&raw, SUPPORTED_SCHEMA_VERSION);

        let rollover = raw
            .get("rollover")
            .and_then(Value::as_object)
            .map(parse_rollover)
            .unwrap_or_default();

        // Older notebooks still say it in `rollover.weekly.startsOn`.
        let week_starts_on = string(&raw, "weekStartsOn")
            .or_else(|| {
                raw.get("rollover")?
                    .get("weekly")?
                    .get("startsOn")?
                    .as_str()
                    .map(str::to_string)
            })
            .as_deref()
            .map(WeekStart::parse_or_default)
            .unwrap_or_default();

        let defaults = Self::default();
        // A file from before the mode/theme split has only `theme`, holding
        // one of the old three looks: read it as the mode it meant.
        let (mode, theme) = match (string(&raw, "mode"), string(&raw, "theme")) {
            (Some(mode), theme) => (mode, theme.unwrap_or_default()),
            (None, Some(theme)) => match crate::settings::split_legacy_theme(&theme) {
                (Some(mode), rest) => (mode.to_string(), rest.to_string()),
                (None, rest) => (String::new(), rest.to_string()),
            },
            (None, None) => (defaults.mode.clone(), defaults.theme.clone()),
        };
        Self {
            schema_version,
            rollover,
            week_starts_on,
            restore_last_screen: flag(&raw, "restoreLastScreen", defaults.restore_last_screen),
            show_list_counts: flag(&raw, "showListCounts", defaults.show_list_counts),
            dated_tasks_join_period: flag(
                &raw,
                "datedTasksJoinPeriod",
                defaults.dated_tasks_join_period,
            ),
            confirm_deletes: flag(&raw, "confirmDeletes", defaults.confirm_deletes),
            confirm_image_downloads: flag(
                &raw,
                "confirmImageDownloads",
                defaults.confirm_image_downloads,
            ),
            timeline_ghost_tasks: flag(&raw, "timelineGhostTasks", defaults.timeline_ghost_tasks),
            timeline_ghost_notes: flag(&raw, "timelineGhostNotes", defaults.timeline_ghost_notes),
            auto_urgent_by_date: flag(&raw, "autoUrgentByDate", defaults.auto_urgent_by_date),
            reminder_time: string(&raw, "reminderTime")
                .as_deref()
                .map(crate::reminders::ReminderTime::parse_or_default)
                .unwrap_or_default(),
            day_summary: flag(&raw, "daySummary", defaults.day_summary),
            day_summary_time: string(&raw, "daySummaryTime")
                .as_deref()
                .map(crate::reminders::ReminderTime::parse)
                .unwrap_or_default()
                .unwrap_or(defaults.day_summary_time),
            new_tasks_on_top: flag(&raw, "newTasksOnTop", defaults.new_tasks_on_top),
            auto_space_colors: flag(&raw, "autoSpaceColors", defaults.auto_space_colors),
            date_display_format: string(&raw, "dateDisplayFormat")
                .as_deref()
                .map(DateFormat::parse_or_default)
                .unwrap_or_default(),
            accent_color: string(&raw, "accentColor").unwrap_or(defaults.accent_color),
            mode,
            theme,
            heading_color: string(&raw, "headingColor").unwrap_or(defaults.heading_color),
            note_font_size: string(&raw, "noteFontSize").unwrap_or(defaults.note_font_size),
            interface_font: font(&raw, "interfaceFont", defaults.interface_font),
            note_font: font(&raw, "noteFont", defaults.note_font),
            mono_font: font(&raw, "monoFont", defaults.mono_font),
            format_bar: string(&raw, "formatBar").unwrap_or(defaults.format_bar),
            format_bar_side: string(&raw, "formatBarSide").unwrap_or(defaults.format_bar_side),
            close_inspector_on_click_away: flag(
                &raw,
                "closeInspectorOnClickAway",
                defaults.close_inspector_on_click_away,
            ),
            quick_note_folder: string(&raw, "quickNoteFolder")
                .unwrap_or(defaults.quick_note_folder),
            quick_task_list: string(&raw, "quickTaskList").unwrap_or(defaults.quick_task_list),
            tasks_show_all: flag(&raw, "tasksShowAll", defaults.tasks_show_all),
            offer_task_fields: flag(&raw, "offerTaskFields", defaults.offer_task_fields),
            note_layout: string(&raw, "noteLayout").unwrap_or(defaults.note_layout),
            table_layout: string(&raw, "tableLayout").unwrap_or(defaults.table_layout),
            card_height: string(&raw, "cardHeight").unwrap_or(defaults.card_height),
            age: parse_age(raw.get("age"), defaults.age),
            trash_retention_days: raw
                .get("trashRetentionDays")
                .and_then(Value::as_i64)
                .filter(|days| *days >= 0)
                .unwrap_or(defaults.trash_retention_days),
            completed_retention_days: raw
                .get("completedRetentionDays")
                .and_then(Value::as_i64)
                .filter(|days| *days >= 0)
                .unwrap_or(defaults.completed_retention_days),
            day_sort: string(&raw, "daySort").unwrap_or_default(),
            features: raw
                .get("features")
                .and_then(Value::as_object)
                .map(|obj| {
                    obj.iter()
                        // A value that is not a bool is not an answer; the
                        // default (on) is safer than guessing at it.
                        .filter_map(|(key, value)| Some((key.clone(), value.as_bool()?)))
                        .collect()
                })
                .unwrap_or_default(),
            // Kept whole: the core does not know what a command or a chord
            // is, and a binding it cannot read is one a newer build wrote.
            shortcuts: raw
                .get("shortcuts")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            spaces_sort: string(&raw, "spacesSort").unwrap_or_default(),
            order: raw
                .get("order")
                .and_then(Value::as_object)
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(key, value)| {
                            let names = value
                                .as_array()?
                                .iter()
                                .filter_map(|v| v.as_str().map(str::to_string))
                                .collect();
                            Some((key.clone(), names))
                        })
                        .collect()
                })
                .unwrap_or_default(),
            raw,
        }
    }

    /// Renders the document: the file as it was read, with the keys this
    /// build owns written over it.
    pub fn render(&self) -> String {
        let mut owned = crate::jsondoc::owned([
            ("schemaVersion", Value::from(self.schema_version)),
            ("rollover", render_rollover(&self.rollover)),
            ("weekStartsOn", Value::from(self.week_starts_on.render())),
            ("age", render_age(&self.age)),
            ("restoreLastScreen", Value::from(self.restore_last_screen)),
            ("showListCounts", Value::from(self.show_list_counts)),
            (
                "datedTasksJoinPeriod",
                Value::from(self.dated_tasks_join_period),
            ),
            ("confirmDeletes", Value::from(self.confirm_deletes)),
            (
                "confirmImageDownloads",
                Value::from(self.confirm_image_downloads),
            ),
            ("timelineGhostTasks", Value::from(self.timeline_ghost_tasks)),
            ("timelineGhostNotes", Value::from(self.timeline_ghost_notes)),
            ("autoUrgentByDate", Value::from(self.auto_urgent_by_date)),
            ("reminderTime", Value::from(self.reminder_time.render())),
            ("daySummary", Value::from(self.day_summary)),
            ("daySummaryTime", Value::from(self.day_summary_time.render())),
            ("newTasksOnTop", Value::from(self.new_tasks_on_top)),
            ("autoSpaceColors", Value::from(self.auto_space_colors)),
            (
                "dateDisplayFormat",
                Value::from(self.date_display_format.render()),
            ),
            (
                "closeInspectorOnClickAway",
                Value::from(self.close_inspector_on_click_away),
            ),
            ("quickNoteFolder", Value::from(self.quick_note_folder.clone())),
            ("quickTaskList", Value::from(self.quick_task_list.clone())),
            ("tasksShowAll", Value::from(self.tasks_show_all)),
            ("offerTaskFields", Value::from(self.offer_task_fields)),
            ("trashRetentionDays", Value::from(self.trash_retention_days)),
            (
                "completedRetentionDays",
                Value::from(self.completed_retention_days),
            ),
        ]);
        // Written only once the user has chosen something, so an untouched
        // notebook stays free of empty keys — and going back to the default
        // must REMOVE the key, or a stale one in `raw` survives the rewrite.
        let mut cleared: Vec<&str> = Vec::new();
        // A key this build no longer writes. It used to ring every dated task
        // without being asked; the day summary replaced it, and a leftover
        // value would say nothing to anyone.
        cleared.push("autoRemind");
        let put_or_clear = crate::jsondoc::put_or_clear;
        // Absent means the dragged order, the default.
        put_or_clear(
            &mut owned,
            &mut cleared,
            "spacesSort",
            (!self.spaces_sort.is_empty()).then(|| Value::from(self.spaces_sort.clone())),
        );
        // The by-name choices: absent means what the app ships as.
        for (key, value) in [
            ("accentColor", &self.accent_color),
            ("mode", &self.mode),
            ("theme", &self.theme),
            ("headingColor", &self.heading_color),
            ("noteFontSize", &self.note_font_size),
            ("interfaceFont", &self.interface_font),
            ("noteFont", &self.note_font),
            ("monoFont", &self.mono_font),
            ("formatBar", &self.format_bar),
            ("formatBarSide", &self.format_bar_side),
            ("noteLayout", &self.note_layout),
            ("tableLayout", &self.table_layout),
            ("cardHeight", &self.card_height),
            ("daySort", &self.day_sort),
        ] {
            put_or_clear(
                &mut owned,
                &mut cleared,
                key,
                (!value.is_empty()).then(|| Value::from(value.clone())),
            );
        }
        // The maps this build owns WHOLE are cleared first, content or not,
        // so the map that goes in is the map that comes out: merged into what
        // the file had, a REMOVAL (a feature back to default, an unbound
        // chord, a cleared order) cannot be expressed. See `jsondoc::render`.
        for (key, value) in [
            ("order", serde_json::to_value(&self.order).unwrap_or_default()),
            (
                "features",
                serde_json::to_value(&self.features).unwrap_or_default(),
            ),
            ("shortcuts", Value::Object(self.shortcuts.clone())),
        ] {
            cleared.push(key);
            let has_content = value.as_object().is_some_and(|o| !o.is_empty());
            if has_content {
                owned.insert(key.to_string(), value);
            }
        }
        crate::jsondoc::render(&self.raw, owned, &cleared)
    }

    /// Writes the config atomically. Refuses when the notebook is read-only.
    pub fn save(&self, path: impl AsRef<Path>) -> Result<()> {
        crate::error::guard_schema(self.schema_version, SUPPORTED_SCHEMA_VERSION)?;
        crate::fsio::write_atomically(path.as_ref(), self.render().as_bytes())
    }
}

fn parse_rollover(block: &Map<String, Value>) -> Rollover {
    let daily = block.get("daily").and_then(Value::as_object);

    Rollover {
        daily: DailyRollover {
            mode: read_mode(daily),
        },
    }
}

fn read_mode(block: Option<&Map<String, Value>>) -> RolloverMode {
    block
        .and_then(|b| b.get("mode"))
        .and_then(Value::as_str)
        .map(RolloverMode::parse_or_default)
        .unwrap_or_default()
}

/// Reads the `age` object, one key at a time: a number that makes no sense
/// (missing, a string, negative) reads as the default; unknown keys round-trip.
fn parse_age(raw: Option<&Value>, defaults: crate::age::Thresholds) -> crate::age::Thresholds {
    let Some(obj) = raw.and_then(Value::as_object) else {
        return defaults;
    };
    let days = |key: &str, fallback: i64| {
        obj.get(key)
            .and_then(Value::as_i64)
            .filter(|days| *days >= 0)
            .unwrap_or(fallback)
    };
    crate::age::Thresholds {
        fresh: days("fresh", defaults.fresh),
        stale: days("stale", defaults.stale),
        inbox_stale: days("inboxStale", defaults.inbox_stale),
    }
}

fn render_age(age: &crate::age::Thresholds) -> Value {
    Value::Object(Map::from_iter([
        ("fresh".to_string(), Value::from(age.fresh)),
        ("stale".to_string(), Value::from(age.stale)),
        ("inboxStale".to_string(), Value::from(age.inbox_stale)),
    ]))
}

fn render_rollover(rollover: &Rollover) -> Value {
    let daily = Map::from_iter([
        ("mode".to_string(), Value::from(rollover.daily.mode.render())),
    ]);
    Value::Object(Map::from_iter([("daily".to_string(), Value::Object(daily))]))
}

/// Sorts `items` in place by a manual order: ranked items first, in rank
/// order, the unranked after them in the order they had. The one comparator
/// under every hand-dragged arrangement.
pub fn by_rank<T>(items: &mut [T], rank: impl Fn(&T) -> Option<usize>) {
    items.sort_by(|a, b| match (rank(a), rank(b)) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        // Leave the rest as the caller sorted them (sort_by is stable).
        (None, None) => std::cmp::Ordering::Equal,
    });
}

// The tolerant readers are shared by every config file (`jsondoc`).
use crate::jsondoc::{flag, string};

/// A font family name, read the tolerant way: absent, blank, or not writable
/// into CSS all fall back to the default (the app's own face).
fn font(raw: &crate::jsondoc::Doc, key: &str, default: String) -> String {
    string(raw, key)
        .filter(|name| crate::fonts::is_safe_family(name))
        .unwrap_or(default)
}
