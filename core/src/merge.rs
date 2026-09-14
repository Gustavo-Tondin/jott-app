//! Three-way merge of a task list: what the two devices last had in COMMON
//! ([`crate::base`]), what this device holds, and the version the sync tool
//! left beside it. Pure — lines in, lines out, no disk; the caller writes.
//!
//! The unit is the task, named by its `id`. Two devices touching DIFFERENT
//! tasks of one list is what a conflict copy of a list almost always is, and
//! there is nothing to ask about it. What both changed, differently, is not
//! merged: this device's version stays where it is and the other's lands
//! right under it, marked, so the choice is made where the user is looking
//! instead of between two file names.
//!
//! Two rules keep the two devices landing on the same BYTES — without which
//! they hand each other a conflict for ever. No id is ever invented at
//! random (`id::derived`). And a task missing on one side is never read as a
//! deletion by measuring against the base: the base is what THIS device last
//! received, so a task it created while the other was away would read as
//! deleted there and be thrown away. A deletion is a fact the notebook
//! carries — the space's `completed.md` or `.jott/trash/`, both of which
//! travel — and only that fact removes a task here.

use std::collections::{BTreeMap, HashSet};

use crate::list::Line;
use crate::task::Task;

/// What the other device's version of a task is prefixed with when both
/// devices changed the same task differently. The two sit one above the
/// other, and deleting one is a tap.
pub const CLASH_MARK: &str = "⚠ ";

/// Which kind of file is being merged — the two differ in one rule only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// A list of open tasks: a disagreement is shown, both versions kept.
    List,
    /// `completed.md`, which only ever grows: one line per completion, and a
    /// completion recorded twice is still one. There is nothing to show.
    Log,
}

/// The ids the notebook itself knows have left a list on purpose. Both
/// halves travel with the notebook, so both devices read the same answer.
#[derive(Debug, Default)]
pub struct Departed {
    /// Ticked: they live in the space's `completed.md` now.
    pub completed: HashSet<String>,
    /// Deleted: they live in `.jott/trash/`, where they can be brought back.
    pub trashed: HashSet<String>,
}

impl Departed {
    fn holds(&self, id: &str) -> bool {
        self.completed.contains(id) || self.trashed.contains(id)
    }
}

/// What a merge produced.
#[derive(Debug, Default)]
pub struct ListMerge {
    /// The file to write.
    pub lines: Vec<Line>,
    /// How many tasks the other device's version moved — added, edited,
    /// deleted or disputed. What the notice counts.
    pub changes: usize,
    /// The tasks both devices changed differently, by their text.
    pub clashes: Vec<String>,
    /// Tasks the other device edited that THIS device had already completed:
    /// they belong to the completed file, as `(common, theirs)`. The caller
    /// owns that file and finishes the merge there.
    pub completed_elsewhere: Vec<(Task, Task)>,
}

