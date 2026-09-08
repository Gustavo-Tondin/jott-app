//! The notebook's `.jott/config.json`.
//!
//! Holds the preferences that belong to the *notebook* and therefore travel
//! with it when it syncs. Machine preferences (last window, last notebook
//! opened) live in the OS config folder instead, and never here.
//!
//! Reading is deliberately forgiving (spec 3.4): a missing key takes the
//! default, a malformed value takes the default, and an unreadable file is
//! recreated. What is never forgiven is *losing* data — an unknown key
//! written by another version of the app survives a rewrite untouched.

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
    /// Empty the state; unfinished tasks go back to being suggestions.
    ///
    /// The default, because the day and the week are an active choice of what
    /// to do in that period — not a queue that piles up on its own.
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

/// Rollover preferences for the day. Until 2026-09-04 there was an `at` —
/// the hour the day turned, as a signed offset from midnight. It went with
/// the calendar on the Home (user call): the next day is planned on its own
/// page, so the day is the calendar's day, and a knob nobody could set
/// right (the author typed `21:00` and got yesterday until the evening)
/// had nothing left to buy. An `at` a notebook still carries is an unknown
/// key now, read by nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DailyRollover {
    pub mode: RolloverMode,
}

/// The turn of the day. Until 2026-09-04 a `weekly` half sat beside it; the
/// week stopped being a period when the Home's calendar let any day ahead
/// be planned, and a `rollover.weekly` a notebook still carries is an
/// unknown key now — it round-trips, and nothing reads it but the fallback
/// for `weekStartsOn`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Rollover {
    pub daily: DailyRollover,
}

/// How a date is shown. The file always stores ISO; this is display only.
///
/// A closed set rather than a free pattern, for the same reason the repeat
/// field is a select: a value the app cannot parse would have to fall back
/// silently, and a date shown wrong is worse than a date shown plainly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DateFormat {
    /// `07/25/2026` — the default since 2026-08-06 (user call).
    #[default]
    MonthDayYear,
    /// `25/07/2026`
    DayMonthYear,
    /// `2026/07/25` — ISO order, drawn with the same separator as the rest.
    YearMonthDay,
}

