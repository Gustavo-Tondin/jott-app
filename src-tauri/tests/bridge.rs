//! The Tauri bridge, driven through the real IPC layer.
//!
//! Uses Tauri's mock runtime, so every call goes through `invoke()` exactly
//! as it does from the frontend — argument names, camelCase conversion,
//! serialization and error shape all get exercised. A command that only works
//! when called directly in Rust would pass a unit test and still fail in the
//! app; this catches that.

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindowBuilder};

type MockApp = tauri::App<tauri::test::MockRuntime>;

fn app() -> MockApp {
    jott_lib::configure(tauri::test::mock_builder())
        .build(mock_context(noop_assets()))
        .expect("failed to build the mock app")
}

/// Calls a command the way the webview does. `Err` carries whatever the
/// command returned as its error payload.
fn invoke(app: &MockApp, cmd: &str, args: Value) -> Result<Value, Value> {
    let webview = app
        .get_webview_window("main")
        .expect("main webview should exist");

    let request = InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: if cfg!(any(windows, target_os = "android")) {
            "http://tauri.localhost"
        } else {
            "tauri://localhost"
        }
        .parse()
        .unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };

    tauri::test::get_ipc_response(&webview, request)
        .map(|body| body.deserialize::<Value>().unwrap())
}

/// An app with a webview and a freshly created notebook, ready to drive.
fn app_with_notebook() -> (std::sync::MutexGuard<'static, ()>, MockApp, tempfile::TempDir) {
    let lock = exclusive();
    let app = app();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .expect("failed to build the mock webview");

    let dir = tempfile::tempdir().unwrap();
    invoke(&app, "open_notebook", json!({ "path": dir.path() }))
        .expect("open_notebook should succeed");
    (lock, app, dir)
}

fn ok(app: &MockApp, cmd: &str, args: Value) -> Value {
    invoke(app, cmd, args).unwrap_or_else(|e| panic!("{cmd} failed: {e}"))
}

/// Creates a task and gives it an id, the way the UI does when the user acts
/// on it. `create_task` alone returns a position: a new task has no id until
/// something needs to address it.
fn task_with_id(app: &MockApp, list: &str, text: &str) -> String {
    let position = ok(app, "create_task", json!({ "list": list, "text": text }));
    ok(
        app,
        "ensure_task_id",
        json!({ "list": list, "position": position }),
    )
    .as_str()
    .unwrap()
    .to_string()
}

/// Serializes the whole suite and gives it a clean preferences file.
///
/// Machine preferences are one file per machine, and **every** test that opens
/// a notebook writes to it. Isolating only the tests that assert on it is not
/// enough: the other ones still race against those. Since the suite runs in
/// milliseconds, running it one test at a time is the cheap, honest fix.
///
/// The guard must be held for the whole test — bind it, do not discard it.
fn exclusive() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    static DIR: std::sync::OnceLock<tempfile::TempDir> = std::sync::OnceLock::new();

    // A poisoned lock only means an earlier test panicked; the isolation still
    // works, so recover instead of failing every test after the first failure.
    let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let dir = DIR.get_or_init(|| tempfile::tempdir().unwrap());
    std::env::set_var("JOTT_CONFIG_DIR", dir.path());
    let _ = std::fs::remove_file(dir.path().join("machine-prefs.json"));

    guard
}

#[test]
fn commands_fail_cleanly_before_a_notebook_is_open() {
    let _lock = exclusive();
    // The UI can call something before onboarding finishes; that must be a
    // typed error, not a panic that takes the window down.
    let app = app();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    let err = invoke(&app, "list_names", json!({})).unwrap_err();
    assert_eq!(err["kind"], "noNotebook");
    assert_eq!(ok(&app, "current_notebook", json!({})), Value::Null);
}

#[test]
fn opening_a_notebook_reports_it_and_creates_the_layout() {
    let (_lock, app, dir) = app_with_notebook();

    let info = ok(&app, "current_notebook", json!({}));
    assert_eq!(info["readOnly"], json!(false));
    assert_eq!(
        info["lists"],
        json!([{"path": "jott.tasks/completed.md", "name": "completed", "space": "Tasks"}, {"path": "jott.tasks/task-list.md", "name": "task-list", "space": "Tasks"}]),
        "default lists should exist and be sorted"
    );
    assert!(dir.path().join(".jott/config.json").is_file());
}

#[test]
fn the_full_task_lifecycle_over_the_bridge() {
    let (_lock, app, dir) = app_with_notebook();

    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));
    let id = task_with_id(&app, "jott.tasks/Compras.md", "Comprar leite");

    ok(
        &app,
        "edit_task_text",
        json!({ "list": "jott.tasks/Compras.md", "id": id, "text": "Comprar leite integral" }),
    );

    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/Compras.md" }));
    assert_eq!(tasks[0]["text"], "Comprar leite integral");
    assert_eq!(tasks[0]["done"], json!(false));

    // Pull into both periods, then complete: the references FOLLOW the task
    // into the Completed (2026-08-06), which is what puts it in the period
    // screen's "Completed N" section instead of making it vanish.
    ok(
        &app,
        "pull_into_period",
        json!({ "period": "week", "list": "jott.tasks/Compras.md", "id": id }),
    );
    ok(
        &app,
        "pull_into_period",
        json!({ "period": "day", "list": "jott.tasks/Compras.md", "id": id }),
    );
    let day = ok(&app, "notebook_snapshot", json!({}))["day"].clone();
    assert_eq!(day[0]["path"], "jott.tasks/Compras.md");

    ok(
        &app,
        "complete_task",
        json!({ "list": "jott.tasks/Compras.md", "id": id }),
    );
    let day = ok(&app, "notebook_snapshot", json!({}))["day"].clone();
    assert_eq!(day[0]["path"], "jott.tasks/completed.md");
    let pulled = ok(&app, "period_tasks", json!({ "period": "day" }));
    assert_eq!(pulled[0]["task"]["done"], json!(true));

    let completed = std::fs::read_to_string(dir.path().join("jott.tasks/completed.md")).unwrap();
    assert!(completed.contains("- [x] Comprar leite integral"));
    assert!(completed.contains("origin:Compras"));

    ok(&app, "uncomplete_task", json!({ "list": "jott.tasks/completed.md", "id": id }));
    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/Compras.md" }));
    assert_eq!(tasks[0]["done"], json!(false));
}

#[test]
fn creating_a_task_from_today_writes_it_to_the_inbox() {
    let (_lock, app, dir) = app_with_notebook();

    let id = ok(
        &app,
        "add_task_in_period",
        json!({ "period": "day", "text": "Responder e-mail" }),
    );
    let id = id.as_str().unwrap();

    let inbox = std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md")).unwrap();
    assert!(inbox.contains("Responder e-mail"));

    let day = ok(&app, "notebook_snapshot", json!({}))["day"].clone();
    assert_eq!(day[0]["path"], "jott.tasks/task-list.md");
    assert_eq!(day[0]["id"], id);

    assert_eq!(
        ok(
            &app,
            "remove_from_period",
            json!({ "period": "day", "list": "jott.tasks/task-list.md", "id": id })
        ),
        json!(true)
    );
}

#[test]
fn list_management_over_the_bridge() {
    let (_lock, app, dir) = app_with_notebook();

    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));
    ok(
        &app,
        "create_task",
        json!({ "list": "jott.tasks/Compras.md", "text": "Comprar leite" }),
    );

    ok(
        &app,
        "rename_list",
        json!({ "from": "jott.tasks/Compras.md", "to": "Mercado" }),
    );
    assert!(dir.path().join("jott.tasks/Mercado.md").is_file());

    // Deleting rescues the task into the Inbox rather than dropping it.
    let rescued = ok(&app, "delete_list", json!({ "name": "jott.tasks/Mercado.md" }));
    assert_eq!(rescued, json!(1));
    assert!(std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md"))
        .unwrap()
        .contains("Comprar leite"));
}