/// Merges `ours` and `theirs` against what they had in `base`. `gone` is what
/// the notebook knows about tasks that LEFT this list — the only thing that
/// takes one out of the result.
pub fn merge_lists(
    base: &[Line],
    ours: &[Line],
    theirs: &[Line],
    gone: &Departed,
    mode: Mode,
) -> ListMerge {
    let common = by_id(base);
    let their_tasks = by_id(theirs);
    let mut taken: HashSet<String> = common
        .keys()
        .chain(by_id(ours).keys())
        .chain(their_tasks.keys())
        .map(|id| id.to_string())
        .collect();

    let mut merge = ListMerge::default();
    let mut handled: HashSet<&str> = HashSet::new();

    // This device's file is the shape of the result: its prose, its order,
    // its tasks. The other device's version is read against the base to say
    // what it CHANGED, which is the only thing worth carrying over.
    for line in ours {
        let Line::Task(mine) = line else {
            merge.lines.push(line.clone());
            continue;
        };
        let Some(id) = mine.id.as_deref() else {
            merge.lines.push(line.clone());
            continue;
        };
        handled.insert(id);

        match (common.get(id), their_tasks.get(id)) {
            // Both still hold it: field by field, against what they had in
            // common.
            (Some(was), Some(theirs)) => match merge_task(was, mine, theirs) {
                Some(task) => {
                    if &task != mine {
                        merge.changes += 1;
                    }
                    merge.lines.push(Line::Task(task));
                }
                None if mode == Mode::Log => merge.lines.push(line.clone()),
                None => {
                    merge.changes += 1;
                    merge.clashes.push(mine.text.clone());
                    merge.lines.push(line.clone());
                    merge.lines.push(Line::Task(marked(theirs, &mut taken)));
                }
            },
            // The common version has never heard of this id, and both devices
            // hold it: one wrote it and the other received it, since an id is
            // six base36 characters and two devices do not land on the same
            // one. With no ancestor there is no telling WHO wrote what, so
            // agreement is kept and disagreement is shown.
            (None, Some(theirs)) => {
                merge.lines.push(line.clone());
                if mode == Mode::List && *theirs != mine {
                    merge.changes += 1;
                    merge.clashes.push(mine.text.clone());
                    merge.lines.push(Line::Task(marked(theirs, &mut taken)));
                }
            }
            // Only here. It stays unless the notebook itself says it left —
            // the other device simply not having it proves nothing, and it is
            // how a task written while that device was away would be lost.
            (_, None) => {
                if gone.holds(id) {
                    merge.changes += 1;
                } else {
                    merge.lines.push(line.clone());
                }
            }
        }
    }

    // What is left of the other device's version: what it holds and this
    // device does not.
    for line in theirs {
        match line {
            Line::Task(theirs) if theirs.id.is_some() => {
                let id = theirs.id.as_deref().expect("just matched");
                if handled.contains(id) {
                    continue;
                }
                // Ticked or deleted here: it does not walk back into the
                // list. What the other device said ABOUT a ticked task is
                // handed to the file the task is in now.
                if gone.holds(id) {
                    if let (true, Some(was)) = (gone.completed.contains(id), common.get(id)) {
                        if *was != theirs {
                            merge
                                .completed_elsewhere
                                .push(((*was).clone(), theirs.clone()));
                        }
                    }
                    continue;
                }
                merge.changes += 1;
                merge.lines.push(line.clone());
            }
            // A line with no task in it, or a task nobody ever addressed:
            // there is no identity to merge, so it is kept when it is new on
            // the other side. Prose is never mixed line by line here — a list
            // is a list, and the note merge is the one that reads text.
            other => {
                let text = spelling(other);
                if !text.trim().is_empty()
                    && !holds(ours, &text)
                    && !holds(base, &text)
                    && !holds(&merge.lines, &text)
                {
                    merge.changes += 1;
                    merge.lines.push(other.clone());
                }
            }
        }
    }

    if mode == Mode::List {
        merge.changes += keep_one_free_occurrence(&mut merge.lines, &by_id(ours), &their_tasks);
    }
    merge
}

/// Merges one task field by field: what one side left as it was, the other
/// side decided. `None` when both moved the same field to different values —
/// the one thing a merge must not settle on its own.
pub fn merge_task(common: &Task, ours: &Task, theirs: &Task) -> Option<Task> {
    if ours == theirs {
        return Some(ours.clone());
    }
    let mut merged = ours.clone();
    merged.text = pick(&common.text, &ours.text, &theirs.text)?;
    merged.done = pick(&common.done, &ours.done, &theirs.done)?;
    merged.origin = pick(&common.origin, &ours.origin, &theirs.origin)?;
    merged.created = pick(&common.created, &ours.created, &theirs.created)?;
    merged.completed = pick(&common.completed, &ours.completed, &theirs.completed)?;
    merged.spawned = pick(&common.spawned, &ours.spawned, &theirs.spawned)?;
    merged.pinned = pick(&common.pinned, &ours.pinned, &theirs.pinned)?;
    merged.due = pick(&common.due, &ours.due, &theirs.due)?;
    merged.remind = pick(&common.remind, &ours.remind, &theirs.remind)?;
    merged.priority = pick(&common.priority, &ours.priority, &theirs.priority)?;
    merged.repeat = pick(&common.repeat, &ours.repeat, &theirs.repeat)?;
    merged.indent = pick(&common.indent, &ours.indent, &theirs.indent)?;
    // Free text, subtasks and the metadata of another version are each ONE
    // value: merging a description line by line would interleave two people's
    // sentences, and a `meta` this build does not read must travel whole.
    merged.description = pick(&common.description, &ours.description, &theirs.description)?;
    merged.subtasks = pick(&common.subtasks, &ours.subtasks, &theirs.subtasks)?;
    merged.meta = pick(&common.meta, &ours.meta, &theirs.meta)?;
    // Sets: every addition enters, and a removal on either side wins over the
    // other side leaving it — the rule the day's references already follow.
    merged.tags = merge_set(&common.tags, &ours.tags, &theirs.tags);
    merged.files = merge_set(&common.files, &ours.files, &theirs.files);
    // Derived where the task leaves the notebook, never in the file.
    merged.age = None;
    Some(merged)
}

