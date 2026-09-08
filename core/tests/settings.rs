//! Notebook settings and the machine's display answers: what a patch
//! keeps, what the machine overrides, and what never reaches the file.

use jott_core::clock::WeekStart;
use jott_core::config::{Config, RolloverMode};
use jott_core::settings::*;


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