#[test]
fn errors_arrive_typed_so_the_ui_can_branch_on_them() {
    let (_lock, app, _dir) = app_with_notebook();

    let err = invoke(
        &app,
        "complete_task",
        json!({ "list": "jott.tasks/task-list.md", "id": "nao-existe" }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "taskNotFound");
    assert!(err["message"].as_str().unwrap().contains("nao-existe"));

    let err = invoke(&app, "delete_list", json!({ "name": "jott.tasks/task-list.md" })).unwrap_err();
    assert_eq!(err["kind"], "protected");

    let err = invoke(&app, "create_list", json!({ "folder": "jott.tasks", "name": "../fuga" })).unwrap_err();
    assert_eq!(err["kind"], "invalidListName");
}

#[test]
fn settings_round_trip_through_the_bridge() {
    let (_lock, app, dir) = app_with_notebook();

    let defaults = ok(&app, "notebook_settings", json!({}));
    assert_eq!(defaults["dailyMode"], "reset");
    assert_eq!(defaults["dailyAt"], "00:00");
    assert_eq!(defaults["weekStartsOn"], "monday");

    ok(
        &app,
        "set_notebook_settings",
        json!({
            "settings": {
                "dailyMode": "carry",
                "dailyAt": "-02:00",
                "weeklyMode": "reset",
                "weeklyAt": "02:00",
                "weekStartsOn": "sunday"
            }
        }),
    );

    let saved = ok(&app, "notebook_settings", json!({}));
    assert_eq!(saved["dailyMode"], "carry");
    assert_eq!(saved["dailyAt"], "-02:00");
    assert_eq!(saved["weekStartsOn"], "sunday");

    // And it really reached the file, not just the in-memory config.
    let on_disk = std::fs::read_to_string(dir.path().join(".jott/config.json")).unwrap();
    assert!(on_disk.contains("carry"));
    assert!(on_disk.contains("-02:00"));
}

#[test]
fn the_snapshot_carries_what_is_pulled_into_the_day() {
    // Every screen that draws a card marks the ones in today (2026-08-06);
    // asking per screen is the fan-out this snapshot exists to avoid.
    let (_lock, app, _dir) = app_with_notebook();
    let list = "jott.tasks/task-list.md";
    let id = task_with_id(&app, list, "Comprar leite");
    task_with_id(&app, list, "Pagar boleto");

    assert_eq!(ok(&app, "notebook_snapshot", json!({}))["day"], json!([]));
    ok(
        &app,
        "pull_into_period",
        json!({ "period": "day", "list": list, "id": id }),
    );

    let day = ok(&app, "notebook_snapshot", json!({}))["day"].clone();
    assert_eq!(day, json!([{ "path": list, "id": id }]));
}

#[test]
fn switching_a_feature_off_reaches_the_layout_and_touches_nothing_else() {
    let (_lock, app, dir) = app_with_notebook();
    let list = "jott.tasks/task-list.md";
    task_with_id(&app, list, "Comprar leite");

    // Nothing is said about features until something is switched off.
    let layout = |app: &MockApp| ok(app, "notebook_snapshot", json!({}))["info"]["layout"].clone();
    assert_eq!(layout(&app)["features"], json!({}));

    ok(&app, "set_feature", json!({ "key": "repeat", "on": false }));
    assert_eq!(layout(&app)["features"]["repeat"], json!(false));

    // The notebook itself is untouched: the task is still there, and so is the
    // Inbox — switching a feature back on has to find everything where it was.
    assert_eq!(
        ok(&app, "list_tasks", json!({ "list": list }))[0]["text"],
        "Comprar leite"
    );
    assert!(dir.path().join(list).is_file());

    // `null` forgets the opinion — what the interface sends when a switch goes
    // back to the way the app ships.
    ok(&app, "set_feature", json!({ "key": "repeat", "on": null }));
    assert_eq!(layout(&app)["features"], json!({}));

    // And switching ON something that ships off is an opinion just the same.
    ok(&app, "set_feature", json!({ "key": "week", "on": true }));
    assert_eq!(layout(&app)["features"]["week"], json!(true));
}

#[test]
fn the_sidebar_sort_round_trips() {
    let (_lock, app, dir) = app_with_notebook();

    assert_eq!(ok(&app, "spaces_sort", json!({})), "");
    ok(&app, "set_spaces_sort", json!({ "sort": "name" }));
    assert_eq!(ok(&app, "spaces_sort", json!({})), "name");
    assert!(std::fs::read_to_string(dir.path().join(".jott/config.json"))
        .unwrap()
        .contains("spacesSort"));

    // Anything else means the dragged order, which is what an untouched
    // notebook already does — so the key leaves the file entirely.
    ok(&app, "set_spaces_sort", json!({ "sort": "banana" }));
    assert_eq!(ok(&app, "spaces_sort", json!({})), "");
    assert!(!std::fs::read_to_string(dir.path().join(".jott/config.json"))
        .unwrap()
        .contains("spacesSort"));
}

#[test]
fn a_period_can_be_sorted_and_dragged_over_the_bridge() {
    let (_lock, app, _dir) = app_with_notebook();
    let list = "jott.tasks/task-list.md";
    let a = task_with_id(&app, list, "um");
    let b = task_with_id(&app, list, "dois");
    for id in [&a, &b] {
        ok(
            &app,
            "pull_into_period",
            json!({ "period": "day", "list": list, "id": id }),
        );
    }

    assert_eq!(ok(&app, "period_sort", json!({ "period": "day" })), Value::Null);
    ok(
        &app,
        "set_period_sort",
        json!({ "period": "day", "sort": "name" }),
    );
    assert_eq!(ok(&app, "period_sort", json!({ "period": "day" })), "name");

    // Dragging rewrites the state file itself — the day IS that list.
    ok(
        &app,
        "set_period_order",
        json!({ "period": "day", "refs": [
            { "path": list, "id": b }, { "path": list, "id": a },
        ]}),
    );
    let pulled = ok(&app, "period_tasks", json!({ "period": "day" }));
    assert_eq!(pulled[0]["task"]["text"], "dois");
    assert_eq!(pulled[1]["task"]["text"], "um");
}

#[test]
fn the_retention_windows_round_trip_and_refuse_nonsense() {
    // How long a completed task and a trashed item stick around (2026-08-06).
    let (_lock, app, _dir) = app_with_notebook();

    let defaults = ok(&app, "notebook_settings", json!({}));
    assert_eq!(defaults["completedRetentionDays"], 30);
    assert_eq!(defaults["trashRetentionDays"], 30);

    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": { "completedRetentionDays": 0, "trashRetentionDays": 7 } }),
    );
    let saved = ok(&app, "notebook_settings", json!({}));
    assert_eq!(saved["completedRetentionDays"], 0);
    assert_eq!(saved["trashRetentionDays"], 7);

    // A negative window is meaningless and must never reach the file.
    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": { "completedRetentionDays": -5 } }),
    );
    assert_eq!(
        ok(&app, "notebook_settings", json!({}))["completedRetentionDays"],
        0
    );
}

#[test]
fn nonsense_settings_are_normalized_instead_of_corrupting_the_config() {
    let (_lock, app, _dir) = app_with_notebook();

    ok(
        &app,
        "set_notebook_settings",
        json!({
            "settings": {
                "dailyMode": "banana",
                "dailyAt": "99:99",
                "weeklyMode": "",
                "weeklyAt": "nope",
                "weekStartsOn": "caturday"
            }
        }),
    );

    let saved = ok(&app, "notebook_settings", json!({}));
    assert_eq!(saved["dailyMode"], "reset");
    assert_eq!(saved["dailyAt"], "00:00");
    assert_eq!(saved["weekStartsOn"], "monday");
}