/// The value a field is left with: whoever moved it decided, and two sides
/// moving it to the same place agree. `None` is a disagreement.
fn pick<T: PartialEq + Clone>(common: &T, ours: &T, theirs: &T) -> Option<T> {
    if ours == theirs || theirs == common {
        Some(ours.clone())
    } else if ours == common {
        Some(theirs.clone())
    } else {
        None
    }
}

/// Three-way merge of a set: in when both hold it, or when one added it; out
/// when one of them dropped what the base had. Order is ours, additions after.
fn merge_set<T: PartialEq + Clone>(common: &[T], ours: &[T], theirs: &[T]) -> Vec<T> {
    let keep = |item: &T| {
        matches!(
            (common.contains(item), ours.contains(item), theirs.contains(item)),
            (_, true, true) | (false, true, false) | (false, false, true)
        )
    };
    let mut out: Vec<T> = ours.iter().filter(|item| keep(item)).cloned().collect();
    for item in theirs {
        if keep(item) && !out.contains(item) {
            out.push(item.clone());
        }
    }
    out
}

/// The other device's version of a task both devices changed: the same task,
/// marked and given an id of its own, to sit under ours.
fn marked(theirs: &Task, taken: &mut HashSet<String>) -> Task {
    let mut task = theirs.clone();
    task.text = format!("{CLASH_MARK}{}", theirs.text);
    renamed(&task, taken)
}

/// The other device's task under an id nothing else in the file uses.
fn renamed(theirs: &Task, taken: &mut HashSet<String>) -> Task {
    let mut task = theirs.clone();
    let seed = format!(
        "{}|{}",
        theirs.id.as_deref().unwrap_or_default(),
        theirs.text
    );
    let id = crate::id::derived(&seed, taken);
    taken.insert(id.clone());
    task.id = Some(id);
    // A second copy never completed anything: keeping the pointer would tell
    // the recurrence chain this task already spawned its next occurrence.
    task.spawned = None;
    task
}

/// `repeat: freely` is one open task at a time. Completed on both devices out
/// of contact, each side spawned an occurrence of its own — the merge is
/// where the two meet, and only one of them comes back. Only occurrences that
/// each side holds ALONE are weighed against each other: two of them in both
/// files is something the user wrote, and the app does not delete that. The
/// oldest stands, ties by id, so both devices drop the same one.
fn keep_one_free_occurrence(
    lines: &mut Vec<Line>,
    ours: &BTreeMap<&str, &Task>,
    theirs: &BTreeMap<&str, &Task>,
) -> usize {
    let mut spawned: BTreeMap<String, Vec<(Option<chrono::NaiveDate>, String, bool)>> =
        BTreeMap::new();
    for line in lines.iter() {
        let Line::Task(task) = line else { continue };
        let (Some(id), Some(repeat)) = (task.id.clone(), task.repeat) else {
            continue;
        };
        if task.done || !repeat.is_free() {
            continue;
        }
        let shared = ours.contains_key(id.as_str()) && theirs.contains_key(id.as_str());
        spawned
            .entry(task.text.clone())
            .or_default()
            .push((task.created, id, shared));
    }

    let mut drop: HashSet<String> = HashSet::new();
    for (_, mut group) in spawned {
        let from_each_side = group.iter().any(|(_, id, shared)| {
            !shared && ours.contains_key(id.as_str())
        }) && group
            .iter()
            .any(|(_, id, shared)| !shared && theirs.contains_key(id.as_str()));
        if group.len() < 2 || !from_each_side {
            continue;
        }
        // Oldest first, then the smaller id: anything but "whichever this
        // file happens to list first".
        group.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
        let keep = group
            .iter()
            .position(|(_, _, shared)| *shared)
            .unwrap_or(0);
        for (index, (_, id, shared)) in group.iter().enumerate() {
            if index != keep && !shared {
                drop.insert(id.clone());
            }
        }
    }
    if drop.is_empty() {
        return 0;
    }
    lines.retain(|line| match line {
        Line::Task(task) => !task.id.as_deref().is_some_and(|id| drop.contains(id)),
        Line::Raw(_) => true,
    });
    drop.len()
}

