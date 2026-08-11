//! Workspace discovery against the real filesystem (phase 7, step A;
//! rewritten 2026-08-11 for the no-widget model).
//!
//! The rule under test: a folder is a workspace when — and only when — it
//! carries a `.workspace.json`. Everything else in the notebook stays
//! invisible, no matter how much it looks like content. A workspace has a
//! single function (`type`) and owns its files directly.

use jott_core::{Notebook, Workspace};

fn notebook() -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let nb = Notebook::init(dir.path()).unwrap();
    (dir, nb)
}

fn make_workspace(root: &std::path::Path, name: &str, config: &str) {
    let dir = root.join(name);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(".workspace.json"), config).unwrap();
}

#[test]
fn only_marked_folders_are_workspaces() {
    let (dir, nb) = notebook();
    make_workspace(dir.path(), "Project A", r#"{ "schemaVersion": 1, "type": "tasks" }"#);

    // Folders without the marker — however plausible — are not interface.
    std::fs::create_dir_all(dir.path().join("Downloads")).unwrap();
    std::fs::create_dir_all(dir.path().join("attachments")).unwrap();
    // A stray file at the first level is not one either.
    std::fs::write(dir.path().join("README.md"), "hi\n").unwrap();

    let names: Vec<String> = nb
        .workspaces()
        .unwrap()
        .iter()
        .map(|w| w.folder_name().to_string())
        .collect();
    // The three fixed workspaces exist since init (step D), plus the marked
    // one. They carry the `jott.` prefix, so the plain names are the user's.
    assert_eq!(names, vec!["Project A", "jott.home", "jott.notes", "jott.tasks"]);
}

#[test]
fn the_fixed_workspaces_are_born_typed_and_usable() {
    let (dir, nb) = notebook();
    let kinds: Vec<(String, String)> = nb
        .workspaces()
        .unwrap()
        .iter()
        .map(|w| (w.folder_name().to_string(), w.kind().to_string()))
        .collect();
    assert!(kinds.contains(&("jott.home".into(), "home".into())));
    assert!(kinds.contains(&("jott.tasks".into(), "tasks".into())));
    assert!(kinds.contains(&("jott.notes".into(), "notes".into())));

    // The fixed Tasks workspace is a single list plus its Completed (spec
    // 3.5) — the inbox of the notebook. The list keeps the plain name: it is
    // the file the user opens in another editor.
    assert!(dir.path().join("jott.tasks/Tasks.md").is_file());
    assert!(dir.path().join("jott.tasks/Completed.md").is_file());
    assert_eq!(Notebook::inbox_path(), "jott.tasks/Tasks.md");
}

#[test]
fn the_config_folder_is_never_a_workspace() {
    let (dir, nb) = notebook();
    // Even sabotaged with a marker, a hidden folder stays invisible.
    std::fs::write(
        dir.path().join(".jott/.workspace.json"),
        r#"{ "schemaVersion": 1 }"#,
    )
    .unwrap();

    let names: Vec<String> = nb
        .workspaces()
        .unwrap()
        .iter()
        .map(|w| w.folder_name().to_string())
        .collect();
    assert_eq!(names, vec!["jott.home", "jott.notes", "jott.tasks"], "no .jott in here");
}

#[test]
fn workspaces_come_back_sorted_by_folder_name() {
    let (dir, nb) = notebook();
    for name in ["Zeta", "Alpha", "Meu Espaço"] {
        make_workspace(dir.path(), name, r#"{ "schemaVersion": 1, "type": "notes" }"#);
    }

    let names: Vec<String> = nb
        .workspaces()
        .unwrap()
        .iter()
        .map(|w| w.folder_name().to_string())
        .collect();
    assert_eq!(
        names,
        vec!["Alpha", "Meu Espaço", "Zeta", "jott.home", "jott.notes", "jott.tasks"]
    );
}

#[test]
fn a_template_from_the_future_opens_but_stays_untouchable() {
    // The community-template scenario end to end: unzip a folder written by
    // a newer version into the notebook, and nothing breaks, nothing is lost.
    let (dir, nb) = notebook();
    make_workspace(
        dir.path(),
        "Do Futuro",
        r#"{ "schemaVersion": 99, "type": "hologram", "shader": "neon" }"#,
    );

    let workspaces = nb.workspaces().unwrap();
    let ws = workspaces
        .iter()
        .find(|w| w.folder_name() == "Do Futuro")
        .unwrap();
    assert!(ws.config.is_read_only());
    assert!(!ws.config.is_known());
    assert_eq!(ws.kind(), "hologram");
    assert!(ws.config.save(ws.config_path()).is_err(), "must refuse to rewrite");

    // The bytes on disk are exactly what the template author wrote.
    let on_disk = std::fs::read_to_string(dir.path().join("Do Futuro/.workspace.json")).unwrap();
    assert!(on_disk.contains("shader"));
}

#[test]
fn opening_a_workspace_directly_requires_the_marker() {
    let (dir, _nb) = notebook();
    std::fs::create_dir_all(dir.path().join("Solta")).unwrap();
    assert!(Workspace::open(dir.path().join("Solta")).is_err());
}

#[test]
fn a_second_tasks_workspace_feeds_lists_counts_and_suggestions() {
    // The point of the whole phase: a user workspace of type tasks joins the
    // navigation and the suggestions without touching the fixed Tasks/ — and
    // lists in different workspaces never get confused, being addressed by
    // full path. (2026-08-11: a tasks workspace is one list, named after its
    // folder; the fixed one is `Tasks/Tasks.md`.)
    use jott_core::state::Period;

    let (dir, nb) = notebook();
    nb.create_workspace("Project A", "tasks").unwrap();

    std::fs::write(
        dir.path().join("Project A/Project A.md"),
        "- [ ] tarefa do projeto\n",
    )
    .unwrap();
    std::fs::write(dir.path().join("jott.tasks/Tasks.md"), "- [ ] tarefa pessoal\n").unwrap();

    // Both lists are listed, distinguished by address.
    let lists = nb.lists().unwrap();
    let paths: Vec<&str> = lists.iter().map(|l| l.path.as_str()).collect();
    assert!(paths.contains(&"jott.tasks/Tasks.md"));
    assert!(paths.contains(&"Project A/Project A.md"));

    // Counts keyed by address never collide.
    let counts = nb.open_task_counts().unwrap();
    assert_eq!(counts.get("jott.tasks/Tasks.md"), Some(&1));
    assert_eq!(counts.get("Project A/Project A.md"), Some(&1));

    // The day suggests from both folders.
    let suggestions = nb.suggestions_for(Period::Day).unwrap();
    let texts: Vec<&str> = suggestions.iter().map(|s| s.task.text.as_str()).collect();
    assert!(texts.contains(&"tarefa do projeto"));
    assert!(texts.contains(&"tarefa pessoal"));

    // Completing in the project keeps everything inside the project's folder.
    let id = nb.ensure_task_id("Project A/Project A.md", 0).unwrap();
    nb.pull_into(Period::Day, "Project A/Project A.md", &id).unwrap();
    nb.complete_task("Project A/Project A.md", &id).unwrap();

    let completed =
        std::fs::read_to_string(dir.path().join("Project A/Completed.md")).unwrap();
    assert!(completed.contains("tarefa do projeto"));
    assert!(
        !std::fs::read_to_string(dir.path().join("jott.tasks/Completed.md"))
            .unwrap()
            .contains("tarefa do projeto"),
        "the fixed Completed must not receive another workspace's task"
    );

    // The personal inbox was never touched by any of it.
    assert_eq!(
        std::fs::read_to_string(dir.path().join("jott.tasks/Tasks.md")).unwrap(),
        "- [ ] tarefa pessoal\n"
    );

    // And the undo goes back to the project's own list.
    nb.uncomplete_task("Project A/Completed.md", &id).unwrap();
    assert!(
        std::fs::read_to_string(dir.path().join("Project A/Project A.md"))
            .unwrap()
            .contains("tarefa do projeto")
    );
}

#[test]
fn a_workspace_keeps_its_colour_and_unknown_keys_through_a_rewrite() {
    let (dir, nb) = notebook();
    make_workspace(
        dir.path(),
        "Project A",
        r##"{ "schemaVersion": 1, "type": "tasks", "color": "#8b5cf6", "future": true }"##,
    );

    let ws = nb
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "Project A")
        .unwrap();
    assert_eq!(ws.config.color.as_deref(), Some("#8b5cf6"));

    // Rewriting keeps the colour this build owns and the key it does not.
    let rendered = ws.config.render();
    assert!(rendered.contains("\"color\": \"#8b5cf6\""));
    assert!(rendered.contains("\"future\""));
}

#[test]
fn a_new_workspace_is_born_typed_and_usable() {
    let (dir, nb) = notebook();
    let folder = nb.create_workspace("My Project", "tasks").unwrap();
    assert_eq!(folder, "My Project");
    assert!(dir.path().join("My Project/.workspace.json").is_file());

    // A tasks workspace is born with its list (named after the folder) and
    // its Completed — usable on arrival, no second step.
    assert!(dir.path().join("My Project/My Project.md").is_file());
    assert!(dir.path().join("My Project/Completed.md").is_file());
    let ws = nb
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "My Project")
        .unwrap();
    assert_eq!(ws.kind(), "tasks");

    // A notes workspace just makes its folder + marker.
    nb.create_workspace("Journal", "notes").unwrap();
    assert!(dir.path().join("Journal/.workspace.json").is_file());
    assert!(!dir.path().join("Journal/Journal.md").exists());

    // Unknown type, duplicate and unsafe names are refused.
    assert!(nb.create_workspace("X", "hologram").is_err());
    assert!(nb.create_workspace("My Project", "tasks").is_err());
    assert!(nb.create_workspace("../escape", "tasks").is_err());
    assert!(nb.create_workspace("   ", "tasks").is_err());
    // `Completed` would collide with the workspace's own Completed.md.
    assert!(nb.create_workspace("Completed", "tasks").is_err());
}