#[test]
fn the_clock_command_reports_the_logical_periods() {
    let (_lock, app, _dir) = app_with_notebook();

    let clock = ok(&app, "period_clock", json!({}));
    let today = clock["today"].as_str().unwrap();
    let week_start = clock["weekStart"].as_str().unwrap();

    // Shape matters more than the value: the UI parses these.
    assert_eq!(today.len(), 10, "expected YYYY-MM-DD, got {today}");
    assert!(week_start <= today, "week must start on or before today");
    assert!(clock["nextDailyTurn"].as_str().unwrap().contains('T'));
}

#[test]
fn refresh_periods_returns_both_states() {
    let (_lock, app, _dir) = app_with_notebook();

    let states = ok(&app, "refresh_periods", json!({}));
    assert_eq!(states.as_array().unwrap().len(), 2);
    assert!(states[0]["date"].is_string());
    assert!(states[1]["items"].is_array());
}

/// Guards a bug that no IPC test can catch: a native dialog cannot be driven
/// from a test, so the only thing standing between us and a frozen window is
/// this rule.
///
/// A synchronous `#[tauri::command]` runs on the main thread, and the plugin's
/// `blocking_*` helpers explicitly must not. The combination locks the GTK
/// event loop the instant the dialog opens — which is exactly what happened
/// the first time this command shipped.
#[test]
fn dialog_helpers_are_never_called_from_a_blocking_command() {
    let source = include_str!("../src/commands.rs");

    for (number, line) in source.lines().enumerate() {
        let code = line.trim();
        // Comments may name it — the docs on the command explain the trap.
        if code.starts_with("//") {
            continue;
        }
        assert!(
            !code.contains("blocking_pick"),
            "commands.rs:{}: blocking_pick_* freezes the window; use the \
             callback form inside an async command instead",
            number + 1
        );
    }

    // And the command that opens the picker must stay async.
    let picker = source
        .split("pub async fn pick_notebook_folder")
        .count();
    assert_eq!(
        picker, 2,
        "pick_notebook_folder must be an async command — a sync one runs on \
         the main thread and freezes the dialog"
    );
}

#[test]
fn the_day_offers_the_week_first_then_the_rest() {
    let (_lock, app, _dir) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));

    let solta = task_with_id(&app, "jott.tasks/task-list.md", "Tarefa solta");
    let semana = task_with_id(&app, "jott.tasks/Compras.md", "Escolhida pra semana");
    ok(
        &app,
        "pull_into_period",
        json!({ "period": "week", "list": "jott.tasks/Compras.md", "id": semana }),
    );

    let suggestions = ok(&app, "period_suggestions", json!({ "period": "day" }));
    assert_eq!(suggestions[0]["task"]["id"], semana);
    assert_eq!(suggestions[0]["path"], "jott.tasks/Compras.md");
    assert_eq!(suggestions[1]["task"]["id"], solta);

    // Once pulled, it stops being a suggestion and shows up as pulled.
    ok(
        &app,
        "pull_into_period",
        json!({ "period": "day", "list": "jott.tasks/Compras.md", "id": semana }),
    );
    let pulled = ok(&app, "period_tasks", json!({ "period": "day" }));
    assert_eq!(pulled[0]["task"]["text"], "Escolhida pra semana");

    let suggestions = ok(&app, "period_suggestions", json!({ "period": "day" }));
    assert_eq!(suggestions.as_array().unwrap().len(), 1);
}

#[test]
fn sync_conflicts_reach_the_frontend() {
    let (_lock, app, dir) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));

    assert_eq!(ok(&app, "list_conflicts", json!({})), json!([]));

    std::fs::write(
        dir.path()
            .join("jott.tasks/Compras.sync-conflict-20260720-143000-K3F7NLM.md"),
        "- [ ] versão do celular\n",
    )
    .unwrap();

    let conflicts = ok(&app, "list_conflicts", json!({}));
    assert_eq!(conflicts.as_array().unwrap().len(), 1);
    assert_eq!(conflicts[0]["list"], "Compras");
    assert!(conflicts[0]["original"].as_str().unwrap().ends_with("Compras.md"));

    // And it must not have become a list in the sidebar.
    assert_eq!(ok(&app, "list_names", json!({})), json!([{"path": "jott.tasks/Compras.md", "name": "Compras", "space": "Tasks"}, {"path": "jott.tasks/completed.md", "name": "completed", "space": "Tasks"}, {"path": "jott.tasks/task-list.md", "name": "task-list", "space": "Tasks"}]));
}

#[test]
fn the_rich_fields_round_trip_through_the_bridge() {
    let (_lock, app, dir) = app_with_notebook();
    let id = task_with_id(&app, "jott.tasks/task-list.md", "Comprar material");

    ok(
        &app,
        "set_task_fields",
        json!({
            "list": "jott.tasks/task-list.md",
            "id": id,
            "fields": {
                "due": "2026-07-25",
                "priority": 2,
                "tags": ["casa", "urgent"],
                "description": ["Falar com o Jorge antes."],
                "repeat": "every-week",
                "subtasks": [{ "text": "Cimento", "done": false }]
            }
        }),
    );

    let on_disk = std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md")).unwrap();
    assert!(on_disk.contains("@2026-07-25"), "{on_disk}");
    assert!(on_disk.contains("#casa"));
    assert!(on_disk.contains("!2"));
    assert!(on_disk.contains("  Falar com o Jorge antes."));
    assert!(on_disk.contains("repeat: every-week"));
    assert!(on_disk.contains("  - [ ] Cimento"));

    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/task-list.md" }));
    assert_eq!(tasks[0]["due"], "2026-07-25");
    assert_eq!(tasks[0]["priority"], json!(2));
    assert_eq!(tasks[0]["subtasks"][0]["text"], "Cimento");
}

#[test]
fn a_field_can_be_cleared_but_only_when_mentioned() {
    let (_lock, app, _dir) = app_with_notebook();
    let id = task_with_id(&app, "jott.tasks/task-list.md", "Tarefa");

    ok(
        &app,
        "set_task_fields",
        json!({ "list": "jott.tasks/task-list.md", "id": id,
                "fields": { "due": "2026-07-25", "priority": 1 } }),
    );

    // Mentioning only one field leaves the other alone...
    ok(
        &app,
        "set_task_fields",
        json!({ "list": "jott.tasks/task-list.md", "id": id, "fields": { "priority": 3 } }),
    );
    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/task-list.md" }));
    assert_eq!(tasks[0]["due"], "2026-07-25", "não mencionado, preservado");
    assert_eq!(tasks[0]["priority"], json!(3));

    // ...and null clears it, which is the only way to remove a date.
    ok(
        &app,
        "set_task_fields",
        json!({ "list": "jott.tasks/task-list.md", "id": id, "fields": { "due": null } }),
    );
    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/task-list.md" }));
    assert_eq!(tasks[0]["due"], Value::Null);
}

#[test]
fn reordering_rewrites_the_file_in_the_new_order() {
    let (_lock, app, dir) = app_with_notebook();
    for text in ["Primeira", "Segunda", "Terceira"] {
        ok(&app, "create_task", json!({ "list": "jott.tasks/task-list.md", "text": text }));
    }

    ok(
        &app,
        "move_task_to",
        json!({ "list": "jott.tasks/task-list.md", "from": 2, "to": 0 }),
    );

    let on_disk = std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md")).unwrap();
    // Each created task carries its creation stamp in the hidden comment
    // (2026-08-04); the order test only cares about the visible text.
    let order: Vec<&str> = on_disk
        .lines()
        .filter(|l| l.starts_with("- ["))
        .map(|l| l.split(" <!--").next().unwrap())
        .collect();
    assert_eq!(
        order,
        vec!["- [ ] Terceira", "- [ ] Primeira", "- [ ] Segunda"],
        "a ordem no arquivo é a ordem da tela"
    );
}

