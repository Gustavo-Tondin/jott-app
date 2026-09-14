//! Two devices on one notebook, through a folder sync tool. Nothing here
//! talks to Syncthing: the tests reproduce what it does to the files — one
//! side keeps the name, the other lands beside it as a conflict copy — and
//! assert what the app is left holding.

use std::path::Path;

use jott_core::Notebook;

mod common;
use common::{init, read};

/// A device that already has everything `origin` has: the folder copied at
/// the moment the two were last in step.
fn clone_notebook(origin: &Path) -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    copy_tree(origin, dir.path());
    let notebook = Notebook::open(dir.path()).unwrap();
    (dir, notebook)
}

/// One device, complete: the notebook folder, the machine folder where its
/// merge base lives (outside the notebook, as on a real install), and the
/// open notebook. Every `Notebook::open` in a merge test goes through this,
/// since a notebook with no base merges nothing.
struct Device {
    notebook: tempfile::TempDir,
    machine: tempfile::TempDir,
}

impl Device {
    fn new() -> (Self, Notebook) {
        let (notebook, _) = init();
        let device = Self {
            notebook,
            machine: tempfile::tempdir().unwrap(),
        };
        let open = device.open();
        (device, open)
    }

    /// The same device, holding a copy of what `origin` holds right now —
    /// the moment the two were last in step, base included.
    fn cloned_from(origin: &Device) -> (Self, Notebook) {
        let notebook = tempfile::tempdir().unwrap();
        copy_tree(origin.notebook.path(), notebook.path());
        let device = Self {
            notebook,
            machine: tempfile::tempdir().unwrap(),
        };
        let open = device.open();
        (device, open)
    }

    fn open(&self) -> Notebook {
        Notebook::open(self.notebook.path())
            .unwrap()
            .with_base_dir(self.machine.path())
    }

    fn path(&self) -> &Path {
        self.notebook.path()
    }
}

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), &target).unwrap();
        }
    }
}

/// Brings two folders into step the way the sync tool does. A file BOTH
/// sides changed converges to the same pair on both of them: `a`'s bytes keep
/// the name, `b`'s land beside them as a conflict copy — and the copy syncs
/// too, so each device is handed the same decision to take. A file only one
/// side has is simply copied over.
fn sync_folder(a: &Path, b: &Path, dir: &str) {
    let names = |root: &Path| -> Vec<String> {
        std::fs::read_dir(root.join(dir))
            .into_iter()
            .flatten()
            .flatten()
            .filter(|entry| entry.file_type().unwrap().is_file())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect()
    };
    let every: std::collections::BTreeSet<String> =
        names(a).into_iter().chain(names(b)).collect();

    for name in every {
        let ours = a.join(dir).join(&name);
        let theirs = b.join(dir).join(&name);
        match (std::fs::read(&ours), std::fs::read(&theirs)) {
            (Ok(mine), Ok(yours)) if mine == yours => {}
            (Ok(mine), Ok(yours)) => {
                let (stem, ext) = name.rsplit_once('.').unwrap_or((name.as_str(), ""));
                let copy = format!("{stem}.sync-conflict-20260914-120000-PHONE.{ext}");
                std::fs::write(a.join(dir).join(&copy), &yours).unwrap();
                std::fs::write(b.join(dir).join(&copy), &yours).unwrap();
                std::fs::write(&theirs, &mine).unwrap();
            }
            (Ok(mine), Err(_)) => std::fs::write(&theirs, &mine).unwrap(),
            (Err(_), Ok(yours)) => std::fs::write(&ours, &yours).unwrap(),
            _ => {}
        }
    }
}

/// How many conflict copies the sync left in a folder.
fn conflict_copies(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .filter(|entry| {
            entry
                .as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains(".sync-conflict-")
        })
        .count()
}

const INBOX: &str = "jott.tasks/task-list.md";

// ------------------------------------------------- a version landing mid-save