#[test]
fn rename_workspace_sets_the_display_name_only() {
    let (dir, nb) = notebook();
    nb.create_workspace("proj", "tasks").unwrap();
    nb.rename_workspace("proj", "My Project").unwrap();

    let ws = nb
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "proj")
        .unwrap();
    assert_eq!(ws.display_name(), "My Project");
    // The folder — the identity — never moves.
    assert_eq!(ws.folder_name(), "proj");
    assert!(dir.path().join("proj").is_dir());
}

#[test]
fn workspace_appearance_persists_and_clears() {
    let (dir, nb) = notebook();
    nb.create_workspace("proj", "tasks").unwrap();
    nb.set_workspace_appearance("proj", Some("#8b5cf6".into()), Some("flag".into()))
        .unwrap();

    let reopened = Notebook::open(dir.path()).unwrap();
    let ws = reopened
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "proj")
        .unwrap();
    assert_eq!(ws.config.color.as_deref(), Some("#8b5cf6"));
    assert_eq!(ws.config.icon.as_deref(), Some("flag"));
    // Editing the appearance must not lose the type the workspace was born
    // with — the config is one file, rewritten whole.
    assert_eq!(ws.kind(), "tasks");

    // Empty strings clear them, back to the default.
    nb.set_workspace_appearance("proj", Some(String::new()), Some(String::new()))
        .unwrap();
    let cleared = nb
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "proj")
        .unwrap();
    assert_eq!(cleared.config.color, None);
    assert_eq!(cleared.config.icon, None);
}