#[test]
fn moving_a_task_relists_it_keeping_its_id() {
    let (_lock, app, _dir) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));
    let id = task_with_id(&app, "jott.tasks/task-list.md", "Comprar leite");

    ok(
        &app,
        "move_task",
        json!({ "from": "jott.tasks/task-list.md", "id": id, "to": "jott.tasks/Compras.md" }),
    );

    let inbox = ok(&app, "list_tasks", json!({ "list": "jott.tasks/task-list.md" }));
    let compras = ok(&app, "list_tasks", json!({ "list": "jott.tasks/Compras.md" }));
    assert!(
        inbox.as_array().unwrap().is_empty(),
        "the task left the source list"
    );
    assert_eq!(compras[0]["text"], "Comprar leite", "it arrived in the target");
    assert_eq!(compras[0]["id"], id, "and kept its id across the move");
}

#[test]
fn suggestions_arrive_grouped() {
    let (_lock, app, dir) = app_with_notebook();
    let today = chrono::Local::now().date_naive();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        format!("- [ ] Vencida\n  @{}\n- [ ] Tranquila\n", today - chrono::Duration::days(1)),
    )
    .unwrap();

    // What is under test is the GROUPING. Since 2026-08-14 a dated task is
    // already in the day and so is not suggested at all — this asks the
    // question the old way round, with dates that only rank.
    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": { "datedTasksJoinPeriod": false } }),
    );

    let suggestions = ok(&app, "grouped_suggestions", json!({ "period": "day" }));

    assert_eq!(suggestions[0]["task"]["text"], "Vencida");
    assert_eq!(suggestions[0]["group"], "urgent");
    assert_eq!(suggestions[1]["group"], "lists");
}

#[test]
fn a_dated_task_reaches_the_day_over_the_bridge() {
    // On by default: a task written for today shows up in Today without being
    // pulled, and nothing is written into the day's state to make it happen.
    let (_lock, app, dir) = app_with_notebook();
    let today = chrono::Local::now().date_naive();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        format!("- [ ] Para hoje\n  @{today}\n- [ ] Sem data\n"),
    )
    .unwrap();

    let day = ok(&app, "period_tasks", json!({ "period": "day" }));
    assert_eq!(day.as_array().unwrap().len(), 1);
    assert_eq!(day[0]["task"]["text"], "Para hoje");

    let day = ok(&app, "notebook_snapshot", json!({}))["day"].clone();
    assert!(
        day.as_array().map(|i| i.is_empty()).unwrap_or(true),
        "nothing is written into the day's state"
    );
}

#[test]
fn a_partial_settings_payload_keeps_what_it_did_not_mention() {
    // An older frontend, or a screen that only edits one thing, must not wipe
    // the preferences it does not know about.
    let (_lock, app, _dir) = app_with_notebook();

    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": { "dailyMode": "carry", "showListCounts": false } }),
    );
    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": { "weeklyAt": "02:00" } }),
    );

    let saved = ok(&app, "notebook_settings", json!({}));
    assert_eq!(saved["weeklyAt"], "02:00", "the field that was sent");
    assert_eq!(saved["dailyMode"], "carry", "survived the second call");
    assert_eq!(saved["showListCounts"], json!(false), "survived too");
}

#[test]
fn list_counts_follow_the_setting() {
    let (_lock, app, _dir) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));
    ok(
        &app,
        "create_task",
        json!({ "list": "jott.tasks/Compras.md", "text": "Comprar leite" }),
    );

    let counts = ok(&app, "list_counts", json!({}));
    assert_eq!(counts["jott.tasks/Compras.md"], json!(1));
    assert_eq!(counts["jott.tasks/task-list.md"], json!(0));

    // Turned off, the command answers empty — the frontend does not need to
    // know the rule, it just renders what it gets.
    let mut settings = ok(&app, "notebook_settings", json!({}));
    settings["showListCounts"] = json!(false);
    ok(&app, "set_notebook_settings", json!({ "settings": settings }));

    assert_eq!(ok(&app, "list_counts", json!({})), json!({}));
}

#[test]
fn the_last_screen_is_only_restored_when_the_user_asked_for_it() {
    let (_lock, app, _dir) = app_with_notebook();

    // Off by default: nothing is stored and nothing is restored.
    ok(&app, "remember_screen", json!({ "screen": "list:Compras" }));
    assert_eq!(ok(&app, "screen_to_restore", json!({})), Value::Null);

    let mut settings = ok(&app, "notebook_settings", json!({}));
    assert_eq!(settings["restoreLastScreen"], json!(false));
    settings["restoreLastScreen"] = json!(true);
    ok(&app, "set_notebook_settings", json!({ "settings": settings }));

    // Still null: turning the preference on must not resurrect a screen the
    // app was never allowed to record.
    assert_eq!(ok(&app, "screen_to_restore", json!({})), Value::Null);

    ok(&app, "remember_screen", json!({ "screen": "week" }));
    assert_eq!(ok(&app, "screen_to_restore", json!({})), json!("week"));
}

#[test]
fn the_last_notebook_is_remembered_across_launches() {
    let (_lock, app, dir) = app_with_notebook();

    let remembered = ok(&app, "last_notebook", json!({}));
    assert_eq!(remembered, json!(dir.path()));
}

#[test]
fn external_changes_reach_the_frontend_as_events() {
    // The Syncthing scenario: something else writes the file, and the app has
    // to hear about it without polling.
    use tauri::Listener;

    let (_lock, app, dir) = app_with_notebook();
    let (tx, rx) = std::sync::mpsc::channel();

    app.listen_any("notebook://changed", move |event| {
        let _ = tx.send(event.payload().to_string());
    });

    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] escrita por outro app\n",
    )
    .unwrap();

    let payload = rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .expect("an external write should emit a change event");

    let change: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(change["kind"], "list");
    assert!(change["path"].as_str().unwrap().ends_with("task-list.md"));
}

#[test]
fn opening_a_second_notebook_switches_the_open_one() {
    let (_lock, app, first) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "SoNoPrimeiro" }));

    let second = tempfile::tempdir().unwrap();
    ok(&app, "open_notebook", json!({ "path": second.path() }));

    let info = ok(&app, "current_notebook", json!({}));
    assert_eq!(info["path"], json!(second.path()));
    assert_eq!(info["lists"], json!([{"path": "jott.tasks/completed.md", "name": "completed", "space": "Tasks"}, {"path": "jott.tasks/task-list.md", "name": "task-list", "space": "Tasks"}]));

    // The first notebook is untouched on disk, just no longer open.
    assert!(first.path().join("jott.tasks/SoNoPrimeiro.md").is_file());
}

#[test]
fn the_snapshot_answers_everything_in_one_call() {
    // Every UI action used to fan out into four invokes; the auto-save fires
    // that on every pause in typing. One round trip keeps the cost flat as
    // notebooks grow — and nothing is cached, the files stay the truth.
    let (_lock, app, dir) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Compras" }));
    ok(
        &app,
        "create_task",
        json!({ "list": "jott.tasks/Compras.md", "text": "Comprar leite" }),
    );
    std::fs::write(
        dir.path()
            .join("jott.tasks/Compras.sync-conflict-20260721-090000-ABC.md"),
        "- [ ] versão do celular\n",
    )
    .unwrap();

    let snap = ok(&app, "notebook_snapshot", json!({}));

    assert_eq!(snap["info"]["lists"], json!([{"path": "jott.tasks/Compras.md", "name": "Compras", "space": "Tasks"}, {"path": "jott.tasks/completed.md", "name": "completed", "space": "Tasks"}, {"path": "jott.tasks/task-list.md", "name": "task-list", "space": "Tasks"}]));
    assert_eq!(snap["info"]["layout"]["inbox"], "jott.tasks/task-list.md");
    assert_eq!(snap["info"]["layout"]["completed"], "jott.tasks/completed.md");
    // The core's folder name, never "" — an empty one sent every note the
    // Home created into the space's root instead of the Inbox.
    assert_eq!(snap["info"]["layout"]["notesInbox"], "Inbox");
    assert_eq!(snap["counts"]["jott.tasks/Compras.md"], json!(1));
    assert_eq!(snap["conflicts"].as_array().unwrap().len(), 1);
    assert_eq!(snap["clock"]["today"].as_str().unwrap().len(), 10);
}