impl DateFormat {
    /// The shapes on offer all use `/` (user call, 2026-08-06): mixing `-`
    /// and `/` in the same picker read as two unrelated settings. The hyphen
    /// spellings a notebook may already carry still parse, so nobody's config
    /// silently changes meaning — they just land on the matching slash shape.
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
    /// Which weekday the Home's calendar strip starts on. A DISPLAY choice
    /// that travels with the notebook because it always did: it was
    /// `rollover.weekly.startsOn` while the week was a period, and that key
    /// is still read when this one is absent.
    pub week_starts_on: WeekStart,
    /// Reopen on the screen the user left, instead of always landing on Today.
    ///
    /// Off by default: landing somewhere temporally relevant is the more
    /// predictable behaviour, and this is the kind of thing people want only
    /// once they have a habit. The *preference* lives here so it applies on
    /// every machine; the screen it points at is machine-specific and lives in
    /// the OS config folder.
    pub restore_last_screen: bool,
    /// Show how many open tasks each list has, in the navigation.
    pub show_list_counts: bool,
    /// A task with a date shows up in the Day (and in the Week) on its own,
    /// without being pulled by hand.
    ///
    /// On by default (2026-08-14). Until then Day and Week were 100% manual,
    /// and a date only changed the ORDER of the suggestions — which meant a
    /// task written for today sat in a list until the user went looking for
    /// it, and the app quietly failed at the one thing a date is for.
    ///
    /// This never writes to the state: a dated task is added when the period
    /// is READ, so nothing has to be cleaned up when the day turns, un-dating
    /// a task takes it straight back out, and a task pulled by hand keeps
    /// being pulled by hand.
    pub dated_tasks_join_period: bool,
    /// Ask before deleting. On by default, and turned off from the dialog
    /// itself ("don't ask again", 2026-08-19).
    ///
    /// Honest to offer only because nothing in this app is destroyed: a
    /// deleted note, list, space or file goes to `.jott/trash/` and comes
    /// back. Someone who has understood that is entitled to stop being asked.
    pub confirm_deletes: bool,
    /// Ask before the app fetches an image from the internet.
    ///
    /// Pasting a picture copied from a web page hands the app a `https://`
    /// address and nothing else, so drawing it means DOWNLOADING it — the one
    /// thing this app does that reaches outside the machine. On by default,
    /// and the dialog it controls says which host is being contacted
    /// (principle 9: every external connection is explained). Turning it off
    /// is the user saying they have understood and would rather not be asked
    /// again.
    pub confirm_image_downloads: bool,
    /// Whether the Timeline names what was deleted. Off by default
    /// (2026-08-27): a thing thrown away may have been thrown away for
    /// privacy, so a ghost reads as "deleted task" in its space's colour
    /// and nothing more. The log keeps the birth title either way — this
    /// is what the SCREEN says, and "Remove from timeline" is the door for
    /// someone who wants the line itself gone.
    pub timeline_ghost_tasks: bool,
    /// The same, for deleted notes.
    pub timeline_ghost_notes: bool,
    /// Treat a task due today or overdue as urgent, without being told.
    ///
    /// On by default, but switchable: some people find an interface that
    /// paints deadlines red on its own more stressful than useful. The
    /// `#urgent` tag written by hand always counts, either way.
    pub auto_urgent_by_date: bool,
    /// Ring for every dated task without being asked (`off` / `dayOf` /
    /// `dayBefore` / `both`), at `reminder_time`. Computed, never written into the
    /// task — see `reminders`.
    pub auto_remind: crate::reminders::AutoRemind,
    /// `HH:MM`: when the automatic reminder rings, and the hour the
    /// inspector's presets land on.
    pub reminder_time: crate::reminders::ReminderTime,
    /// Where a new task lands in its list: above the first task (`true`, the
    /// default) or below the last (`false`). A quick capture wants to see
    /// what it just wrote; a plan written in order wants the order kept. The
    /// file decides nothing here: `List::add_first` keeps whatever sits
    /// above the checklist above it.
    pub new_tasks_on_top: bool,
    /// The sidebar's rainbow (2026-08-24): every top-level entry takes the
    /// next of the seven, in sidebar order, starting from the accent — the
    /// fixed spaces wear the accent, the first list the colour after it, and
    /// so on around. It IGNORES the colour a space chose: it is a look for
    /// the whole column, not a default for the gaps. A Display choice — this
    /// value is the notebook's recoil for a machine that never answered
    /// (`settings::Display::resolve`), like `theme` and `accent_color`.
    pub auto_space_colors: bool,
    /// How dates are shown. The file always stores ISO.
    pub date_display_format: DateFormat,
    /// Which of the app's eight colours is the accent — the
    /// colour of the open sidebar row, the primary button, a focus ring
    /// (2026-08-13). A NAME (`"orange"`), never a hex: each of the eight has a
    /// light half and a dark half, and which one is shown depends on the
    /// ground it lands on, which only the interface knows.
    ///
    /// The core does not police the value. It is a look, the list of names is
    /// a product decision that lives with the interface (like `features`), and
    /// a notebook written by a newer build must round-trip a name this one has
    /// never heard of instead of silently resetting it. Empty means "whatever
    /// the app ships as".
    pub accent_color: String,
    /// Which MODE is on — `jott`, `light`, `dark` (2026-08-26; until then
    /// the three were the `theme`). Same covenant as `accent_color`: a NAME,
    /// not policed here. Empty means the one the app ships as. A file with
    /// no `mode` and a `theme` of the old three reads that as the mode
    /// (`settings::split_legacy_theme`) — tolerance, not migration.
    pub mode: String,
    /// Which THEME — the palette, `.jott/themes/<name>` — is on (2026-08-13,
    /// re-cut 2026-08-26). Same covenant as `accent_color` in every respect:
    /// a NAME, never colours; not policed here, because the list of themes is
    /// the notebook's and a notebook written by a newer build must keep a
    /// theme this one cannot draw. Empty means the one the app ships as.
    pub theme: String,
    /// Whether headings (H1–H6, and the titles that share their scale) are
    /// drawn in the accent or in plain ink (2026-08-17). `"ink"` turns the
    /// colour off; anything else, including empty, means the accent — which is
    /// what the app ships as, because a note titled in the colour of the place
    /// it lives in is what the interface looks like.
    ///
    /// Same covenant as `accent_color` and `theme`: a NAME, never a colour,
    /// not policed here. It is a look, and the answers belong to the
    /// interface.
    pub heading_color: String,
    /// How big the body of a note is drawn — `small`, `medium`, `large`
    /// (2026-08-18).
    ///
    /// Same covenant as the three above: a NAME, never a measurement, and not
    /// policed here. It travels WITH the notebook, unlike the interface's
    /// zoom, which is a machine preference: this one is reading taste and
    /// should follow the writer to another screen, while zoom answers to a
    /// monitor. Empty means the size the app ships as.
    pub note_font_size: String,
    /// The three faces the app can be read in (2026-08-24): the interface,
    /// the body of a note, and the monospace of code and paths.
    ///
    /// A family NAME, exactly as the machine spells it, or empty for what the
    /// app ships with — Inter for the first two and DM Mono for the third,
    /// both carried inside the app. Not policed here beyond the name being
    /// writable into CSS (`fonts::is_safe_family`): which fonts exist is a
    /// fact about a MACHINE, and a notebook carried to another one must not
    /// lose the answer just because that machine has a different library.
    /// The interface's face is the note's default too, so a notebook that
    /// chose only the first reads its notes in it.
    pub interface_font: String,
    pub note_font: String,
    pub mono_font: String,
    /// When the note's floating formatting bar is drawn — `always`,
    /// `selection` (only while something is selected), `off` (2026-08-21).
    ///
    /// It says nothing about the DOCKED panel, which is what the right side
    /// is for: turning the floating bar off leaves the controls exactly where
    /// the panel puts them. Empty means `always`, which is what the app ships
    /// as.
    ///
    /// Same covenant as the looks above: a NAME, never behaviour spelled out,
    /// and not policed here — the list of modes is the interface's.
    pub format_bar: String,
    /// Which SIDE of the canvas the floating bar hugs — `top`, `left`,
    /// `right`, `bottom` (2026-08-21). It is always centred on that side;
    /// what the user picks is the edge, not a corner.
    ///
    /// Empty means `top`, where the bar has always been. Same covenant: a
    /// name, unpoliced.
    pub format_bar_side: String,
    /// The user's own keyboard bindings, as `command id → chord`
    /// (2026-08-18).
    ///
    /// Opaque to the core, deliberately: which commands exist and what a
    /// chord is spelled like are the interface's business, and a notebook
    /// written by a newer build carries bindings this one has never heard of.
    /// It keeps them and hands them back untouched — the frontend ignores what
    /// it cannot honour (`services/commands.js`).
    ///
    /// A binding travels WITH the notebook, unlike the window widths and the
    /// zoom: a chord answers to a pair of hands, and those move between
    /// machines. It is the same choice Obsidian makes (hotkeys live in the
    /// vault).
    pub shortcuts: Map<String, Value>,
    /// Close the task panel when clicking outside it.
    ///
    /// Off by default, and that default is a decision: it shipped on, fired
    /// too easily, and losing a half-typed task cost more than the shortcut
    /// was worth (2026-07-21). Kept as an option because the gesture is
    /// muscle memory for some people.
    pub close_inspector_on_click_away: bool,
    /// Where the Home's quick capture writes, relative to the notes space.
    pub quick_note_folder: String,
    /// Where the Home's quick capture writes a TASK: empty is the fixed
    /// space's Inbox; a list's name is a list of the fixed space; a
    /// root-relative path is a user task space (its main list). The same
    /// path-like contract `quick_note_folder` keeps (2026-08-24).
    pub quick_task_list: String,
    /// Whether the fixed Tasks screen shows every list of the notebook
    /// pulled together and arranged by space (2026-09-04), instead of the
    /// Inbox alone, which is the default.
    pub tasks_show_all: bool,
    /// Whether the task panel offers the task fields that are switched off
    /// (a card that opens Settings › Tasks). Closing that card once turns
    /// this off; the Settings row turns it back on.
    pub offer_task_fields: bool,
    /// How a notes space draws its board when it has not chosen for itself
    /// (`grid` / `tree`). Empty means what the app ships as, which is the
    /// grid; the frontend owns that default, as it owns the list of layouts,
    /// so a name from a newer build round-trips unjudged. A space that did
    /// choose keeps its own `noteLayout` in its `.space.json` and ignores
    /// this one.
    pub note_layout: String,
    /// How a table in a note sits in the column (2026-08-24): empty is the
    /// app's own — squeezed to the content width, cells wrapping — and
    /// `scroll` lets it run wide and scroll sideways. Same pact as the board
    /// layout: the interface owns the list, an unknown name round-trips.
    pub table_layout: String,
    /// Where "fresh", "stale" and "forgotten" begin, in days
    /// (`crate::age`, spec 3.6). A notebook preference and not a machine
    /// one: how long something may sit before it counts as forgotten is a
    /// judgement about the person's own work, and it travels with the
    /// notebook.
    pub age: crate::age::Thresholds,
    /// How many days a trashed item waits in `.jott/trash/` before the reaper
    /// clears it for good (reestruturação 2026-07-30).
    pub trash_retention_days: i64,
    /// How many days a completed task stays in its folder's `Completed.md`
    /// before the reaper files it away (2026-08-06). It is not destroyed: it
    /// goes to `.jott/trash/`, where `trash_retention_days` then applies.
    /// `0` means never — the Completed keeps growing, which is a valid choice.
    pub completed_retention_days: i64,
    /// Manual ordering the user set by dragging, keyed by a namespace string
    /// (`"spaces"`, `"lists:<folder>"`, …) → the item names in order. It
    /// lives here, not in the files, because on disk items sort by whatever the
    /// user's filter chooses; a hand-arranged order is an app preference.
    /// Reusable: [`Config::apply_order`] applies any namespace to any list.
    pub order: BTreeMap<String, Vec<String>>,
    /// How the day is arranged (`name` / `created` / `completed`) — every
    /// day, today and the ones planned ahead alike. A day has no
    /// `.space.json` to keep its own preference in — it is not a folder — so
    /// its arrangement lives with the notebook, next to the manual `order`
    /// (2026-08-06). Empty means the order the tasks were pulled in, which
    /// is the state file's own order.
    pub day_sort: String,
    /// Which parts of the app the user has an OPINION about (`tasks`, `notes`,
    /// and the task fields under them — 2026-08-06, princípio 3 / backlog I6).
    ///
    /// **Absent means "the default", and the core does not know what that is.**
    /// It cannot: the defaults are a product decision that differs per feature
    /// (Week, Remind me, Description and Add files start off), and duplicating
    /// that table in Rust and in JS would be two tables to keep in step. So
    /// this map holds only what was deliberately changed, and
    /// `src/lib/services/features.js` owns the defaults — one list, which is
    /// also the one the settings screen draws itself from.
    pub features: BTreeMap<String, bool>,
    /// How the sidebar arranges the user's spaces and groups: `name` for
    /// alphabetical, anything else (the default) for the hand-dragged `order`
    /// (2026-08-06).
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
            auto_remind: Default::default(),
            reminder_time: Default::default(),
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