#[test]
fn a_save_keeps_the_version_that_landed_while_the_command_ran() {
    // Every command re-reads its list from disk, so the window a sync can
    // land in is the length of one command. Inside it the save still wins the
    // file — but what it found there is kept beside it first, and the banner
    // has it. Nothing decided, nothing lost.
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "do desktop").unwrap();
    let path = dir.path().join(INBOX);

    // The app holds the list; the other device's version lands under it.
    let mut open = notebook.open_list(INBOX).unwrap();
    let arriving = format!("{}- [ ] do celular <!--id:c1-->\n", read(&path));
    std::fs::write(&path, &arriving).unwrap();

    open.save().unwrap();

    let on_disk = read(&path);
    assert!(
        on_disk.contains("do desktop"),
        "our version is the one on disk:\n{on_disk}"
    );
    assert!(
        !on_disk.contains("do celular"),
        "the arriving line is not merged in — that is step 6:\n{on_disk}"
    );

    let conflicts = notebook.conflicts().unwrap();
    assert_eq!(conflicts.len(), 1, "{conflicts:?}");
    let kept = read(&conflicts[0].path);
    assert_eq!(kept, arriving, "byte for byte what was found on disk");
    assert_eq!(
        conflict_copies(&dir.path().join("jott.tasks")),
        1,
        "one copy, named the way Syncthing names them"
    );
}

#[test]
fn a_list_saved_over_and_over_keeps_no_copy_of_itself() {
    // The guard above must not fire on the app's own writing: every command
    // that touches a list saves it, and a list open across two saves (or two
    // handles on one file inside one command, as a move between lists is)
    // finds its own bytes there.
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "do desktop").unwrap();

    let mut open = notebook.open_list(INBOX).unwrap();
    open.add_text_with_id("mais uma");
    open.save().unwrap();
    open.add_text_with_id("e outra");
    open.save().unwrap();

    // And a fresh handle saving what another handle just wrote.
    let mut again = notebook.open_list(INBOX).unwrap();
    open.add_text_with_id("da primeira alça");
    open.save().unwrap();
    again.add_text_with_id("da segunda");
    again.save().unwrap();

    assert_eq!(conflict_copies(&dir.path().join("jott.tasks")), 0);
    assert!(notebook.conflicts().unwrap().is_empty());
}

// ------------------------------------------- the same task finished on both

#[test]
#[ignore = "passes once the merge of step 6 (docs/pendências/sync-proposta.md) is in"]
fn a_freely_task_completed_on_both_devices_comes_back_once() {
    // `repeat: freely` keeps one open copy at a time. Completed on two
    // devices before they meet, each side spawns an occurrence of its own,
    // with an id of its own, and each files the completion. The merge has to
    // leave one open occurrence and one line per completion.
    let (a_dir, a) = init();
    let inbox = a_dir.path().join(INBOX);
    std::fs::write(&inbox, "- [ ] Regar as plantas <!--id:r1-->\n  repeat: freely\n").unwrap();

    let (b_dir, b) = clone_notebook(a_dir.path());

    a.complete_task(INBOX, "r1").unwrap();
    b.complete_task(INBOX, "r1").unwrap();

    sync_folder(a_dir.path(), b_dir.path(), "jott.tasks");
    assert_eq!(
        conflict_copies(&a_dir.path().join("jott.tasks")),
        2,
        "the sync left a copy of the list and one of Completed"
    );

    // Opening is where the app is handed the pair.
    let a = Notebook::open(a_dir.path()).unwrap();

    let list = read(&inbox);
    assert_eq!(
        list.matches("- [ ] Regar as plantas").count(),
        1,
        "one open occurrence, not two:\n{list}"
    );
    let completed = read(a_dir.path().join("jott.tasks/completed.md"));
    assert_eq!(
        completed.matches("- [x] Regar as plantas").count(),
        1,
        "the one completion each device recorded is the same one:\n{completed}"
    );
    assert!(
        a.conflicts().unwrap().is_empty(),
        "and the copies were settled, not left for the banner"
    );
}

// ------------------------------------------- a copy that decides nothing