#[test]
fn delete_workspace_trashes_it_and_refuses_the_fixed_ones() {
    let (dir, nb) = notebook();
    nb.create_workspace("proj", "tasks").unwrap();
    assert!(dir.path().join("proj").is_dir());

    nb.delete_workspace("proj").unwrap();
    assert!(!dir.path().join("proj").exists());

    // The three fixed workspaces are protected.
    assert!(matches!(
        nb.delete_workspace("jott.tasks"),
        Err(jott_core::Error::Protected(_))
    ));
}

#[test]
fn groups_hold_workspaces_and_can_be_created_moved_and_deleted() {
    let (dir, nb) = notebook();

    // A group is a folder with a `.group.json`; it is not a workspace.
    nb.create_group("Design", None).unwrap();
    assert!(dir.path().join("Design/.group.json").is_file());

    // A workspace created inside the group lives under it, addressed by its
    // (unique) leaf name — and is born usable like any other.
    nb.create_workspace_in("Clients", "tasks", Some("Design")).unwrap();
    assert!(dir.path().join("Design/Clients/.workspace.json").is_file());
    assert!(dir.path().join("Design/Clients/Clients.md").is_file());

    // Discovery finds it among all workspaces, and the group lists it.
    let names: Vec<String> = nb
        .workspaces()
        .unwrap()
        .iter()
        .map(|w| w.folder_name().to_string())
        .collect();
    assert!(names.contains(&"Clients".to_string()));
    let groups = nb.groups().unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].folder, "Design");
    assert_eq!(groups[0].workspaces, vec!["Clients".to_string()]);

    // Addressing the workspace works regardless of its group: its list is
    // reachable by full path, group included.
    nb.create_task("Design/Clients/Clients.md", "call the client").unwrap();
    assert_eq!(
        nb.open_task_counts().unwrap().get("Design/Clients/Clients.md"),
        Some(&1)
    );

    // Names are unique across the notebook.
    assert!(nb.create_workspace("Clients", "tasks").is_err());
    assert!(nb.create_group("Clients", None).is_err());

    // Moving the workspace out to the root renames its folder, identity intact.
    nb.move_workspace("Clients", None).unwrap();
    assert!(dir.path().join("Clients/.workspace.json").is_file());
    assert!(!dir.path().join("Design/Clients").exists());

    // Deleting a group with members moves them to the root, never loses them.
    nb.create_workspace_in("Reports", "notes", Some("Design")).unwrap();
    nb.delete_group("Design").unwrap();
    assert!(dir.path().join("Reports/.workspace.json").is_file());
    assert!(!dir.path().join("Design").exists());
    assert!(nb.groups().unwrap().is_empty());
}