    /// True when the file came from a newer app than this one.
    ///
    /// Spec 3.4: open read-only rather than risk corrupting a file written by
    /// a version that knows fields we do not.
    pub fn is_read_only(&self) -> bool {
        self.schema_version > SUPPORTED_SCHEMA_VERSION
    }

    /// Reorders `items` in place by the manual order stored under `namespace`:
    /// named items come first in the stored order, and everything else keeps
    /// its current relative order, after them. A no-op when nothing is stored
    /// for the namespace, so new items and untracked lists behave as before.
    ///
    /// One helper for every draggable list — spaces, a folder's lists, and
    /// whatever comes next — so the "manual order in the config" rule lives in
    /// exactly one place.
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

    /// Repoints every stored arrangement after a folder moved or was renamed.
    /// Returns true when something changed.
    ///
    /// The arrangements are addressed by folder, in two different shapes, and
    /// both go stale on a rename — silently, which is the worst kind: the
    /// space simply falls to the end of a hand-dragged column and nobody
    /// can see why. So:
    ///
    /// - the `lists:<dir>` namespace KEY carries a root-relative path, and any
    ///   key under the moved dir moves with it;
    /// - the sidebar's `spaces` order holds bare folder names, so an entry
    ///   equal to the old leaf becomes the new one. Safe to do across every
    ///   namespace because a folder name is unique in the notebook (spec 3.5).
    ///
    /// It matters most for a GROUP rename, where the group's own leaf changes
    /// and every `lists:` key beneath it changes with it.
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