#[test]
fn a_spaced_list_survives_complete_and_undo_over_the_bridge() {
    // The origin used to truncate at the first space, and undo then CREATED
    // a list named after the first word. Spaced names are a documented case.
    let (_lock, app, dir) = app_with_notebook();
    ok(&app, "create_list", json!({ "folder": "jott.tasks", "name": "Meu Mercado" }));
    let id = task_with_id(&app, "jott.tasks/Meu Mercado.md", "Comprar arroz");

    ok(&app, "complete_task", json!({ "list": "jott.tasks/Meu Mercado.md", "id": id }));
    let completed =
        std::fs::read_to_string(dir.path().join("jott.tasks/completed.md")).unwrap();
    assert!(completed.contains("origin:\"Meu Mercado\""), "{completed}");

    ok(&app, "uncomplete_task", json!({ "list": "jott.tasks/completed.md", "id": id }));
    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/Meu Mercado.md" }));
    assert_eq!(tasks[0]["text"], "Comprar arroz");
    assert!(
        !dir.path().join("jott.tasks/Meu.md").exists(),
        "no ghost list named after the first word"
    );
}

#[test]
fn hostile_fields_are_normalized_by_the_core_not_trusted_to_the_ui() {
    // A spaced tag written raw would turn the whole metadata line into
    // description on the next read — silently deleting the date with it. The
    // rule lives in the core so every client is covered, not just our UI.
    let (_lock, app, _dir) = app_with_notebook();
    let id = task_with_id(&app, "jott.tasks/task-list.md", "Comprar material");

    ok(
        &app,
        "set_task_fields",
        json!({ "list": "jott.tasks/task-list.md", "id": id, "fields": {
            "due": "2026-07-25",
            "tags": ["casa nova", "#urgent", "casa nova", "  "],
            "text": "Comprar\nmaterial",
            "subtasks": [{ "text": "Cimento\nCP-II", "done": false }]
        }}),
    );

    let tasks = ok(&app, "list_tasks", json!({ "list": "jott.tasks/task-list.md" }));
    assert_eq!(tasks[0]["tags"], json!(["casa-nova", "urgent"]));
    assert_eq!(tasks[0]["due"], "2026-07-25", "the date must survive the tag");
    assert_eq!(tasks[0]["text"], "Comprar material");
    assert_eq!(tasks[0]["subtasks"][0]["text"], "Cimento CP-II");
}

#[test]
fn a_hand_written_space_crosses_the_bridge_intact() {
    // The community-template promise end to end: a hand-written space of
    // a type this build ships must open and expose its list; one of an
    // invented type must arrive flagged as unknown — and the file on disk
    // must not change by one byte for having been looked at.
    let (_lock, app, dir) = app_with_notebook();

    let sp = dir.path().join("Project A");
    std::fs::create_dir_all(&sp).unwrap();
    std::fs::write(
        sp.join(".space.json"),
        r#"{ "schemaVersion": 1, "type": "tasks", "name": "Project A" }"#,
    )
    .unwrap();
    std::fs::write(sp.join("Sprint.md"), "- [ ] shipar\n").unwrap();

    let holo = dir.path().join("Do Futuro");
    std::fs::create_dir_all(&holo).unwrap();
    std::fs::write(
        holo.join(".space.json"),
        r#"{ "schemaVersion": 1, "type": "hologram", "shader": "neon" }"#,
    )
    .unwrap();

    let spaces = ok(&app, "notebook_snapshot", json!({}))["spaces"].clone();
    let list = spaces.as_array().unwrap();

    // The three fixed ones plus the hand-written ones, flagged apart.
    let fixed: Vec<&str> = list
        .iter()
        .filter(|w| w["fixed"] == json!(true))
        .map(|w| w["folderName"].as_str().unwrap())
        .collect();
    assert_eq!(fixed, vec!["jott.home", "jott.notes", "jott.tasks"]);

    let project = list
        .iter()
        .find(|w| w["folderName"] == "Project A")
        .expect("the hand-written space must be discovered");
    assert_eq!(project["name"], "Project A");
    assert_eq!(project["fixed"], json!(false));
    assert_eq!(project["kind"], "tasks");
    assert_eq!(project["known"], json!(true));
    assert_eq!(project["path"], "Project A");

    let future = list
        .iter()
        .find(|w| w["folderName"] == "Do Futuro")
        .expect("the unknown space must be delivered, not dropped");
    assert_eq!(future["kind"], "hologram");
    assert_eq!(future["known"], json!(false), "unknown, never dropped");

    // Its list joined the notebook, addressed by path.
    let lists = ok(&app, "list_names", json!({}));
    assert!(lists
        .as_array()
        .unwrap()
        .iter()
        .any(|l| l["path"] == "Project A/Sprint.md"));

    // And looking never wrote: the unknown space's config is the author's.
    let on_disk = std::fs::read_to_string(holo.join(".space.json")).unwrap();
    assert!(on_disk.contains("shader"), "unknown keys survive");
}

#[test]
fn space_sort_and_order_round_trip_over_the_bridge() {
    // The ordering preference lives in the space's own `.space.json`,
    // set by two commands and read back in the snapshot.
    let (_lock, app, dir) = app_with_notebook();
    ok(
        &app,
        "create_space_in",
        json!({ "name": "Space 1", "kind": "tasks", "group": null }),
    );

    ok(
        &app,
        "set_space_sort",
        json!({ "space": "Space 1", "sort": "name" }),
    );
    ok(
        &app,
        "set_space_order",
        json!({ "space": "Space 1", "order": ["b2", "a1"] }),
    );

    let spaces = ok(&app, "notebook_snapshot", json!({}))["spaces"].clone();
    let space = spaces
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["folderName"] == "Space 1")
        .unwrap()
        .clone();
    // set_space_order also switches to the dragged arrangement.
    assert_eq!(space["sort"], "custom");
    assert_eq!(space["order"], json!(["b2", "a1"]));

    let on_disk =
        std::fs::read_to_string(dir.path().join("Space 1/.space.json")).unwrap();
    assert!(on_disk.contains("\"order\""), "{on_disk}");
    // And the type the space was born with survives the rewrite.
    assert!(on_disk.contains("\"type\": \"tasks\""), "{on_disk}");
}

#[test]
fn a_new_space_is_born_usable_over_the_bridge() {
    // Creating a tasks space delivers its list and Completed on arrival;
    // a notes one is just the marked folder.
    let (_lock, app, dir) = app_with_notebook();
    ok(
        &app,
        "create_space_in",
        json!({ "name": "Errands", "kind": "tasks", "group": null }),
    );
    ok(
        &app,
        "create_space_in",
        json!({ "name": "Journal", "kind": "notes", "group": null }),
    );

    assert!(dir.path().join("Errands/task-list.md").is_file());
    assert!(dir.path().join("Errands/completed.md").is_file());
    assert!(dir.path().join("Journal/.space.json").is_file());
    assert!(!dir.path().join("Journal/task-list.md").exists());

    // An unknown type is refused at the door.
    assert!(invoke(
        &app,
        "create_space_in",
        json!({ "name": "X", "kind": "hologram", "group": null })
    )
    .is_err());
}