#[test]
fn the_same_hostile_names_are_refused_at_every_door() {
    // Two doors take a name straight from the user — a list and a workspace —
    // and each one used to spell the safety rule out on its own. One rule
    // (`relpath::is_safe_leaf`), so one table: whatever climbs, hides or
    // carries a separator is refused wherever it is typed, and each door
    // still answers with its own error.
    let (_dir, nb) = notebook();

    for hostile in [
        "",
        "   ",
        "..",
        "../fora",
        "a/b",
        "Ideias/2026",
        "a\\b",
        "a\0b",
        ".oculto",
        "a..b",
    ] {
        assert!(
            nb.create_list("jott.tasks", hostile).is_err(),
            "create_list accepted {hostile:?}"
        );
        assert!(
            nb.create_workspace(hostile, "tasks").is_err(),
            "create_workspace accepted {hostile:?}"
        );
    }

    // And an ordinary name still works at both.
    nb.create_list("jott.tasks", "Projeto v2.0").unwrap();
    nb.create_workspace("Projeto Y", "tasks").unwrap();
}

#[test]
fn a_group_renames_and_restyles_exactly_like_a_workspace() {
    // Both carry the same tolerant config under a different marker file, so
    // both go through the same read-edit-write. This test existed for the
    // workspace side only; the group side was the untested half of the copy.
    let (dir, nb) = notebook();
    nb.create_group("Design", None).unwrap();

    nb.rename_group("Design", "  Design & Brand  ").unwrap();
    nb.set_group_appearance("Design", Some("#8b5cf6".into()), Some("flag".into()))
        .unwrap();

    let reopened = Notebook::open(dir.path()).unwrap();
    let group = reopened
        .groups()
        .unwrap()
        .into_iter()
        .find(|g| g.folder == "Design")
        .unwrap();
    // Whitespace around what the user typed is not part of the name.
    assert_eq!(group.config.name.as_deref(), Some("Design & Brand"));
    assert_eq!(group.config.color.as_deref(), Some("#8b5cf6"));
    assert_eq!(group.config.icon.as_deref(), Some("flag"));
    // The folder — the identity — never moved.
    assert!(dir.path().join("Design/.group.json").is_file());

    // Blank clears each, and the cleared key leaves the file (the bug this
    // project already paid for twice).
    nb.rename_group("Design", "   ").unwrap();
    nb.set_group_appearance("Design", Some(String::new()), None)
        .unwrap();
    let cleared = nb
        .groups()
        .unwrap()
        .into_iter()
        .find(|g| g.folder == "Design")
        .unwrap();
    assert_eq!(cleared.config.name, None);
    assert_eq!(cleared.config.color, None);
    assert_eq!(cleared.config.icon, None);
    let on_disk = std::fs::read_to_string(dir.path().join("Design/.group.json")).unwrap();
    assert!(!on_disk.contains("color"), "{on_disk}");
    assert!(!on_disk.contains("name"), "{on_disk}");
}