    /// Reads the config. A missing or unreadable file yields the defaults —
    /// same treatment a missing `task-list.md` gets, and for the same reason: a broken
    /// preference file must never stop someone from opening their notebook.
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

        // The week's first day moved out of `rollover.weekly` on 2026-09-04;
        // a notebook written before that still says it there.
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
        // `mode` and `theme` (2026-08-26): a file written before the split
        // has only `theme`, holding one of the old three looks — read as
        // the mode it meant, leaving the palette as the app's own.
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
            auto_remind: string(&raw, "autoRemind")
                .as_deref()
                .map(crate::reminders::AutoRemind::parse_or_default)
                .unwrap_or_default(),
            reminder_time: string(&raw, "reminderTime")
                .as_deref()
                .map(crate::reminders::ReminderTime::parse_or_default)
                .unwrap_or_default(),
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
            // Kept whole, values and all: the core does not know what a
            // command is or what a chord looks like, and a binding it cannot
            // read is one a newer build wrote.
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
            ("autoRemind", Value::from(self.auto_remind.render())),
            ("reminderTime", Value::from(self.reminder_time.render())),
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
        // Everything below is written only once the user has chosen or
        // arranged something, so an untouched notebook stays free of empty
        // keys — and going back to the default has to *remove* the key, or a
        // stale one in `raw` survives the rewrite. One rule, three shapes of
        // "nothing to say": the empty sort, the empty name, the empty map.
        let mut cleared: Vec<&str> = Vec::new();
        let put_or_clear = crate::jsondoc::put_or_clear;
        // The sidebar's arrangement: absent means the dragged order, which is
        // the default, so an untouched notebook says nothing about it.
        put_or_clear(
            &mut owned,
            &mut cleared,
            "spacesSort",
            (!self.spaces_sort.is_empty()).then(|| Value::from(self.spaces_sort.clone())),
        );
        // The accent, the theme and the rest of the by-name choices, same
        // rule: absent means what the app ships as, so a notebook that never
        // had one chosen says nothing about it.
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
            ("daySort", &self.day_sort),
        ] {
            put_or_clear(
                &mut owned,
                &mut cleared,
                key,
                (!value.is_empty()).then(|| Value::from(value.clone())),
            );
        }
        // The three maps this build owns WHOLE — and each of them is cleared
        // first, whether or not it has content, so the map that goes in is the
        // map that comes out. Merged into what the file had, a REMOVAL cannot
        // be expressed: taking a feature back to its default removes it from
        // `features`, the merge put the shorter map over the longer one, and
        // the file kept the old answer — so a switch could be turned off and
        // never on again (user report on device, 2026-08-20; the same silence
        // swallowed an unbound chord and a cleared order). `jsondoc::render`
        // says why the merge is deep, and why clearing runs before it.
        //
        // Nothing inside one is lost by it: each of these round-trips through
        // its own typed map, so a key this build has never heard of comes back
        // out the way it went in.
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

