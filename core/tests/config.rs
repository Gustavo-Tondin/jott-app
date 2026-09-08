//! The notebook's `config.json`, one key at a time: defaults, tolerance
//! for garbage, and what a rewrite keeps.

use serde_json::Value;

use jott_core::clock::WeekStart;
use jott_core::config::*;
use jott_core::Error;

/// Sorted view of a JSON object, for stable assertions in tests.
fn keys_of(text: &str) -> std::collections::BTreeMap<String, Value> {
    let Ok(Value::Object(map)) = serde_json::from_str::<Value>(text) else {
        panic!("not a json object: {text}");
    };
    map.into_iter().collect()
}

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
    assert!(!config.auto_space_colors);
    assert_eq!(config.rollover.daily.mode, RolloverMode::Reset);
    assert_eq!(config.week_starts_on, WeekStart::Monday);
    assert!(!config.tasks_show_all);
    assert!(config.offer_task_fields);
    assert!(!config.is_read_only());
}

#[test]
fn reads_the_documented_example() {
    let config = Config::parse(
        r#"{
          "schemaVersion": 1,
          "rollover": {
            "daily":  { "mode": "carry", "at": "-02:00" }
          },
          "weekStartsOn": "sunday"
        }"#,
    );

    assert_eq!(config.rollover.daily.mode, RolloverMode::Carry);
    // `at` is from before 2026-09-04: read by nothing, kept by the file.
    assert!(config.render().contains("\"at\": \"-02:00\""));
    assert_eq!(config.week_starts_on, WeekStart::Sunday);
}

#[test]
fn the_week_start_is_still_read_from_where_it_used_to_live() {
    // Written while the week was a period (before 2026-09-04).
    let config = Config::parse(
        r#"{ "rollover": { "weekly": { "mode": "reset", "startsOn": "sunday" } } }"#,
    );
    assert_eq!(config.week_starts_on, WeekStart::Sunday);
    // The new key wins once it exists.
    let config = Config::parse(
        r#"{ "weekStartsOn": "monday", "rollover": { "weekly": { "startsOn": "sunday" } } }"#,
    );
    assert_eq!(config.week_starts_on, WeekStart::Monday);
    // And the rewrite says it in the new place.
    assert!(config.render().contains("\"weekStartsOn\": \"monday\""));
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
            "daily": { "mode": "banana", "at": "25:99" }
          },
          "weekStartsOn": 42
        }"#,
    );
    assert_eq!(config.rollover, Rollover::default());
    assert_eq!(config.week_starts_on, WeekStart::default());
}

#[test]
fn the_age_thresholds_follow_the_same_pact_as_everything_else() {
    // A value that makes no sense reads as the default, an absent one
    // means untouched, and an unknown sibling key round-trips.
    let config = Config::parse(
        r#"{
          "schemaVersion": 1,
          "age": { "fresh": 3, "stale": "soon", "sweepDay": "sunday" }
        }"#,
    );
    assert_eq!(config.age.fresh, 3);
    assert_eq!(config.age.stale, jott_core::age::Thresholds::default().stale);
    assert_eq!(
        config.age.inbox_stale,
        jott_core::age::Thresholds::default().inbox_stale
    );
    assert!(
        config.render().contains("sweepDay"),
        "a key this build does not know survives: {}",
        config.render()
    );
}

#[test]
fn a_negative_threshold_is_not_a_threshold() {
    let config = Config::parse(r#"{ "schemaVersion": 1, "age": { "fresh": -5 } }"#);
    assert_eq!(config.age.fresh, jott_core::age::Thresholds::default().fresh);
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
    config.week_starts_on = WeekStart::Sunday;

    let reparsed = Config::parse(&config.render());
    assert_eq!(reparsed.rollover, config.rollover);
    assert_eq!(reparsed.week_starts_on, WeekStart::Sunday);
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
    config.rollover.daily.mode = RolloverMode::Carry;
    config.save(&path).unwrap();

    let loaded = Config::load(&path);
    assert_eq!(loaded.rollover.daily.mode, RolloverMode::Carry);
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
    // The table layout follows the same three rules.
    let mut config = Config::default();
    assert_eq!(config.table_layout, "");
    assert!(!config.render().contains("tableLayout"));
    config.table_layout = "scroll".into();
    assert_eq!(Config::parse(&config.render()).table_layout, "scroll");
    assert_eq!(
        Config::parse(r#"{ "schemaVersion": 1, "tableLayout": true }"#).table_layout,
        ""
    );
}

#[test]
fn the_theme_round_trips_and_absent_means_the_app_default() {
    // Same covenant as the accent: a name, not policed here, and absent
    // means the one the app ships as — so an untouched notebook says
    // nothing about how it looks.
    let config = Config::default();
    assert_eq!(config.theme, "");
    assert!(!config.render().contains("\"theme\""));

    // A palette name — never one of the four the app owns (`jott`,
    // `default`, `light`, `dark`), which `themes::RESERVED` refuses
    // precisely so that an old `theme: "dark"` can only mean a mode.
    let mut chosen = Config::default();
    chosen.theme = "solarized".into();
    let reparsed = Config::parse(&chosen.render());
    assert_eq!(reparsed.theme, "solarized");

    let mut back = reparsed;
    back.theme = String::new();
    assert!(!back.render().contains("\"theme\""));

    // A theme this build cannot draw survives: the list is the interface's.
    let future = Config::parse(r#"{ "schemaVersion": 1, "theme": "solarized" }"#);
    assert_eq!(future.theme, "solarized");
    assert_eq!(future.mode, "");

    // A file from before the split (2026-08-26): `theme` held the look.
    let old = Config::parse(r#"{ "schemaVersion": 1, "theme": "dark" }"#);
    assert_eq!((old.mode.as_str(), old.theme.as_str()), ("dark", ""));
    let older = Config::parse(r#"{ "schemaVersion": 1, "theme": "default" }"#);
    assert_eq!((older.mode.as_str(), older.theme.as_str()), ("jott", ""));
    // With `mode` present, `theme` is a palette name whatever it says.
    let both = Config::parse(r#"{ "schemaVersion": 1, "mode": "light", "theme": "dark" }"#);
    assert_eq!((both.mode.as_str(), both.theme.as_str()), ("light", "dark"));
    assert!(both.render().contains("\"mode\": \"light\""));
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

    let mut chosen = Config::default();
    chosen.format_bar = "selection".into();
    chosen.format_bar_side = "left".into();
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

    let mut chosen = Config::default();
    chosen.accent_color = "orange".into();
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

    let mut chosen = Config::default();
    chosen.heading_color = "ink".into();
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
fn the_rainbow_switch_round_trips_and_a_bad_value_falls_back() {
    let mut config = Config::default();
    config.auto_space_colors = true;
    assert!(Config::parse(&config.render()).auto_space_colors);
    assert!(!Config::parse(r#"{"autoSpaceColors": "sim"}"#).auto_space_colors);
}

#[test]
fn the_sidebar_sort_survives_a_rewrite_and_clears_out_of_the_file() {
    // Like `order` and `daySort`: an untouched notebook says nothing
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