#[test]
fn a_workspace_keeps_its_sort_and_dragged_order_in_its_own_config() {
    // The arrangement is an app preference, so it lives in the workspace's
    // `.workspace.json` — never in the content files.
    let (dir, nb) = notebook();
    nb.create_workspace("Space 1", "tasks").unwrap();

    let workspace = |nb: &Notebook| {
        nb.workspaces()
            .unwrap()
            .into_iter()
            .find(|w| w.folder_name() == "Space 1")
            .unwrap()
    };

    nb.set_workspace_sort("Space 1", Some("name")).unwrap();
    assert_eq!(workspace(&nb).config.sort.as_deref(), Some("name"));

    // Dragging saves the arrangement and switches the workspace to it.
    nb.set_workspace_order("Space 1", vec!["b2".into(), "a1".into()])
        .unwrap();
    let config = workspace(&nb).config;
    assert_eq!(config.sort.as_deref(), Some("custom"));
    assert_eq!(config.order, vec!["b2".to_string(), "a1".to_string()]);

    // Clearing removes the keys from the file instead of leaving stale ones.
    nb.set_workspace_sort("Space 1", None).unwrap();
    nb.set_workspace_order("Space 1", Vec::new()).unwrap();
    let on_disk =
        std::fs::read_to_string(dir.path().join("Space 1/.workspace.json")).unwrap();
    assert!(!on_disk.contains("order"), "{on_disk}");
    // set_workspace_order still switches to custom (an empty arrangement just
    // falls back to the file order when applied).
    assert_eq!(workspace(&nb).config.sort.as_deref(), Some("custom"));
    // And the type survives every rewrite.
    assert_eq!(workspace(&nb).kind(), "tasks");

    // A folder that is not a workspace is refused — writing a config there
    // would turn it into one.
    std::fs::create_dir(dir.path().join("Loose")).unwrap();
    assert!(nb.set_workspace_sort("Loose", Some("name")).is_err());
}

#[test]
fn a_groups_members_come_back_in_the_order_the_user_dragged() {
    // The sidebar reads a group's place off its members, and the order the
    // user drags is stored once, in the notebook config's `workspaces`
    // namespace. `groups()` used to sort its members alphabetically, so the
    // dragged order was written and then thrown away on the next read — the
    // drag inside a group simply did nothing (user report, 2026-08-11).
    let (_dir, mut nb) = notebook();
    nb.create_group("Design", None).unwrap();
    for name in ["Alpha", "Beta", "Gamma"] {
        nb.create_workspace_in(name, "tasks", Some("Design")).unwrap();
    }

    let members = |nb: &Notebook| nb.groups().unwrap().remove(0).workspaces;
    assert_eq!(members(&nb), vec!["Alpha", "Beta", "Gamma"], "alphabetical by default");

    nb.set_order(
        "workspaces",
        ["Gamma", "Alpha", "Beta"].iter().map(|s| s.to_string()).collect(),
    )
    .unwrap();
    assert_eq!(members(&nb), vec!["Gamma", "Alpha", "Beta"]);
}