/// Reads the `age` object, one key at a time. Same pact as every other
/// value in this file: a number that makes no sense (missing, a string, a
/// negative day count) reads as the app's default, and any key this build
/// does not know round-trips untouched through `raw`.
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
/// order, and everything unranked after them in the order it already had.
///
/// The comparator under every hand-dragged arrangement — the sidebar's
/// spaces, a folder's lists, a period's references — so the rule "mentioned
/// first, the rest untouched" is written once.
pub fn by_rank<T>(items: &mut [T], rank: impl Fn(&T) -> Option<usize>) {
    items.sort_by(|a, b| match (rank(a), rank(b)) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        // Leave the rest as the caller sorted them (sort_by is stable).
        (None, None) => std::cmp::Ordering::Equal,
    });
}

/// The tolerant readers moved to [`crate::jsondoc`], where every config file
/// shares them — including the deep merge that keeps an unknown key alive.
use crate::jsondoc::{flag, string};

/// A font family name, read the tolerant way: absent, blank, or a name that
/// could not be written into CSS all fall back to the default, which is the
/// app's own face. The same pact as every other value here — a bad one is not
/// an error, it is the app's answer (2026-08-24).
fn font(raw: &crate::jsondoc::Doc, key: &str, default: String) -> String {
    string(raw, key)
        .filter(|name| crate::fonts::is_safe_family(name))
        .unwrap_or(default)
}