#[test]
fn a_copy_identical_to_the_original_is_trashed_wherever_it_is() {
    // Both devices wrote the same bytes: there is no version to choose, so
    // the copy is noise — the user's text as much as the app's own files.
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "Comprar pão").unwrap();
    let note = notebook.create_note("jott.notes", "Inbox", "Ideia").unwrap();

    let list = dir.path().join(INBOX);
    let note_path = dir.path().join("jott.notes").join(&note);
    for original in [&list, &note_path] {
        let copy = original.with_file_name(format!(
            "{}.sync-conflict-20260914-120000-PHONE.md",
            original.file_stem().unwrap().to_string_lossy()
        ));
        std::fs::copy(original, copy).unwrap();
    }
    assert!(
        notebook.conflicts().unwrap().is_empty(),
        "an identical copy is not reported even before the reaper runs"
    );

    // Opening is where the derived work runs.
    let notebook = Notebook::open(dir.path()).unwrap();

    assert_eq!(conflict_copies(&dir.path().join("jott.tasks")), 0);
    assert_eq!(conflict_copies(&dir.path().join("jott.notes/Inbox")), 0);
    assert!(notebook.conflicts().unwrap().is_empty());
    assert_eq!(
        notebook.trash_entries().len(),
        2,
        "nothing was destroyed: both copies are in the trash"
    );
}

#[test]
fn a_copy_that_differs_is_left_for_the_user() {
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "Comprar pão").unwrap();
    let list = dir.path().join(INBOX);
    let copy = list.with_file_name("task-list.sync-conflict-20260914-120000-PHONE.md");
    std::fs::write(&copy, format!("{}- [ ] do celular\n", read(&list))).unwrap();

    let notebook = Notebook::open(dir.path()).unwrap();

    assert!(copy.is_file(), "the copy is still there");
    assert_eq!(
        notebook.conflicts().unwrap().len(),
        1,
        "and the banner still has something to ask"
    );
}

// ------------------------------------- two devices turning the day at once

/// The ids in today, in order.
fn today_ids(notebook: &Notebook) -> Vec<String> {
    notebook
        .open_state()
        .unwrap()
        .state
        .items
        .iter()
        .map(|r| r.id.clone())
        .collect()
}

/// Creates a task in the Inbox and gives it an id — the position `create_task`
/// answers, never a guessed one: `newTasksOnTop` decides where it lands.
fn task(notebook: &Notebook, text: &str) -> String {
    let inbox = Notebook::inbox_path();
    let position = notebook.create_task(&inbox, text).unwrap();
    notebook.ensure_task_id(&inbox, position).unwrap()
}

#[test]
fn each_device_pulling_its_own_task_into_today_leaves_no_copy() {
    // `daily-state.json` is written by every device that opens in the
    // morning, so it is the file the sync tool copies most. Two devices
    // pulling DIFFERENT tasks is not a decision anybody has to take: against
    // the content they last had in common, both halves are additions.
    let inbox = Notebook::inbox_path();
    let (a_device, a) = Device::new();
    let common = task(&a, "Comum");
    let desktop = task(&a, "Do desktop");
    let phone = task(&a, "Do celular");
    a.pull_into_day(None, &inbox, &common).unwrap();

    // Opening is when a device takes note of what it is holding — from here
    // the two are out of contact, each with the same base.
    let a = a_device.open();
    let (b_device, b) = Device::cloned_from(&a_device);
    a.pull_into_day(None, &inbox, &desktop).unwrap();
    b.pull_into_day(None, &inbox, &phone).unwrap();

    sync_folder(a_device.path(), b_device.path(), ".jott");
    assert_eq!(
        conflict_copies(&a_device.path().join(".jott")),
        1,
        "the sync left a copy of the day's state"
    );

    let a = a_device.open();
    let ids = today_ids(&a);
    for (name, id) in [("comum", &common), ("do desktop", &desktop), ("do celular", &phone)] {
        assert!(ids.contains(id), "{name} is not in the day: {ids:?}");
    }
    assert_eq!(ids.len(), 3);
    assert_eq!(conflict_copies(&a_device.path().join(".jott")), 0);
    assert!(a.conflicts().unwrap().is_empty(), "and the banner has nothing to ask");
    assert_eq!(
        a.trash_entries().len(),
        1,
        "nothing was destroyed: the copy is in the trash"
    );

    // The other device was handed the same pair, and merges it into the same
    // bytes — otherwise the two would hand each other a conflict for ever.
    let b = b_device.open();
    assert_eq!(today_ids(&b), ids, "both devices land on the same day");
    assert_eq!(conflict_copies(&b_device.path().join(".jott")), 0);
}