#[test]
fn pinning_a_task_over_the_bridge_writes_the_hidden_field() {
    // The card's bookmark: pinning is filing, so it rides in the comment and
    // never becomes a `#pinned` tag.
    let (_lock, app, dir) = app_with_notebook();
    let list = "jott.tasks/task-list.md";
    ok(&app, "create_task", json!({ "list": list, "text": "Pagar boleto" }));
    let id = ok(&app, "ensure_task_id", json!({ "list": list, "position": 0 }));
    let id = id.as_str().unwrap().to_string();

    ok(
        &app,
        "set_task_pinned",
        json!({ "list": list, "id": id, "pinned": true }),
    );
    let tasks = ok(&app, "list_tasks", json!({ "list": list }));
    assert_eq!(tasks[0]["pinned"], json!(true));
    let on_disk = std::fs::read_to_string(dir.path().join(list)).unwrap();
    assert!(on_disk.contains("pinned:true"), "{on_disk}");
    assert!(!on_disk.contains("#pinned"), "{on_disk}");

    ok(
        &app,
        "set_task_pinned",
        json!({ "list": list, "id": id, "pinned": false }),
    );
    let tasks = ok(&app, "list_tasks", json!({ "list": list }));
    assert_eq!(tasks[0]["pinned"], json!(false));
}

#[test]
fn an_unknown_space_type_does_not_take_the_notebook_down() {
    // A broken or future template must degrade politely: an unknown
    // space is kept and flagged, and its healthy siblings still work.
    let (_lock, app, dir) = app_with_notebook();
    for (folder, cfg) in [
        ("Ok", r#"{ "schemaVersion": 1, "type": "tasks" }"#),
        ("Weird", r#"{ "schemaVersion": 1, "type": "quantum" }"#),
    ] {
        let d = dir.path().join(folder);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join(".space.json"), cfg).unwrap();
    }

    let spaces = ok(&app, "notebook_snapshot", json!({}))["spaces"].clone();
    let find = |name: &str| {
        spaces
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["folderName"] == name)
            .unwrap()
            .clone()
    };
    assert_eq!(find("Ok")["known"], json!(true), "the healthy sibling works");
    assert_eq!(find("Weird")["kind"], "quantum");
    assert_eq!(find("Weird")["known"], json!(false), "unknown, never dropped");
}

#[test]
fn the_note_lifecycle_over_the_bridge() {
    // Phase 8's exit criterion, driven through the real IPC: jot it down,
    // find it by search, delete it — with the file readable outside the app.
    let (_lock, app, dir) = app_with_notebook();

    let path = ok(
        &app,
        "create_note",
        json!({ "folder": "jott.notes", "inFolder": "", "title": "Ideia de produto" }),
    );
    let path = path.as_str().unwrap().to_string();
    assert_eq!(path, "Ideia de produto.md");

    ok(
        &app,
        "write_note",
        json!({ "folder": "jott.notes", "path": path, "body": "Um leitor de markdown.\n" }),
    );

    let note = ok(&app, "read_note", json!({ "folder": "jott.notes", "path": path }));
    assert_eq!(note["title"], "Ideia de produto");
    assert_eq!(note["body"], "Um leitor de markdown.\n");
    assert_eq!(note["pinned"], json!(false));
    assert!(note["created"].is_string(), "the app adopted a creation date");

    let found = ok(
        &app,
        "list_notes",
        json!({ "folder": "jott.notes", "query": "leitor" }),
    );
    assert_eq!(found.as_array().unwrap().len(), 1);
    assert_eq!(found[0]["title"], "Ideia de produto");
    assert_eq!(found[0]["folder"], "");
    assert!(found[0]["preview"].as_str().unwrap().contains("markdown"));

    // Readable outside the app, in the documented shape.
    let on_disk =
        std::fs::read_to_string(dir.path().join("jott.notes/Ideia de produto.md")).unwrap();
    assert!(on_disk.starts_with("---\ncreated: "), "{on_disk}");
    assert!(on_disk.ends_with("---\n\nUm leitor de markdown.\n"));

    ok(&app, "delete_note", json!({ "folder": "jott.notes", "path": path }));
    let left = ok(&app, "list_notes", json!({ "folder": "jott.notes" }));
    assert_eq!(left, json!([]));
}

#[test]
fn notes_can_be_pinned_renamed_moved_and_foldered() {
    let (_lock, app, dir) = app_with_notebook();
    let path = ok(
        &app,
        "create_note",
        json!({ "folder": "jott.notes", "inFolder": "", "title": "rascunho" }),
    );
    let path = path.as_str().unwrap().to_string();

    ok(
        &app,
        "set_note_pinned",
        json!({ "folder": "jott.notes", "path": path, "pinned": true }),
    );
    let listed = ok(&app, "list_notes", json!({ "folder": "jott.notes" }));
    assert_eq!(listed[0]["pinned"], json!(true));

    let renamed = ok(
        &app,
        "rename_note",
        json!({ "folder": "jott.notes", "path": path, "title": "Ideia boa" }),
    );
    let renamed = renamed.as_str().unwrap().to_string();
    assert_eq!(renamed, "Ideia boa.md");

    ok(
        &app,
        "create_note_folder",
        json!({ "folder": "jott.notes", "path": "Clientes/Acme" }),
    );
    let moved = ok(
        &app,
        "move_note",
        json!({ "folder": "jott.notes", "path": renamed, "toFolder": "Clientes/Acme" }),
    );
    assert_eq!(moved, "Clientes/Acme/Ideia boa.md");
    assert!(dir.path().join("jott.notes/Clientes/Acme/Ideia boa.md").is_file());

    // A folder is an OBJECT now (2026-08-19): its address, plus the colour and
    // the pin the space remembers for it.
    let folders = ok(&app, "note_folders", json!({ "folder": "jott.notes" }));
    let paths: Vec<&str> = folders
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["path"].as_str().unwrap())
        .collect();
    assert!(paths.contains(&"Clientes/Acme"));

    ok(
        &app,
        "set_note_folder_color",
        json!({ "folder": "jott.notes", "path": "Clientes", "color": "red" }),
    );
    ok(
        &app,
        "set_note_folder_pinned",
        json!({ "folder": "jott.notes", "path": "Clientes", "pinned": true }),
    );
    let folders = ok(&app, "note_folders", json!({ "folder": "jott.notes" }));
    let clientes = folders
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == "Clientes")
        .unwrap()
        .clone();
    assert_eq!(clientes["color"], "red");
    assert_eq!(clientes["pinned"], true);
    // And it is the SPACE that remembers, not a marker inside the user's
    // folder — nothing was written into `Clientes/`.
    assert!(!dir.path().join("jott.notes/Clientes/.space.json").exists());
    assert!(dir
        .path()
        .join("jott.notes/.space.json")
        .to_path_buf()
        .is_file());
}