/// The tasks of a file by id — the first one wins, as every other reader of a
/// list does with a repeated id.
fn by_id(lines: &[Line]) -> BTreeMap<&str, &Task> {
    let mut out = BTreeMap::new();
    for line in lines {
        if let Line::Task(task) = line {
            if let Some(id) = task.id.as_deref() {
                out.entry(id).or_insert(task);
            }
        }
    }
    out
}

/// A line as it is written in the file — how a line with no id is recognised
/// on the other side.
fn spelling(line: &Line) -> String {
    match line {
        Line::Task(task) => task.render().join("\n"),
        Line::Raw(text) => text.clone(),
    }
}

fn holds(lines: &[Line], text: &str) -> bool {
    lines.iter().any(|line| spelling(line) == text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::list::TaskList;

    fn lines(text: &str) -> Vec<Line> {
        TaskList::from_text(text).lines().to_vec()
    }

    fn written(lines: &[Line]) -> String {
        lines
            .iter()
            .map(spelling)
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// One task per line, by id, as a file spells it.
    fn task(id: &str, text: &str) -> String {
        format!("- [ ] {text} <!--id:{id}-->\n")
    }

    fn merged(base: &str, ours: &str, theirs: &str) -> ListMerge {
        merge_lists(&lines(base), &lines(ours), &lines(theirs), &Departed::default(), Mode::List)
    }

    /// The same, for a list whose space knows some tasks left it.
    fn merged_with(base: &str, ours: &str, theirs: &str, gone: Departed) -> ListMerge {
        merge_lists(&lines(base), &lines(ours), &lines(theirs), &gone, Mode::List)
    }

    // ------------------------------------------------------------ the table

    #[test]
    fn each_device_editing_its_own_task_keeps_both_edits() {
        // The conflict a list copy almost always is.
        let base = format!("{}{}", task("a", "Comprar pao"), task("b", "Ligar"));
        let ours = format!("{}{}", task("a", "Comprar pao integral"), task("b", "Ligar"));
        let theirs = format!("{}{}", task("a", "Comprar pao"), task("b", "Ligar pro dentista"));

        let out = merged(&base, &ours, &theirs);

        assert!(written(&out.lines).contains("Comprar pao integral"));
        assert!(written(&out.lines).contains("Ligar pro dentista"));
        assert_eq!(out.clashes, Vec::<String>::new());
        assert_eq!(out.changes, 1, "one task moved on the other device");
    }

    #[test]
    fn a_task_the_notebook_says_was_deleted_goes() {
        // The other device not having it proves nothing — it may never have
        // received it. What removes a task is the notebook's own record of
        // its removal, which travels: the trash, or the space's Completed.
        let base = format!("{}{}", task("a", "Fica"), task("b", "Sai"));
        let out = merged_with(
            &base,
            &base,
            &task("a", "Fica"),
            Departed {
                trashed: HashSet::from(["b".to_string()]),
                ..Default::default()
            },
        );

        assert_eq!(written(&out.lines).trim(), task("a", "Fica").trim());
        assert_eq!(out.changes, 1);
    }

    #[test]
    fn a_task_the_other_device_simply_does_not_have_stays() {
        // It was written here while that device was away. Reading its absence
        // as a deletion is how the work of a whole evening disappears.
        let base = task("a", "Fica");
        let ours = format!("{}{}", task("a", "Fica"), task("b", "Escrita aqui"));
        let out = merged(&base, &ours, &base);

        assert!(written(&out.lines).contains("Escrita aqui"));
    }

    #[test]
    fn what_the_other_device_dropped_and_we_edited_stays() {
        let base = task("a", "Comprar pao");
        let out = merged(&base, &task("a", "Comprar pao na padaria"), "");

        assert!(written(&out.lines).contains("Comprar pao na padaria"));
    }

    #[test]
    fn what_only_the_other_device_has_comes_over() {
        let base = task("a", "Comprar pao");
        let out = merged(&base, "", &task("a", "Comprar pao na padaria"));

        assert!(written(&out.lines).contains("Comprar pao na padaria"));
        assert_eq!(out.changes, 1);
    }

    #[test]
    fn what_we_deleted_here_stays_deleted() {
        let base = task("a", "Comprar pao");
        let out = merged_with(
            &base,
            "",
            &base,
            Departed {
                trashed: HashSet::from(["a".to_string()]),
                ..Default::default()
            },
        );

        assert_eq!(written(&out.lines).trim(), "");
    }

    #[test]
    fn an_addition_on_either_side_enters() {
        let out = merged("", &task("a", "Minha"), &task("b", "Dela"));

        let text = written(&out.lines);
        assert!(text.contains("Minha") && text.contains("Dela"), "{text}");
        assert_eq!(out.changes, 1);
    }

    #[test]
    fn an_id_the_common_version_never_knew_is_still_one_task() {
        // Six base36 characters: two devices do not land on the same id, so
        // this is one task the common version is simply too old to know.
        // Agreement is kept; disagreement is shown, since with no ancestor
        // there is no telling which device wrote which version.
        let same = task("a", "Comprar pao");
        let out = merged("", &same, &same);
        assert_eq!(written(&out.lines).trim(), same.trim(), "no twin for a task nobody changed");

        let out = merged("", &task("a", "Minha"), &task("a", "Dela"));
        let text = written(&out.lines);
        assert!(text.contains("- [ ] Minha"), "{text}");
        assert!(text.contains(&format!("- [ ] {CLASH_MARK}Dela")), "{text}");
        assert_eq!(out.clashes.len(), 1);
    }

    // ------------------------------------------------------ field by field

    #[test]
    fn a_field_only_one_device_moved_is_that_devices_value() {
        let base = "- [ ] Consulta <!--id:a-->\n";
        let ours = "- [ ] Consulta <!--id:a-->\n  remind: 2026-09-20T09:00\n";
        let theirs = "- [x] Consulta <!--id:a-->\n";

        let out = merged(base, ours, theirs);
        let text = written(&out.lines);

        assert!(text.contains("- [x]"), "their tick: {text}");
        assert!(text.contains("remind: 2026-09-20T09:00"), "our reminder: {text}");
        assert!(out.clashes.is_empty());
    }

    #[test]
    fn tags_are_a_set_and_a_removal_wins() {
        let base = "- [ ] Consulta <!--id:a-->\n  #casa #urgent\n";
        let ours = "- [ ] Consulta <!--id:a-->\n  #casa\n";
        let theirs = "- [ ] Consulta <!--id:a-->\n  #casa #urgent #saude\n";

        let text = written(&merged(base, ours, theirs).lines);

        assert!(text.contains("#casa"), "{text}");
        assert!(text.contains("#saude"), "the other device's addition: {text}");
        assert!(!text.contains("#urgent"), "our removal stands: {text}");
    }

    #[test]
    fn the_same_field_moved_differently_puts_both_versions_in_the_list() {
        let base = task("a", "Comprar pao");
        let out = merged(
            &base,
            &task("a", "Comprar pao integral"),
            &task("a", "Comprar pao frances"),
        );
        let text = written(&out.lines);

        assert!(text.contains("- [ ] Comprar pao integral"), "{text}");
        assert!(
            text.contains(&format!("- [ ] {CLASH_MARK}Comprar pao frances")),
            "the other device's version sits right under ours: {text}"
        );
        assert_eq!(out.clashes, vec!["Comprar pao integral".to_string()]);
        // And it is a task of its own, not a second line with the same id.
        let ids: Vec<&str> = text.matches("id:").collect();
        assert_eq!(ids.len(), 2, "{text}");
        assert!(
            !text.contains(&format!("{CLASH_MARK}Comprar pao frances <!--id:a")),
            "the copy has an id of its own: {text}"
        );
    }

    #[test]
    fn the_invented_id_is_the_same_on_both_devices() {
        // Two devices merge the same pair; an id out of a random generator
        // would have them handing each other a conflict copy for ever.
        let base = task("a", "Comprar pao");
        let ours = task("a", "Comprar pao integral");
        let theirs = task("a", "Comprar pao frances");

        assert_eq!(
            written(&merged(&base, &ours, &theirs).lines),
            written(&merged(&base, &ours, &theirs).lines)
        );
    }

    // --------------------------------------------------------- what repeats

    #[test]
    fn a_freely_task_completed_on_both_devices_comes_back_once() {
        // Each side spawned an occurrence of its own when it ticked the task.
        // Only one comes back — the rule is one open at a time.
        let base = "- [ ] Regar as plantas <!--id:r1-->\n  repeat: freely\n";
        let ours = "- [ ] Regar as plantas <!--id:s1 created:2026-09-14-->\n  repeat: freely\n";
        let theirs = "- [ ] Regar as plantas <!--id:s2 created:2026-09-14-->\n  repeat: freely\n";

        let out = merged_with(
            base,
            ours,
            theirs,
            Departed {
                completed: HashSet::from(["r1".to_string()]),
                ..Default::default()
            },
        );
        let text = written(&out.lines);

        assert_eq!(text.matches("- [ ] Regar as plantas").count(), 1, "{text}");
        assert!(text.contains("id:s1"), "the smaller id stands, on both devices: {text}");
    }

    #[test]
    fn two_occurrences_the_base_already_knew_are_left_alone() {
        // Not a double spawn: the user wrote two of them, and the app does
        // not delete what it did not create.
        let base = format!(
            "{}{}",
            "- [ ] Regar <!--id:s1-->\n  repeat: freely\n",
            "- [ ] Regar <!--id:s2-->\n  repeat: freely\n"
        );
        let out = merged(&base, &base, &base);

        assert_eq!(written(&out.lines).matches("- [ ] Regar").count(), 2);
    }

    // ----------------------------------------------------------- completed

    #[test]
    fn the_same_completion_recorded_on_both_devices_is_one_line() {
        // `completed.md` only grows, and the two devices ticked the SAME
        // task: one line, ours, pointer and all.
        let ours = "- [x] Regar <!--id:r1 origin:jott.tasks/task-list.md spawned:s1-->\n";
        let theirs = "- [x] Regar <!--id:r1 origin:jott.tasks/task-list.md spawned:s2-->\n";

        let out = merge_lists(
            &lines(""),
            &lines(ours),
            &lines(theirs),
            &Departed::default(),
            Mode::Log,
        );
        let text = written(&out.lines);

        assert_eq!(text.matches("- [x] Regar").count(), 1, "{text}");
        assert!(text.contains("spawned:s1"), "ours stands: {text}");
        assert!(!text.contains(CLASH_MARK), "nothing is disputed in a log: {text}");
    }

    #[test]
    fn an_edit_to_a_task_ticked_here_is_handed_to_the_completed_file() {
        // We completed it, the other device renamed it. It does not walk back
        // into the list — the caller applies the edit where the task now is.
        let base = task("a", "Comprar pao");
        let out = merged_with(
            &base,
            "",
            &task("a", "Comprar pao integral"),
            Departed {
                completed: HashSet::from(["a".to_string()]),
                ..Default::default()
            },
        );

        assert_eq!(written(&out.lines).trim(), "");
        assert_eq!(out.completed_elsewhere.len(), 1);
        assert_eq!(out.completed_elsewhere[0].1.text, "Comprar pao integral");
    }

    // ------------------------------------------------------- what is not a task

    #[test]
    fn our_prose_is_the_prose_and_a_new_line_from_the_other_side_follows() {
        let base = format!("# Compras\n\n{}", task("a", "Pao"));
        let ours = format!("# Compras da semana\n\n{}", task("a", "Pao"));
        let theirs = format!("# Compras\n\n> lembrar do troco\n{}", task("a", "Pao"));

        let text = written(&merged(&base, &ours, &theirs).lines);

        assert!(text.contains("# Compras da semana"), "{text}");
        assert!(!text.contains("# Compras\n"), "their heading is not kept twice: {text}");
        assert!(text.contains("> lembrar do troco"), "{text}");
    }

    #[test]
    fn a_blank_line_is_not_an_addition() {
        let out = merged("", "- [ ] uma\n", "\n\n\n- [ ] uma\n");
        assert_eq!(written(&out.lines).trim(), "- [ ] uma");
    }

    #[test]
    fn merging_a_pair_twice_writes_the_same_thing() {
        // The merge runs on both devices and on every open: it has to be a
        // function of its three inputs and nothing else.
        let base = format!("{}{}", task("a", "Uma"), task("b", "Outra"));
        let ours = format!("{}{}", task("a", "Uma editada"), task("c", "Minha"));
        let theirs = format!("{}{}", task("b", "Outra editada"), task("d", "Dela"));

        let once = written(&merged(&base, &ours, &theirs).lines);
        let twice = written(&merged(&base, &once, &theirs).lines);

        assert_eq!(once, twice, "a second pass changes nothing");
    }
}