#[test]
fn groups_nest_and_a_group_can_be_created_inside_another() {
    let (dir, nb) = notebook();
    nb.create_group("Design", None).unwrap();
    nb.create_group("Clients", Some("Design")).unwrap();
    assert!(dir.path().join("Design/Clients/.group.json").is_file());

    // A workspace inside the nested group is discovered like any other, and
    // its list is addressed by the full path.
    nb.create_workspace_in("Acme", "tasks", Some("Clients")).unwrap();
    assert!(dir.path().join("Design/Clients/Acme/Acme.md").is_file());
    assert!(nb
        .lists()
        .unwrap()
        .iter()
        .any(|entry| entry.path == "Design/Clients/Acme/Acme.md"));

    // Each group reports the group it sits in, and only its DIRECT members —
    // Acme belongs to Clients, not to Design.
    let groups = nb.groups().unwrap();
    let of = |folder: &str| groups.iter().find(|g| g.folder == folder).unwrap().clone();
    assert_eq!(of("Design").parent, None);
    assert_eq!(of("Clients").parent.as_deref(), Some("Design"));
    assert!(of("Design").workspaces.is_empty());
    assert_eq!(of("Clients").workspaces, vec!["Acme".to_string()]);

    // Names stay unique across the whole notebook, however deep.
    assert!(nb.create_group("Acme", None).is_err());
    assert!(nb.create_workspace("Clients", "notes").is_err());
}

#[test]
fn moving_a_group_carries_its_subtree_and_refuses_to_enter_itself() {
    let (dir, nb) = notebook();
    nb.create_group("Design", None).unwrap();
    nb.create_group("Clients", Some("Design")).unwrap();
    nb.create_workspace_in("Acme", "tasks", Some("Clients")).unwrap();

    // Out to the root: everything under it travels.
    nb.move_group("Clients", None).unwrap();
    assert!(dir.path().join("Clients/Acme/Acme.md").is_file());
    assert!(!dir.path().join("Design/Clients").exists());

    // Back in, and then the two moves that cannot happen: into itself, and
    // into its own descendant — the branch would be carrying itself.
    nb.move_group("Clients", Some("Design")).unwrap();
    assert!(nb.move_group("Clients", Some("Clients")).is_err());
    assert!(nb.move_group("Design", Some("Clients")).is_err());
    assert!(dir.path().join("Design/Clients/Acme").is_dir());
}

#[test]
fn moving_a_workspace_between_groups_keeps_its_pulled_tasks() {
    // A move changes every list address under the folder, so the Day/Week
    // references have to follow. They never did for a workspace (only for the
    // old widget move), which left a task pulled into today pointing at a path
    // that no longer existed — it just vanished from the screen.
    let (dir, nb) = notebook();
    nb.create_group("Design", None).unwrap();
    nb.create_workspace("Acme", "tasks").unwrap();

    let list = "Acme/Acme.md";
    nb.create_task(list, "call the client").unwrap();
    let id = nb.ensure_task_id(list, 0).unwrap();
    nb.pull_into(jott_core::Period::Day, list, &id).unwrap();

    nb.move_workspace("Acme", Some("Design")).unwrap();

    let moved = "Design/Acme/Acme.md";
    assert!(dir.path().join(moved).is_file());
    let state = nb.open_state(jott_core::Period::Day).unwrap();
    assert!(state.state.contains(moved, &id), "{:?}", state.state);
    assert_eq!(nb.period_tasks(jott_core::Period::Day).unwrap().len(), 1);
}

#[test]
fn deleting_a_group_hands_what_it_held_to_its_own_parent() {
    // Not to the root: a nested group's members belong one level up, where the
    // user was looking. Nothing is deleted with the group.
    let (dir, nb) = notebook();
    nb.create_group("Design", None).unwrap();
    nb.create_group("Clients", Some("Design")).unwrap();
    nb.create_workspace_in("Acme", "tasks", Some("Clients")).unwrap();
    nb.create_group("Archive", Some("Clients")).unwrap();

    nb.delete_group("Clients").unwrap();

    assert!(!dir.path().join("Design/Clients").exists());
    assert!(dir.path().join("Design/Acme/Acme.md").is_file(), "the workspace moved up");
    assert!(dir.path().join("Design/Archive/.group.json").is_file(), "the child group too");
    let groups = nb.groups().unwrap();
    assert!(groups.iter().all(|g| g.folder != "Clients"));
    assert_eq!(
        groups.iter().find(|g| g.folder == "Archive").unwrap().parent.as_deref(),
        Some("Design")
    );
}