#[test]
fn a_task_taken_out_of_the_day_on_one_device_stays_out() {
    // Only one side made a decision about that reference, so there is nothing
    // to weigh: taking it out wins over the other device leaving it alone.
    let inbox = Notebook::inbox_path();
    let (a_device, a) = Device::new();
    let one = task(&a, "Uma");
    let other = task(&a, "Outra");
    a.pull_into_day(None, &inbox, &one).unwrap();
    a.pull_into_day(None, &inbox, &other).unwrap();

    let a = a_device.open();
    let (b_device, b) = Device::cloned_from(&a_device);
    a.remove_from_day(None, &inbox, &one).unwrap();
    let third = task(&b, "Terceira");
    b.pull_into_day(None, &inbox, &third).unwrap();

    sync_folder(a_device.path(), b_device.path(), ".jott");
    let a = a_device.open();

    let ids = today_ids(&a);
    assert!(!ids.contains(&one), "the one taken out is out: {ids:?}");
    assert!(ids.contains(&other), "{ids:?}");
    assert!(ids.contains(&third), "and the other device's is in: {ids:?}");
    assert_eq!(ids.len(), 2);
}

#[test]
fn without_a_base_the_copy_is_left_for_the_user() {
    // A notebook this device has never opened before has nothing to measure
    // from, and guessing is how work is lost: the banner asks, as it always did.
    let inbox = Notebook::inbox_path();
    let (a_device, a) = Device::new();
    let id = task(&a, "Comum");
    a.pull_into_day(None, &inbox, &id).unwrap();

    let state = a_device.path().join(".jott/daily-state.json");
    let copy = state.with_file_name("daily-state.sync-conflict-20260914-120000-PHONE.json");
    std::fs::write(&copy, read(&state).replace(&id, "outra")).unwrap();

    // A machine folder of its own: this device has never seen the file.
    let fresh = tempfile::tempdir().unwrap();
    let a = Notebook::open(a_device.path()).unwrap().with_base_dir(fresh.path());

    assert!(copy.is_file(), "the copy is still there");
    assert_eq!(a.conflicts().unwrap().len(), 1);
}

#[test]
fn a_plan_day_one_device_already_poured_into_today_does_not_come_back() {
    // Both devices had a task planned for a day that arrived. Whichever opens
    // first drains the day; the other still has it in its plan. The removal
    // wins, and the task is in today on the device that opened.
    let inbox = Notebook::inbox_path();
    let (a_device, a) = Device::new();
    let planned = task(&a, "Do dia");
    let near = a.today() + chrono::Duration::days(2);
    let far = a.today() + chrono::Duration::days(9);
    a.pull_into_day(Some(near), &inbox, &planned).unwrap();
    a.pull_into_day(Some(far), &inbox, &planned).unwrap();

    let a = a_device.open();
    let (b_device, b) = Device::cloned_from(&a_device);
    // A drops the near day (what `take_due` does the morning it arrives);
    // B, still apart, plans one more task for the far one.
    let mut plan = a.open_plan().unwrap();
    plan.plan.remove_from(near, &inbox, &planned);
    plan.save().unwrap();
    let extra = task(&b, "Mais uma");
    b.pull_into_day(Some(far), &inbox, &extra).unwrap();

    sync_folder(a_device.path(), b_device.path(), ".jott");
    let a = a_device.open();

    let plan = a.open_plan().unwrap().plan;
    assert!(plan.of(near).is_empty(), "the day A drained does not come back");
    assert_eq!(plan.of(far).len(), 2, "and B's addition is there");
    assert_eq!(conflict_copies(&a_device.path().join(".jott")), 0);
}