#[test]
fn a_note_address_that_escapes_is_refused_by_the_bridge() {
    let (_lock, app, _dir) = app_with_notebook();

    let err = invoke(
        &app,
        "read_note",
        json!({ "folder": "jott.notes", "path": "../../etc/passwd.md" }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "invalidNotePath");

    // And a widget that is not a notes widget cannot be addressed as one.
    let err = invoke(&app, "list_notes", json!({ "folder": "jott.tasks" })).unwrap_err();
    assert_eq!(err["kind"], "invalidNotePath");
}

#[test]
fn a_deleted_note_is_recoverable_from_the_trash() {
    // Deleting through the app must never destroy the file: the user can
    // change their mind, and the notebook is a plain folder they own.
    let (_lock, app, dir) = app_with_notebook();
    let path = ok(
        &app,
        "create_note",
        json!({ "folder": "jott.notes", "inFolder": "", "title": "some" }),
    );
    let path = path.as_str().unwrap().to_string();
    ok(
        &app,
        "write_note",
        json!({ "folder": "jott.notes", "path": path, "body": "vale a pena guardar\n" }),
    );

    ok(&app, "delete_note", json!({ "folder": "jott.notes", "path": path }));

    assert!(!dir.path().join("jott.notes/some.md").exists(), "gone from the notebook");
    // Reestruturação 2026-07-30: the internal trash lives inside the notebook.
    let trashed = dir.path().join(".jott/trash/items/some.md");
    assert!(trashed.is_file(), "and still on disk, recoverable by hand");
    assert!(std::fs::read_to_string(&trashed)
        .unwrap()
        .contains("vale a pena guardar"));
}

#[test]
fn the_phase_nine_settings_round_trip_and_reach_the_layout() {
    let (_lock, app, dir) = app_with_notebook();

    let defaults = ok(&app, "notebook_settings", json!({}));
    assert_eq!(defaults["dateDisplayFormat"], "mm/dd/yyyy");
    assert_eq!(defaults["closeInspectorOnClickAway"], json!(false));
    assert_eq!(defaults["quickNoteFolder"], "Inbox");

    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": {
            "dateDisplayFormat": "yyyy/mm/dd",
            "closeInspectorOnClickAway": true,
            "quickNoteFolder": "Clientes"
        }}),
    );

    let saved = ok(&app, "notebook_settings", json!({}));
    assert_eq!(saved["dateDisplayFormat"], "yyyy/mm/dd");
    assert_eq!(saved["closeInspectorOnClickAway"], json!(true));
    assert_eq!(saved["quickNoteFolder"], "Clientes");

    // The screens read these off the snapshot, not by asking separately.
    let snap = ok(&app, "notebook_snapshot", json!({}));
    assert_eq!(snap["info"]["layout"]["dateDisplayFormat"], "yyyy/mm/dd");
    assert_eq!(snap["info"]["layout"]["closeInspectorOnClickAway"], json!(true));
    assert_eq!(snap["info"]["layout"]["quickNoteFolder"], "Clientes");

    // And it really reached the file.
    let on_disk = std::fs::read_to_string(dir.path().join(".jott/config.json")).unwrap();
    assert!(on_disk.contains("yyyy/mm/dd"), "{on_disk}");
}

#[test]
fn a_nonsense_display_setting_is_normalized_instead_of_stored_wrong() {
    // A date shown wrong is worse than a date shown plainly, so the core
    // falls back rather than keeping a pattern it cannot render.
    let (_lock, app, _dir) = app_with_notebook();

    ok(
        &app,
        "set_notebook_settings",
        json!({ "settings": { "dateDisplayFormat": "banana", "quickNoteFolder": "   " } }),
    );

    let saved = ok(&app, "notebook_settings", json!({}));
    assert_eq!(saved["dateDisplayFormat"], "mm/dd/yyyy");
    assert_eq!(saved["quickNoteFolder"], "Inbox", "an empty folder is no folder");
}

#[test]
fn groups_nest_and_report_their_parent_over_the_bridge() {
    // What the sidebar draws its column from: every group, the group it sits
    // in, and the members it holds directly — in the notebook's own order.
    let (_lock, app, dir) = app_with_notebook();

    // Groups and spaces are addressed by their root-relative PATH
    // (2026-08-13): two groups may each hold a `Tasks/`, and by leaf name they
    // were the same address.
    ok(&app, "create_group", json!({ "name": "Design" }));
    ok(&app, "create_group", json!({ "name": "Clients", "group": "Design" }));
    ok(
        &app,
        "create_space_in",
        json!({ "name": "Acme", "kind": "tasks", "group": "Design/Clients" }),
    );
    assert!(dir.path().join("Design/Clients/Acme/task-list.md").is_file());

    let groups = ok(&app, "groups", json!({}));
    let of = |folder: &str| {
        groups
            .as_array()
            .unwrap()
            .iter()
            .find(|g| g["folder"] == folder)
            .unwrap()
            .clone()
    };
    assert_eq!(of("Design")["parent"], Value::Null);
    assert_eq!(of("Design/Clients")["parent"], "Design");
    // Acme belongs to Clients, not to the group above it.
    assert_eq!(of("Design")["spaces"], json!([]));
    assert_eq!(of("Design/Clients")["spaces"], json!(["Design/Clients/Acme"]));

    // Moving the branch out to the root carries everything under it.
    ok(&app, "move_group", json!({ "name": "Design/Clients", "intoGroup": null }));
    assert!(dir.path().join("Clients/Acme/task-list.md").is_file());
    let groups = ok(&app, "groups", json!({}));
    let clients = groups
        .as_array()
        .unwrap()
        .iter()
        .find(|g| g["folder"] == "Clients")
        .unwrap();
    assert_eq!(clients["parent"], Value::Null);

    // A group cannot be moved inside itself.
    assert!(invoke(
        &app,
        "move_group",
        json!({ "name": "Clients", "intoGroup": "Clients" })
    )
    .is_err());
}

#[test]
fn a_space_moved_into_a_group_keeps_its_pulled_tasks() {
    // The move rewrites every list address under the folder; a Day reference
    // left pointing at the old path reads as a task that vanished.
    let (_lock, app, _dir) = app_with_notebook();
    ok(&app, "create_group", json!({ "name": "Design" }));
    ok(&app, "create_space_in", json!({ "name": "Acme", "kind": "tasks", "group": null }));

    let id = task_with_id(&app, "Acme/task-list.md", "call the client");
    ok(
        &app,
        "pull_into_period",
        json!({ "period": "day", "list": "Acme/task-list.md", "id": id }),
    );

    ok(&app, "move_space", json!({ "name": "Acme", "intoGroup": "Design" }));

    let day = ok(&app, "notebook_snapshot", json!({}))["day"].clone();
    assert_eq!(day[0]["path"], "Design/Acme/task-list.md");
    assert_eq!(
        ok(&app, "period_tasks", json!({ "period": "day" }))
            .as_array()
            .unwrap()
            .len(),
        1,
        "the pulled task must still be in today"
    );
}

#[test]
fn an_image_crosses_the_bridge_as_base64_and_becomes_a_banner() {
    // The whole assets round trip, over the same commands the interface calls:
    // import a picture, see it listed, hang it on a note, read the note back.
    let (_lock, app, dir) = app_with_notebook();

    // "Zm9v" is "foo" — the bytes do not have to be a real PNG for the file to
    // be the file, and a real one in a test fixture would test the fixture.
    let address = ok(
        &app,
        "import_asset",
        json!({ "name": "foto.png", "data": "Zm9v" }),
    );
    assert_eq!(address, json!("assets/foto.png"));
    assert_eq!(
        std::fs::read(dir.path().join("assets/foto.png")).unwrap(),
        b"foo"
    );

    let listed = ok(&app, "assets", json!({}));
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(listed[0]["name"], json!("foto.png"));
    assert_eq!(listed[0]["path"], json!("assets/foto.png"));
    assert_eq!(listed[0]["size"], json!(3));

    let note = ok(
        &app,
        "create_note",
        json!({ "folder": "jott.notes", "inFolder": "Inbox", "title": "com banner" }),
    );
    let note = note.as_str().unwrap();
    ok(
        &app,
        "set_note_banner",
        json!({ "folder": "jott.notes", "path": note, "banner": "assets/foto.png" }),
    );

    // The editor gets the body WITHOUT the banner line, and the banner beside
    // it, typed so the interface knows whether to draw a colour or an image.
    let read = ok(
        &app,
        "read_note",
        json!({ "folder": "jott.notes", "path": note }),
    );
    assert_eq!(read["banner"], json!({ "kind": "image", "value": "assets/foto.png" }));
    assert_eq!(read["body"], json!(""));

    // Writing the body back does not take the banner off.
    ok(
        &app,
        "write_note",
        json!({ "folder": "jott.notes", "path": note, "body": "Texto.\n" }),
    );
    let read = ok(
        &app,
        "read_note",
        json!({ "folder": "jott.notes", "path": note }),
    );
    assert_eq!(read["banner"], json!({ "kind": "image", "value": "assets/foto.png" }));
    assert_eq!(read["body"], json!("Texto.\n"));

    // And the board's listing carries it, so a card draws without a second read.
    let notes = ok(
        &app,
        "list_notes",
        json!({ "folder": "jott.notes", "query": null }),
    );
    assert_eq!(
        notes[0]["banner"],
        json!({ "kind": "image", "value": "assets/foto.png" })
    );

    // Clearing it is the same command with nothing in it.
    ok(
        &app,
        "set_note_banner",
        json!({ "folder": "jott.notes", "path": note, "banner": null }),
    );
    let read = ok(
        &app,
        "read_note",
        json!({ "folder": "jott.notes", "path": note }),
    );
    assert_eq!(read["banner"], json!(null));

    // Deleting the picture files it in the trash, like everything else.
    ok(&app, "delete_asset", json!({ "path": "assets/foto.png" }));
    assert!(!dir.path().join("assets/foto.png").exists());
    assert_eq!(ok(&app, "assets", json!({})).as_array().unwrap().len(), 0);
}