#[test]
fn a_fixed_marker_without_a_type_is_completed_not_left_unsupported() {
    // A marker written before `type` existed (the Memo-era notebooks) would
    // otherwise open as "unsupported workspace" — a lie about a folder the app
    // itself created and recreates. The three fixed ones are the app's, and
    // their function is not a user choice.
    let dir = tempfile::tempdir().unwrap();
    let nb = Notebook::init(dir.path()).unwrap();

    // Put the old shape back on disk, unknown keys and all.
    std::fs::write(
        dir.path().join("jott.tasks/.workspace.json"),
        r#"{ "schemaVersion": 1, "kind": "old", "fixed": true, "future": 7 }"#,
    )
    .unwrap();
    drop(nb);

    let reopened = Notebook::open(dir.path()).unwrap();
    let tasks = reopened
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "jott.tasks")
        .unwrap();
    assert_eq!(tasks.kind(), "tasks");
    assert!(tasks.config.is_known());
    // Completing it keeps everything else the file carried.
    let on_disk = std::fs::read_to_string(dir.path().join("jott.tasks/.workspace.json")).unwrap();
    assert!(on_disk.contains("future"), "{on_disk}");

    // A USER workspace with no type is left exactly as it is: there the type
    // is a decision, and the app has no business inventing one.
    make_workspace(dir.path(), "Mystery", r#"{ "schemaVersion": 1 }"#);
    let reopened = Notebook::open(dir.path()).unwrap();
    let mystery = reopened
        .workspaces()
        .unwrap()
        .into_iter()
        .find(|w| w.folder_name() == "Mystery")
        .unwrap();
    assert_eq!(mystery.kind(), "");
}

#[test]
fn the_fixed_workspaces_read_as_home_tasks_and_notes_however_they_are_filed() {
    // The folders carry the app's `jott.` prefix so the plain names stay free
    // for the user — and the interface must go on saying Home, Tasks, Notes.
    // Every address the app hands out carries the name the user reads, so the
    // frontend never has to derive it from the folder (user report,
    // 2026-08-11: `jott.tasks` showed up in the interface).
    let (dir, nb) = notebook();
    assert!(dir.path().join("jott.tasks/Tasks.md").is_file());

    let of = |folder: &str| {
        nb.workspaces()
            .unwrap()
            .into_iter()
            .find(|w| w.folder_name() == folder)
            .unwrap()
            .display_name()
            .to_string()
    };
    assert_eq!(of("jott.home"), "Home");
    assert_eq!(of("jott.tasks"), "Tasks");
    assert_eq!(of("jott.notes"), "Notes");

    let inbox = nb
        .lists()
        .unwrap()
        .into_iter()
        .find(|entry| entry.path == Notebook::inbox_path())
        .unwrap();
    assert_eq!(inbox.name, "Tasks");
    assert_eq!(inbox.workspace, "Tasks", "the label, never the folder");

    // A user workspace speaks for itself, by its own display name.
    nb.create_workspace("Errands", "tasks").unwrap();
    nb.rename_workspace("Errands", "Weekend").unwrap();
    let entry = nb
        .lists()
        .unwrap()
        .into_iter()
        .find(|entry| entry.path.starts_with("Errands/") && entry.name == "Errands")
        .unwrap();
    assert_eq!(entry.workspace, "Weekend");

    // And renaming a fixed one sticks: the app fills the name only when the
    // file has none.
    nb.rename_workspace("jott.tasks", "My tasks").unwrap();
    let reopened = Notebook::open(dir.path()).unwrap();
    assert_eq!(
        reopened
            .workspaces()
            .unwrap()
            .into_iter()
            .find(|w| w.folder_name() == "jott.tasks")
            .unwrap()
            .display_name(),
        "My tasks"
    );
}
