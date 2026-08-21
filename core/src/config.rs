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

use crate::clock::{TurnOffset, WeekStart};
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

/// Rollover preferences for the day.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DailyRollover {
    pub mode: RolloverMode,
    pub at: TurnOffset,
}

/// Rollover preferences for the week. Independent from the day, on purpose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct WeeklyRollover {
    pub mode: RolloverMode,
    pub at: TurnOffset,
    pub starts_on: WeekStart,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Rollover {
    pub daily: DailyRollover,
    pub weekly: WeeklyRollover,
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
    /// Treat a task due today or overdue as urgent, without being told.
    ///
    /// On by default, but switchable: some people find an interface that
    /// paints deadlines red on its own more stressful than useful. The
    /// `#urgent` tag written by hand always counts, either way.
    pub auto_urgent_by_date: bool,
    /// Where a new task lands in its list: above the first task (`true`) or
    /// below the last (`false`, the default — what every list did until
    /// 2026-08-21). A quick capture wants to see what it just wrote; a plan
    /// written in order wants the order kept. The file decides nothing here:
    /// `List::add_first` keeps whatever sits above the checklist above it.
    pub new_tasks_on_top: bool,
    /// How dates are shown. The file always stores ISO.
    pub date_display_format: DateFormat,
    /// Which of the app's seven complementary colours is the accent — the
    /// colour of the open sidebar row, the primary button, a focus ring
    /// (2026-08-13). A NAME (`"orange"`), never a hex: each of the seven has a
    /// light half and a dark half, and which one is shown depends on the
    /// ground it lands on, which only the interface knows.
    ///
    /// The core does not police the value. It is a look, the list of names is
    /// a product decision that lives with the interface (like `features`), and
    /// a notebook written by a newer build must round-trip a name this one has
    /// never heard of instead of silently resetting it. Empty means "whatever
    /// the app ships as".
    pub accent_color: String,
    /// Which theme is on — `default`, `light`, `dark` (2026-08-13). Same
    /// covenant as `accent_color` in every respect: a NAME, never colours; not
    /// policed here, because the list of themes is the interface's and a
    /// notebook written by a newer build must keep a theme this one cannot
    /// draw. Empty means the one the app ships as.
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
    /// How a notes space draws its board when it has not chosen for itself
    /// (`grid` / `tree`). Empty means what the app ships as, which is the
    /// grid; the frontend owns that default, as it owns the list of layouts,
    /// so a name from a newer build round-trips unjudged. A space that did
    /// choose keeps its own `noteLayout` in its `.space.json` and ignores
    /// this one.
    pub note_layout: String,
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
    /// How the Day and the Week are arranged (`"day"`/`"week"` → `name` /
    /// `created` / `completed`). A period has no `.space.json` to keep its
    /// own preference in — it is not a folder — so its arrangement lives with
    /// the notebook, next to the manual `order` (2026-08-06). Absent means the
    /// order the tasks were pulled in, which is the state file's own order.
    pub period_sort: BTreeMap<String, String>,
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
            restore_last_screen: false,
            show_list_counts: true,
            dated_tasks_join_period: true,
            confirm_deletes: true,
            confirm_image_downloads: true,
            auto_urgent_by_date: true,
            new_tasks_on_top: false,
            date_display_format: DateFormat::default(),
            accent_color: String::new(),
            theme: String::new(),
            heading_color: String::new(),
            note_font_size: String::new(),
            format_bar: String::new(),
            format_bar_side: String::new(),
            shortcuts: Map::new(),
            close_inspector_on_click_away: false,
            quick_note_folder: crate::notefolder::NOTES_INBOX.to_string(),
            note_layout: String::new(),
            trash_retention_days: 30,
            completed_retention_days: 30,
            order: BTreeMap::new(),
            period_sort: BTreeMap::new(),
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

        let defaults = Self::default();
        Self {
            schema_version,
            rollover,
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
            auto_urgent_by_date: flag(&raw, "autoUrgentByDate", defaults.auto_urgent_by_date),
            new_tasks_on_top: flag(&raw, "newTasksOnTop", defaults.new_tasks_on_top),
            date_display_format: string(&raw, "dateDisplayFormat")
                .as_deref()
                .map(DateFormat::parse_or_default)
                .unwrap_or_default(),
            accent_color: string(&raw, "accentColor").unwrap_or(defaults.accent_color),
            theme: string(&raw, "theme").unwrap_or(defaults.theme),
            heading_color: string(&raw, "headingColor").unwrap_or(defaults.heading_color),
            note_font_size: string(&raw, "noteFontSize").unwrap_or(defaults.note_font_size),
            format_bar: string(&raw, "formatBar").unwrap_or(defaults.format_bar),
            format_bar_side: string(&raw, "formatBarSide").unwrap_or(defaults.format_bar_side),
            close_inspector_on_click_away: flag(
                &raw,
                "closeInspectorOnClickAway",
                defaults.close_inspector_on_click_away,
            ),
            quick_note_folder: string(&raw, "quickNoteFolder")
                .unwrap_or(defaults.quick_note_folder),
            note_layout: string(&raw, "noteLayout").unwrap_or(defaults.note_layout),
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
            period_sort: raw
                .get("periodSort")
                .and_then(Value::as_object)
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(key, value)| {
                            Some((key.clone(), value.as_str()?.to_string()))
                        })
                        .collect()
                })
                .unwrap_or_default(),
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
            ("autoUrgentByDate", Value::from(self.auto_urgent_by_date)),
            ("newTasksOnTop", Value::from(self.new_tasks_on_top)),
            (
                "dateDisplayFormat",
                Value::from(self.date_display_format.render()),
            ),
            (
                "closeInspectorOnClickAway",
                Value::from(self.close_inspector_on_click_away),
            ),
            ("quickNoteFolder", Value::from(self.quick_note_folder.clone())),
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
            ("theme", &self.theme),
            ("headingColor", &self.heading_color),
            ("noteFontSize", &self.note_font_size),
            ("formatBar", &self.format_bar),
            ("formatBarSide", &self.format_bar_side),
            ("noteLayout", &self.note_layout),
        ] {
            put_or_clear(
                &mut owned,
                &mut cleared,
                key,
                (!value.is_empty()).then(|| Value::from(value.clone())),
            );
        }
        // The four maps this build owns WHOLE — and each of them is cleared
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
            (
                "periodSort",
                serde_json::to_value(&self.period_sort).unwrap_or_default(),
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
    let weekly = block.get("weekly").and_then(Value::as_object);

    Rollover {
        daily: DailyRollover {
            mode: read_mode(daily),
            at: read_at(daily),
        },
        weekly: WeeklyRollover {
            mode: read_mode(weekly),
            at: read_at(weekly),
            starts_on: weekly
                .and_then(|w| w.get("startsOn"))
                .and_then(Value::as_str)
                .map(WeekStart::parse_or_default)
                .unwrap_or_default(),
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

fn read_at(block: Option<&Map<String, Value>>) -> TurnOffset {
    block
        .and_then(|b| b.get("at"))
        .and_then(Value::as_str)
        .map(TurnOffset::parse_or_default)
        .unwrap_or_default()
}

fn render_rollover(rollover: &Rollover) -> Value {
    let daily = Map::from_iter([
        ("mode".to_string(), Value::from(rollover.daily.mode.render())),
        ("at".to_string(), Value::from(rollover.daily.at.render())),
    ]);
    let weekly = Map::from_iter([
        (
            "mode".to_string(),
            Value::from(rollover.weekly.mode.render()),
        ),
        ("at".to_string(), Value::from(rollover.weekly.at.render())),
        (
            "startsOn".to_string(),
            Value::from(rollover.weekly.starts_on.render()),
        ),
    ]);

    Value::Object(Map::from_iter([
        ("daily".to_string(), Value::Object(daily)),
        ("weekly".to_string(), Value::Object(weekly)),
    ]))
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

/// Sorted view of a JSON object, for stable assertions in tests.
#[cfg(test)]
fn keys_of(text: &str) -> std::collections::BTreeMap<String, Value> {
    let Ok(Value::Object(map)) = serde_json::from_str::<Value>(text) else {
        panic!("not a json object: {text}");
    };
    map.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::Error;

    #[test]
    fn the_new_toggles_round_trip_and_tolerate_garbage() {
        let mut config = Config::default();
        assert!(!config.restore_last_screen, "off by default");
        assert!(config.show_list_counts, "on by default");

        config.restore_last_screen = true;
        config.show_list_counts = false;
        let reparsed = Config::parse(&config.render());
        assert!(reparsed.restore_last_screen);
        assert!(!reparsed.show_list_counts);

        // Wrong type falls back to the default instead of failing to open.
        let broken = Config::parse(
            r#"{ "schemaVersion": 1, "restoreLastScreen": "yes", "showListCounts": 3 }"#,
        );
        assert!(!broken.restore_last_screen);
        assert!(broken.show_list_counts);
    }

    #[test]
    fn defaults_match_the_spec() {
        let config = Config::default();
        assert_eq!(config.schema_version(), 1);
        assert!(!config.restore_last_screen);
        assert!(config.show_list_counts);
        assert!(!config.new_tasks_on_top);
        assert_eq!(config.rollover.daily.mode, RolloverMode::Reset);
        assert_eq!(config.rollover.daily.at, TurnOffset::MIDNIGHT);
        assert_eq!(config.rollover.weekly.mode, RolloverMode::Reset);
        assert_eq!(config.rollover.weekly.starts_on, WeekStart::Monday);
        assert!(!config.is_read_only());
    }

    #[test]
    fn reads_the_documented_example() {
        let config = Config::parse(
            r#"{
              "schemaVersion": 1,
              "rollover": {
                "daily":  { "mode": "carry", "at": "-02:00" },
                "weekly": { "mode": "reset", "at": "02:00", "startsOn": "sunday" }
              }
            }"#,
        );

        assert_eq!(config.rollover.daily.mode, RolloverMode::Carry);
        assert_eq!(config.rollover.daily.at, TurnOffset::from_minutes(-120));
        assert_eq!(config.rollover.weekly.at, TurnOffset::from_minutes(120));
        assert_eq!(config.rollover.weekly.starts_on, WeekStart::Sunday);
    }

    #[test]
    fn missing_keys_take_the_defaults() {
        let config = Config::parse(r#"{ "schemaVersion": 1 }"#);
        assert_eq!(config.rollover, Rollover::default());
    }

    #[test]
    fn malformed_values_take_the_defaults_without_erroring() {
        let config = Config::parse(
            r#"{
              "schemaVersion": 1,
              "rollover": {
                "daily": { "mode": "banana", "at": "25:99" },
                "weekly": { "startsOn": 42 }
              }
            }"#,
        );
        assert_eq!(config.rollover, Rollover::default());
    }

    #[test]
    fn garbage_file_falls_back_to_defaults() {
        for text in ["", "not json", "[]", "null", "{"] {
            let config = Config::parse(text);
            assert_eq!(config.rollover, Rollover::default(), "{text:?}");
        }
    }

    #[test]
    fn unknown_top_level_keys_survive_a_rewrite() {
        // The scenario this protects: the notebook is synced between two app
        // versions, and the older one must not delete the newer one's data.
        let config = Config::parse(
            r#"{ "schemaVersion": 1, "futureFeature": { "deep": [1, 2] } }"#,
        );
        let written = keys_of(&config.render());

        assert_eq!(
            written.get("futureFeature").unwrap(),
            &serde_json::json!({ "deep": [1, 2] })
        );
    }

    #[test]
    fn unknown_keys_nested_inside_rollover_also_survive() {
        let config = Config::parse(
            r#"{
              "schemaVersion": 1,
              "rollover": {
                "daily": { "mode": "carry", "unknownKnob": true },
                "monthly": { "mode": "reset" }
              }
            }"#,
        );
        let written = keys_of(&config.render());
        let rollover = written.get("rollover").unwrap();

        assert_eq!(rollover["daily"]["unknownKnob"], serde_json::json!(true));
        assert_eq!(rollover["daily"]["mode"], serde_json::json!("carry"));
        assert_eq!(rollover["monthly"]["mode"], serde_json::json!("reset"));
    }

    #[test]
    fn render_round_trips() {
        let mut config = Config::default();
        config.rollover.daily.mode = RolloverMode::Carry;
        config.rollover.daily.at = TurnOffset::from_minutes(-120);
        config.rollover.weekly.starts_on = WeekStart::Sunday;

        let reparsed = Config::parse(&config.render());
        assert_eq!(reparsed.rollover, config.rollover);
        assert_eq!(reparsed.schema_version(), config.schema_version());
    }

    #[test]
    fn a_newer_schema_version_opens_read_only() {
        let config = Config::parse(r#"{ "schemaVersion": 99 }"#);
        assert!(config.is_read_only());

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let err = config.save(&path).unwrap_err();

        assert!(matches!(err, Error::ReadOnlyNotebook { found: 99, .. }));
        assert!(!path.exists(), "read-only config must not be written");
    }

    #[test]
    fn saves_and_loads_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("config.json");

        let mut config = Config::default();
        config.rollover.weekly.at = TurnOffset::from_minutes(90);
        config.save(&path).unwrap();

        let loaded = Config::load(&path);
        assert_eq!(loaded.rollover.weekly.at, TurnOffset::from_minutes(90));
    }

    #[test]
    fn the_phase_nine_keys_round_trip_and_tolerate_garbage() {
        let mut config = Config::default();
        assert_eq!(config.date_display_format, DateFormat::MonthDayYear);
        assert!(!config.close_inspector_on_click_away, "off by default");
        assert_eq!(config.quick_note_folder, "Inbox");

        config.date_display_format = DateFormat::YearMonthDay;
        config.close_inspector_on_click_away = true;
        config.quick_note_folder = "Clientes".into();

        let reparsed = Config::parse(&config.render());
        assert_eq!(reparsed.date_display_format, DateFormat::YearMonthDay);
        assert!(reparsed.close_inspector_on_click_away);
        assert_eq!(reparsed.quick_note_folder, "Clientes");

        // A pattern the app cannot render falls back rather than showing a
        // date wrong, and an empty folder is not a folder.
        let broken = Config::parse(
            r#"{ "schemaVersion": 1, "dateDisplayFormat": "banana",
                 "quickNoteFolder": "  ", "closeInspectorOnClickAway": 7 }"#,
        );
        assert_eq!(broken.date_display_format, DateFormat::MonthDayYear);
        assert_eq!(broken.quick_note_folder, "Inbox");
        assert!(!broken.close_inspector_on_click_away);
    }

    #[test]
    fn the_default_note_layout_is_absent_until_chosen_and_round_trips() {
        let mut config = Config::default();
        assert_eq!(config.note_layout, "", "empty means what the app ships as");
        assert!(!config.render().contains("noteLayout"));

        config.note_layout = "tree".into();
        let rendered = config.render();
        assert!(rendered.contains("\"noteLayout\": \"tree\""), "{rendered}");
        assert_eq!(Config::parse(&rendered).note_layout, "tree");

        // Back to the default removes the key instead of leaving a stale one.
        config.note_layout = String::new();
        assert!(!config.render().contains("noteLayout"));

        // Not a string: falls back, the rest of the file unharmed.
        let broken = Config::parse(r#"{ "schemaVersion": 1, "noteLayout": 7 }"#);
        assert_eq!(broken.note_layout, "");
    }

    #[test]
    fn the_theme_round_trips_and_absent_means_the_app_default() {
        // Same covenant as the accent: a name, not policed here, and absent
        // means the one the app ships as — so an untouched notebook says
        // nothing about how it looks.
        let config = Config::default();
        assert_eq!(config.theme, "");
        assert!(!config.render().contains("\"theme\""));

        let chosen = Config {
            theme: "dark".into(),
            ..Config::default()
        };
        let reparsed = Config::parse(&chosen.render());
        assert_eq!(reparsed.theme, "dark");

        let mut back = reparsed;
        back.theme = String::new();
        assert!(!back.render().contains("\"theme\""));

        // A theme this build cannot draw survives: the list is the interface's.
        let future = Config::parse(r#"{ "schemaVersion": 1, "theme": "solarized" }"#);
        assert_eq!(future.theme, "solarized");
        assert!(future.render().contains("solarized"));
    }

    #[test]
    fn the_formatting_bars_place_round_trips_and_absent_means_the_app_default() {
        // Untouched: neither key is in the file, so a notebook that never had
        // the bar moved says nothing about where it sits.
        let config = Config::default();
        assert_eq!(config.format_bar, "");
        assert_eq!(config.format_bar_side, "");
        let rendered = config.render();
        assert!(!rendered.contains("formatBar"), "{rendered}");

        let chosen = Config {
            format_bar: "selection".into(),
            format_bar_side: "left".into(),
            ..Config::default()
        };
        let reparsed = Config::parse(&chosen.render());
        assert_eq!(reparsed.format_bar, "selection");
        assert_eq!(reparsed.format_bar_side, "left");

        // Back to the app's own REMOVES both keys, the same rule the accent
        // and the theme follow — a stale one in `raw` would outlive the
        // choice that cleared it.
        let mut back = reparsed;
        back.format_bar = String::new();
        back.format_bar_side = String::new();
        let rendered = back.render();
        assert!(!rendered.contains("formatBar"), "{rendered}");

        // A mode and a side this build has never heard of survive: the lists
        // are the interface's, and a newer app's choice is not ours to reset.
        let future =
            Config::parse(r#"{ "schemaVersion": 1, "formatBar": "hover", "formatBarSide": "float" }"#);
        assert_eq!(future.format_bar, "hover");
        assert_eq!(future.format_bar_side, "float");
        assert!(future.render().contains("hover"));
    }

    #[test]
    fn the_accent_colour_round_trips_and_absent_means_the_app_default() {
        // Nothing chosen: the key is not in the file at all, so a notebook the
        // user never themed says nothing about the theme.
        let config = Config::default();
        assert_eq!(config.accent_color, "");
        assert!(
            !config.render().contains("accentColor"),
            "an untouched notebook writes no accent key"
        );

        let chosen = Config {
            accent_color: "orange".into(),
            ..Config::default()
        };
        let reparsed = Config::parse(&chosen.render());
        assert_eq!(reparsed.accent_color, "orange");

        // Back to the default REMOVES the key — a stale one left in `raw`
        // would outlive the choice that cleared it.
        let mut back = reparsed;
        back.accent_color = String::new();
        let rendered = back.render();
        assert!(!rendered.contains("accentColor"), "{rendered}");

        // A name this build has never heard of survives: the list of colours
        // is the interface's, and a newer app's choice is not ours to reset.
        let future = Config::parse(r#"{ "schemaVersion": 1, "accentColor": "teal" }"#);
        assert_eq!(future.accent_color, "teal");
        assert!(future.render().contains("teal"));
    }

    #[test]
    fn the_heading_colour_round_trips_and_absent_means_the_accent() {
        // The third look setting, same covenant as the other two (2026-08-17):
        // a name, unpoliced, and absent means what the app ships as — which
        // here is the accent, so an untouched notebook writes nothing.
        let config = Config::default();
        assert_eq!(config.heading_color, "");
        assert!(!config.render().contains("headingColor"));

        let chosen = Config {
            heading_color: "ink".into(),
            ..Config::default()
        };
        let reparsed = Config::parse(&chosen.render());
        assert_eq!(reparsed.heading_color, "ink");

        let mut back = reparsed;
        back.heading_color = String::new();
        assert!(!back.render().contains("headingColor"));

        // A value from a newer build is kept, not reset — the answers belong
        // to the interface, exactly as with the accent and the theme.
        let future = Config::parse(r#"{ "schemaVersion": 1, "headingColor": "rainbow" }"#);
        assert_eq!(future.heading_color, "rainbow");
        assert!(future.render().contains("rainbow"));
    }

    #[test]
    fn shortcuts_survive_a_round_trip_and_are_not_policed() {
        // The core does not know what a command is. A binding it cannot read
        // is a binding a NEWER build wrote, and throwing it away would make
        // opening a notebook in an older Jott quietly destructive.
        let config = Config::parse(
            r#"{ "schemaVersion": 1, "shortcuts": { "task.new": "Mod+J", "future.thing": "Mod+Q" } }"#,
        );
        assert_eq!(config.shortcuts.len(), 2);
        assert_eq!(config.shortcuts["future.thing"], "Mod+Q");

        let reparsed = Config::parse(&config.render());
        assert_eq!(reparsed.shortcuts, config.shortcuts);
    }

    #[test]
    fn no_shortcuts_writes_no_key() {
        // A notebook that never rebound anything says nothing about it, the
        // same way it says nothing about a theme it never chose.
        let config = Config::default();
        assert!(!config.render().contains("shortcuts"));
    }

    #[test]
    fn a_renamed_folder_carries_its_arrangements_with_it() {
        // Renaming a space moves its folder now (2026-08-13), and both
        // shapes of stored arrangement are addressed by folder. Left stale,
        // they fail silently: the space simply drops to the end of a
        // column the user dragged, with nothing on screen to explain it.
        let mut config = Config::default();
        config.set_order("spaces", vec!["Work".into(), "Mercado".into()]);
        config.set_order("lists:Design/Work", vec!["a".into()]);
        config.set_order("lists:Other", vec!["b".into()]);

        assert!(config.relocate_orders("Design/Work", "Design/Tasks"));
        assert_eq!(
            config.order.get("spaces"),
            Some(&vec!["Tasks".to_string(), "Mercado".to_string()]),
            "the sidebar order holds bare folder names"
        );
        assert_eq!(
            config.order.get("lists:Design/Tasks"),
            Some(&vec!["a".to_string()])
        );
        assert!(!config.order.contains_key("lists:Design/Work"));
        assert_eq!(
            config.order.get("lists:Other"),
            Some(&vec!["b".to_string()]),
            "an unrelated namespace is left alone"
        );

        // A GROUP rename moves everything beneath it, keys included.
        let mut nested = Config::default();
        nested.set_order("lists:Design/Work", vec!["a".into()]);
        nested.set_order("lists:Designer/Work", vec!["c".into()]);
        assert!(nested.relocate_orders("Design", "Brand"));
        assert_eq!(
            nested.order.get("lists:Brand/Work"),
            Some(&vec!["a".to_string()])
        );
        assert_eq!(
            nested.order.get("lists:Designer/Work"),
            Some(&vec!["c".to_string()]),
            "a key that merely STARTS with the old name is not under it"
        );

        // Moving without renaming touches no key and reports nothing changed.
        let mut same = Config::default();
        same.set_order("spaces", vec!["Work".into()]);
        assert!(!same.relocate_orders("Work", "Work"));
    }

    /// The one the suite above missed for four months, because it only ever
    /// held ONE opinion at a time: with a single feature in the map, forgetting
    /// it emptied the map, and an empty map was cleared outright. With TWO, the
    /// shorter map was merged over the longer one and the forgotten key came
    /// straight back — so on a phone a switch could be turned off and never on
    /// again (user report on device, 2026-08-20).
    ///
    /// Every map this build owns whole is checked here, because the fix is one
    /// rule in `jsondoc::render` and each of them was living under it.
    #[test]
    fn forgetting_one_of_several_opinions_actually_removes_it() {
        let mut config = Config::default();
        config.set_feature("repeat", Some(false));
        config.set_feature("priority", Some(false));
        config.shortcuts.insert("task.new".into(), Value::from("Ctrl+N"));
        config.shortcuts.insert("note.new".into(), Value::from("Ctrl+Shift+N"));

        // Read back the way the app does — `raw` now HOLDS both of each.
        let mut back = Config::parse(&config.render());
        back.set_feature("priority", None);
        back.shortcuts.remove("note.new");

        let written = Config::parse(&back.render());
        assert_eq!(written.feature("priority"), None, "the forgotten one is gone");
        assert_eq!(written.feature("repeat"), Some(false), "its neighbour stays");
        assert!(!written.shortcuts.contains_key("note.new"), "the unbound chord is gone");
        assert!(written.shortcuts.contains_key("task.new"), "its neighbour stays");
    }

    #[test]
    fn a_feature_records_an_opinion_and_forgets_it_when_asked_to() {
        // The core stores what the user SAID; it does not know the defaults —
        // those differ per feature and live with the interface, which is also
        // where the settings screen reads them (2026-08-06). So an untouched
        // notebook says nothing about features at all.
        let mut config = Config::default();
        assert_eq!(config.feature("tasks"), None);
        assert!(!config.render().contains("features"));

        config.set_feature("repeat", Some(false));
        let text = config.render();
        assert!(text.contains("repeat"));
        let mut back = Config::parse(&text);
        assert_eq!(back.feature("repeat"), Some(false));
        assert_eq!(back.feature("tasks"), None, "one opinion is not an opinion on all");

        // A switch put back the way it ships is FORGOTTEN, not written as
        // `true` — the file carries only what differs.
        back.set_feature("repeat", None);
        assert_eq!(back.feature("repeat"), None);
        assert!(!back.render().contains("\"repeat\""));

        // Turning ON something that ships off is an opinion too, and is kept.
        back.set_feature("week", Some(true));
        assert_eq!(Config::parse(&back.render()).feature("week"), Some(true));

        // A value that is not a bool is not an opinion.
        let broken = Config::parse(r#"{ "schemaVersion": 1, "features": { "tasks": "no" } }"#);
        assert_eq!(broken.feature("tasks"), None);
    }

    #[test]
    fn the_sidebar_sort_survives_a_rewrite_and_clears_out_of_the_file() {
        // Like `order` and `periodSort`: an untouched notebook says nothing
        // about it, and clearing has to REMOVE the key or a stale one in `raw`
        // outlives the change (2026-08-06).
        let mut config = Config::default();
        assert_eq!(config.spaces_sort, "");
        assert!(!config.render().contains("spacesSort"));

        config.spaces_sort = "name".into();
        let text = config.render();
        assert!(text.contains("spacesSort"));
        assert_eq!(Config::parse(&text).spaces_sort, "name");

        let mut back = Config::parse(&text);
        back.spaces_sort = String::new();
        assert!(!back.render().contains("spacesSort"));
    }

    #[test]
    fn dates_render_in_every_offered_shape() {
        // All three use `/` (user call, 2026-08-06); only the order differs.
        let date = chrono::NaiveDate::from_ymd_opt(2026, 7, 5).unwrap();
        assert_eq!(DateFormat::MonthDayYear.format(date), "07/05/2026");
        assert_eq!(DateFormat::DayMonthYear.format(date), "05/07/2026");
        assert_eq!(DateFormat::YearMonthDay.format(date), "2026/07/05");

        // Every offered value survives the config round trip.
        for shape in [
            DateFormat::MonthDayYear,
            DateFormat::DayMonthYear,
            DateFormat::YearMonthDay,
        ] {
            assert_eq!(DateFormat::parse_or_default(shape.render()), shape);
        }

        // A notebook written before the change still means what it said: the
        // hyphen spellings land on the matching order.
        assert_eq!(
            DateFormat::parse_or_default("dd-mm-yyyy"),
            DateFormat::DayMonthYear
        );
        assert_eq!(
            DateFormat::parse_or_default("yyyy-mm-dd"),
            DateFormat::YearMonthDay
        );
    }

    #[test]
    fn a_missing_file_loads_the_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let config = Config::load(dir.path().join("absent.json"));
        assert_eq!(config.rollover, Rollover::default());
    }
}