#[test]
fn what_is_not_a_file_of_this_notebook_is_refused_over_the_bridge() {
    let (_lock, app, _dir) = app_with_notebook();

    // A payload that is not base64 is refused rather than written half-decoded.
    assert!(invoke(&app, "import_asset", json!({ "name": "a.png", "data": "não!" })).is_err());
    // A name that cannot be a file name.
    assert!(invoke(&app, "import_asset", json!({ "name": "..", "data": "Zm9v" })).is_err());
    // An address that reaches outside the library.
    assert!(invoke(&app, "delete_asset", json!({ "path": "../.jott/config.json" })).is_err());

    // What is NOT refused any more (2026-08-18): a file that is not an image.
    // The library holds whatever a task attaches; only a banner and a note's
    // `![](…)` still ask for something the app can draw.
    let address = ok(&app, "import_asset", json!({ "name": "notas.pdf", "data": "Zm9v" }));
    assert_eq!(address, json!("assets/notas.pdf"));
    let listed = ok(&app, "assets", json!({}));
    assert_eq!(listed[0]["image"], json!(false));
}

#[test]
fn a_note_moves_to_another_space_over_the_bridge() {
    // What "Select notes… → move to" does, end to end.
    let (_lock, app, dir) = app_with_notebook();
    let target =
        ok(&app, "create_space_in", json!({ "name": "Ideias", "kind": "notes", "group": null }));
    let target = target.as_str().unwrap();

    let note = ok(
        &app,
        "create_note",
        json!({ "folder": "jott.notes", "inFolder": "Inbox", "title": "viajante" }),
    );
    let moved = ok(
        &app,
        "move_note_to_space",
        json!({
            "folder": "jott.notes",
            "path": note.as_str().unwrap(),
            "toSpace": target,
            "toFolder": "",
        }),
    );
    assert_eq!(moved, json!("viajante.md"));
    assert!(dir.path().join(target).join("viajante.md").is_file());
    assert!(ok(&app, "list_notes", json!({ "folder": "jott.notes", "query": null }))
        .as_array()
        .unwrap()
        .is_empty());
}

#[test]
fn the_webview_may_load_the_notebooks_images_and_nothing_else() {
    // The one place the webview reaches a file WITHOUT going through a command
    // (2026-08-18): an `<img>` cannot call `invoke`, so a banner is loaded by
    // URL through Tauri's asset protocol. What that protocol will answer for is
    // this scope — empty in `tauri.conf.json`, filled when a notebook opens.
    //
    // Worth a test of its own because the alternative was a scope of `**` in
    // the config: every file on the machine reachable from the webview, in
    // order to draw pictures from one directory.
    use tauri::Manager;
    let (_lock, app, dir) = app_with_notebook();

    let scope = app.asset_protocol_scope();
    assert!(scope.is_allowed(dir.path().join("assets/foto.png")));
    // Not the notebook's config, not its notes, not the machine.
    assert!(!scope.is_allowed(dir.path().join(".jott/config.json")));
    assert!(!scope.is_allowed(dir.path().join("jott.notes/Inbox/nota.md")));
    assert!(!scope.is_allowed("/etc/passwd"));
}

#[test]
fn a_task_carries_its_attachments_over_the_bridge() {
    // "Add files" (2026-08-18): the file goes into the notebook's library, and
    // the task points at it with a Markdown link on a line of its own.
    let (_lock, app, dir) = app_with_notebook();
    let inbox = "jott.tasks/task-list.md";

    ok(&app, "import_asset", json!({ "name": "nota-fiscal.pdf", "data": "Zm9v" }));
    let id = task_with_id(&app, inbox, "Enviar proposta");

    ok(
        &app,
        "set_task_fields",
        json!({
            "list": inbox,
            "id": id,
            "fields": {
                "files": [{ "label": "nota-fiscal.pdf", "address": "assets/nota-fiscal.pdf" }],
            },
        }),
    );

    // On disk it is a plain link, readable and clickable in any editor.
    let text = std::fs::read_to_string(dir.path().join(inbox)).unwrap();
    assert!(text.contains("[nota-fiscal.pdf](assets/nota-fiscal.pdf)"), "{text}");

    // And it comes back with the task.
    let tasks = ok(&app, "list_tasks", json!({ "list": inbox }));
    assert_eq!(
        tasks[0]["files"],
        json!([{ "label": "nota-fiscal.pdf", "address": "assets/nota-fiscal.pdf" }])
    );

    // Removing is the same call with the list it should end up as.
    ok(
        &app,
        "set_task_fields",
        json!({ "list": inbox, "id": id, "fields": { "files": [] } }),
    );
    let tasks = ok(&app, "list_tasks", json!({ "list": inbox }));
    assert_eq!(tasks[0]["files"], json!([]));
    assert!(!std::fs::read_to_string(dir.path().join(inbox)).unwrap().contains("assets/"));
}

#[test]
fn an_attachment_outside_the_library_is_dropped_rather_than_written() {
    // The app can only open what it put in `assets/`, so it must not write a
    // link it could not honour — the parser would read it back as description
    // anyway (core/src/task.rs).
    let (_lock, app, dir) = app_with_notebook();
    let inbox = "jott.tasks/task-list.md";
    let id = task_with_id(&app, inbox, "Tarefa");

    ok(
        &app,
        "set_task_fields",
        json!({
            "list": inbox,
            "id": id,
            "fields": {
                "files": [
                    { "label": "web", "address": "https://exemplo.com" },
                    { "label": "fuga", "address": "assets/../.jott/config.json" },
                    { "label": "ok.png", "address": "assets/ok.png" },
                ],
            },
        }),
    );

    let text = std::fs::read_to_string(dir.path().join(inbox)).unwrap();
    assert!(text.contains("[ok.png](assets/ok.png)"), "{text}");
    assert!(!text.contains("exemplo.com"), "{text}");
    assert!(!text.contains("config.json"), "{text}");
}

#[test]
fn only_a_file_of_the_library_can_be_opened() {
    // `open_asset` hands a path to the desktop, so what it accepts is the
    // whole of its security: a direct child of `assets/`, and one that exists.
    let (_lock, app, _dir) = app_with_notebook();
    ok(&app, "import_asset", json!({ "name": "nota.pdf", "data": "Zm9v" }));

    for path in [
        "assets/../.jott/config.json",
        "jott.notes/Inbox/nota.md",
        "/etc/passwd",
        "assets/nao-existe.pdf",
    ] {
        assert!(invoke(&app, "open_asset", json!({ "path": path })).is_err(), "{path}");
    }
}

#[test]
fn the_window_lets_the_webview_handle_its_own_drops() {
    // Dropping a file into a note only reaches the DOM when Tauri's own
    // drag-drop handler is OFF (user report, 2026-08-19: the drop did
    // nothing). The key is easy to misspell and serde would ignore it in
    // silence, so the real config is parsed and asked.
    let text = std::fs::read_to_string("tauri.conf.json").unwrap();
    let config: tauri::utils::config::Config = serde_json::from_str(&text).unwrap();
    let window = &config.app.windows[0];

    assert!(
        !window.drag_drop_enabled,
        "the webview must handle drops itself, or the editor never sees one"
    );
}
