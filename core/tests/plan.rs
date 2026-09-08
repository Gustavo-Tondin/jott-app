//! The day and the days ahead: references not copies, the plan pouring
//! into today, suggestions, dated and urgent tasks.

use std::path::Path;

use jott_core::config::{Config, RolloverMode};
use jott_core::{Error, Notebook};

mod common;
use common::{add_in_today, ahead, init, notebook_with_task, read};

// ------------------------------------------------- the day and the plan

#[test]
fn pulling_a_task_writes_a_reference_not_a_copy() {
    let (dir, notebook, id) = notebook_with_task("Comprar leite");

    assert!(notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap());
    assert!(notebook.pull_into_day(ahead(&notebook, 2), "jott.tasks/task-list.md", &id).unwrap());

    for file in [".jott/daily-state.json", ".jott/plan.json"] {
        let state = read(dir.path().join(file));
        assert!(state.contains(&id), "{file}: {state}");
        // The text must live in exactly one place: the list file.
        assert!(!state.contains("Comprar leite"), "{file}: {state}");
    }
    // The plan says which day, in the documented shape.
    let plan: serde_json::Value = serde_json::from_str(&read(dir.path().join(".jott/plan.json"))).unwrap();
    let day = ahead(&notebook, 2).unwrap().to_string();
    assert_eq!(plan["days"][&day][0]["id"], id);
}

#[test]
fn a_day_gone_by_cannot_be_planned() {
    let (dir, notebook, id) = notebook_with_task("Comprar leite");
    let yesterday = ahead(&notebook, -1);

    for result in [
        notebook.pull_into_day(yesterday, "jott.tasks/task-list.md", &id).map(|_| ()),
        notebook.remove_from_day(yesterday, "jott.tasks/task-list.md", &id).map(|_| ()),
        notebook.set_day_order(yesterday, &[]),
    ] {
        assert!(matches!(result, Err(Error::DayGone(_))), "{result:?}");
    }
    // What a day gone by shows is the log, not a list.
    assert!(notebook.day_tasks(yesterday).unwrap().is_empty());
    assert!(!dir.path().join(".jott/plan.json").exists());
}

#[test]
fn a_planned_day_pours_into_today_when_it_arrives() {
    // The app was closed over two planned days: both arrive at once, into
    // today, earliest first, after what today already held — and the plan
    // forgets them. A task the user meant to face is faced on the first day
    // there is left to face it on.
    let (dir, notebook) = init();
    let mut inbox = notebook.inbox().unwrap();
    let already = inbox.add_text_with_id("Já estava em hoje");
    let old = inbox.add_text_with_id("Planejada pra anteontem");
    let due = inbox.add_text_with_id("Planejada pra hoje");
    let later = inbox.add_text_with_id("Planejada pra amanhã");
    inbox.save().unwrap();
    notebook.pull_into_day(None, "jott.tasks/task-list.md", &already).unwrap();

    let today = notebook.today();
    let day = |offset: i64| (today + chrono::Duration::days(offset)).to_string();
    let reference = |id: &str| serde_json::json!({ "path": "jott.tasks/task-list.md", "id": id });
    std::fs::write(
        dir.path().join(".jott/plan.json"),
        serde_json::json!({ "days": {
            day(-2): [reference(&old)],
            day(0): [reference(&due)],
            day(1): [reference(&later)],
        }})
        .to_string(),
    )
    .unwrap();

    let ids: Vec<String> = notebook
        .day_tasks(None)
        .unwrap()
        .into_iter()
        .map(|listed| listed.task.id.unwrap())
        .collect();
    assert_eq!(ids, vec![already, old, due]);

    let plan = notebook.open_plan().unwrap().plan;
    assert_eq!(plan.days.keys().copied().collect::<Vec<_>>(), vec![today + chrono::Duration::days(1)]);
    assert!(plan.contains(today + chrono::Duration::days(1), "jott.tasks/task-list.md", &later));
    // And the file agrees.
    let on_disk: serde_json::Value = serde_json::from_str(&read(dir.path().join(".jott/plan.json"))).unwrap();
    assert!(on_disk["days"].get(day(-2)).is_none());
    assert!(on_disk["days"].get(day(0)).is_none());
}

#[test]
fn the_weekly_state_of_older_notebooks_is_removed_on_open() {
    // The week stopped being a period on 2026-09-04 (user call: the file goes).
    let (dir, _) = init();
    let stale = dir.path().join(".jott/weekly-state.json");
    std::fs::write(&stale, r#"{"date":"2026-08-31","items":[]}"#).unwrap();

    Notebook::open(dir.path()).unwrap();
    assert!(!stale.exists());
}

#[test]
fn pulling_the_same_task_twice_is_idempotent() {
    let (_dir, notebook, id) = notebook_with_task("Comprar leite");

    assert!(notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap());
    assert!(!notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap());
    assert_eq!(notebook.open_state().unwrap().state.len(), 1);
}

#[test]
fn pulling_a_task_that_does_not_exist_is_refused() {
    let (dir, notebook) = init();

    let err = notebook.pull_into_day(None, "jott.tasks/task-list.md", "ghost").unwrap_err();
    assert!(matches!(err, Error::TaskNotFound(_)));
    assert!(!dir.path().join(".jott/daily-state.json").exists());
}

#[test]
fn removing_from_a_period_leaves_the_task_alone() {
    let (dir, notebook, id) = notebook_with_task("Comprar leite");

    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();
    assert!(notebook.remove_from_day(None, "jott.tasks/task-list.md", &id).unwrap());

    assert!(notebook.open_state().unwrap().state.is_empty());
    assert!(read(dir.path().join("jott.tasks/task-list.md")).contains("Comprar leite"));
}

#[test]
fn a_task_created_in_today_is_physically_written_to_the_inbox() {
    // Spec 3: Day and Week never store content of their own.
    let (dir, notebook) = init();

    let id = add_in_today(&notebook, "Responder e-mail").unwrap();

    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(inbox.contains("- [ ] Responder e-mail"));
    assert!(inbox.contains(&format!("id:{id}")));

    let state = notebook.open_state().unwrap();
    assert!(state.state.contains("jott.tasks/task-list.md", &id));
}

#[test]
fn the_state_rolls_over_when_the_notebook_is_reopened_later() {
    let (dir, notebook, id) = notebook_with_task("Comprar leite");
    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();

    // Simulate the app having been closed since an old day, by rewriting the
    // state's date the way it would look on disk.
    let path = dir.path().join(".jott/daily-state.json");
    let mut state: serde_json::Value =
        serde_json::from_str(&read(&path)).unwrap();
    state["date"] = serde_json::json!("2020-01-01");
    std::fs::write(&path, state.to_string()).unwrap();

    let reopened = Notebook::open(dir.path()).unwrap();
    let rolled = reopened.open_state().unwrap();

    // Default mode is reset: the day starts empty...
    assert!(rolled.state.is_empty());
    assert_eq!(rolled.state.date, reopened.today());
    // ...and the task itself is untouched, back to being a suggestion.
    assert!(read(dir.path().join("jott.tasks/task-list.md")).contains("Comprar leite"));
}

#[test]
fn carry_mode_keeps_the_pulled_tasks_across_the_turn() {
    let (dir, mut notebook, id) = notebook_with_task("Comprar leite");

    let mut config = Config::default();
    config.rollover.daily.mode = RolloverMode::Carry;
    notebook.set_config(config).unwrap();

    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();

    let path = dir.path().join(".jott/daily-state.json");
    let mut state: serde_json::Value = serde_json::from_str(&read(&path)).unwrap();
    state["date"] = serde_json::json!("2020-01-01");
    std::fs::write(&path, state.to_string()).unwrap();

    let reopened = Notebook::open(dir.path()).unwrap();
    let rolled = reopened.open_state().unwrap();

    assert!(rolled.state.contains("jott.tasks/task-list.md", &id));
    assert_eq!(rolled.state.date, reopened.today());
}

// ------------------------------------------------------------- sugestões

#[test]
fn the_day_suggests_the_lists_in_their_own_order_plan_or_no_plan() {
    // A task planned for a day ahead is still offered to today — two days
    // are two choices — and the order is the lists', as the sidebar has them.
    let (_dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut inbox = notebook.inbox().unwrap();
    let solta = inbox.add_text_with_id("Tarefa solta");
    inbox.save().unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let planejada = compras.add_text_with_id("Escolhida pra amanhã");
    compras.save().unwrap();

    notebook
        .pull_into_day(ahead(&notebook, 1), "jott.tasks/Compras.md", &planejada)
        .unwrap();

    let suggestions = notebook.suggestions_for(None).unwrap();
    let ids: Vec<_> = suggestions
        .iter()
        .map(|s| s.task.id.clone().unwrap())
        .collect();

    assert_eq!(ids, vec![planejada.clone(), solta]);
    assert_eq!(suggestions[0].path, "jott.tasks/Compras.md");
    // And tomorrow is not offered what it already holds.
    let tomorrow = notebook.suggestions_for(ahead(&notebook, 1)).unwrap();
    assert_eq!(tomorrow.len(), 1);
    assert_eq!(tomorrow[0].task.text, "Tarefa solta");
}

#[test]
fn a_task_already_pulled_is_not_suggested_again() {
    let (_dir, notebook, id) = notebook_with_task("Comprar leite");

    assert_eq!(notebook.suggestions_for(None).unwrap().len(), 1);
    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();
    assert!(notebook.suggestions_for(None).unwrap().is_empty());
}

#[test]
fn completed_tasks_are_never_suggested() {
    let (_dir, notebook, id) = notebook_with_task("Comprar leite");

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();

    assert!(notebook.suggestions_for(None).unwrap().is_empty());
    assert!(notebook.suggestions_for(ahead(&notebook, 1)).unwrap().is_empty());
}

#[test]
fn a_day_ahead_is_offered_what_today_already_took() {
    // Days are independent — pulling into today does not remove a task
    // from tomorrow's suggestions.
    let (_dir, notebook, id) = notebook_with_task("Comprar leite");

    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();

    let tomorrow = notebook.suggestions_for(ahead(&notebook, 1)).unwrap();
    assert_eq!(tomorrow.len(), 1);
    assert_eq!(tomorrow[0].task.id.as_deref(), Some(id.as_str()));
}

#[test]
fn period_tasks_resolves_references_to_real_tasks() {
    let (_dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();
    notebook.pull_into_day(None, "jott.tasks/Compras.md", &id).unwrap();

    let pulled = notebook.day_tasks(None).unwrap();
    assert_eq!(pulled.len(), 1);
    assert_eq!(pulled[0].path, "jott.tasks/Compras.md");
    assert_eq!(pulled[0].task.text, "Comprar leite");
}

#[test]
fn a_reference_to_a_task_deleted_elsewhere_is_skipped() {
    // The notebook is shared with other editors; a stale reference is normal.
    let (dir, notebook, id) = notebook_with_task("Comprar leite");
    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();

    // Someone deletes the line in Obsidian.
    std::fs::write(dir.path().join("jott.tasks/task-list.md"), "").unwrap();

    assert!(notebook.day_tasks(None).unwrap().is_empty());
}

// ------------------------------------------------------ urgência e grupos

/// Writes a list where dates are relative to today, so the test does not go
/// stale when the calendar moves.
fn write_dated_list(dir: &Path, list: &str, entries: &[(&str, i64)]) {
    let today = chrono::Local::now().date_naive();
    let body: String = entries
        .iter()
        .map(|(text, offset)| {
            let due = today + chrono::Duration::days(*offset);
            format!("- [ ] {text}\n  @{due}\n")
        })
        .collect();
    // The fixed tasks space is a folder of its own, so its lists are written
    // inside it and never at the notebook root.
    std::fs::write(
        dir.join("jott.tasks").join(format!("{list}.md")),
        body,
    )
    .unwrap();
}

#[test]
fn suggestions_come_grouped_by_why_they_are_offered() {
    use jott_core::notebook::SuggestionGroup;

    let (dir, mut notebook) = init();
    // What is under test is how a suggestion is GROUPED, and since 2026-08-14 a
    // dated task is already in the day and therefore not suggested at all. So
    // this asks the question the old way round: dates that only rank.
    let mut config = notebook.config().clone();
    config.dated_tasks_join_period = false;
    notebook.set_config(config).unwrap();
    write_dated_list(
        dir.path(),
        "Inbox",
        &[
            ("Bem no futuro", 30),
            ("Vencida ontem", -1),
            ("Daqui a dois dias", 2),
            ("Para hoje", 0),
        ],
    );

    let suggestions = notebook.grouped_suggestions(None).unwrap();
    let by_text = |text: &str| {
        suggestions
            .iter()
            .find(|s| s.task.text == text)
            .unwrap_or_else(|| panic!("{text} não sugerida"))
            .group
    };

    assert_eq!(by_text("Vencida ontem"), SuggestionGroup::Urgent);
    assert_eq!(by_text("Para hoje"), SuggestionGroup::Urgent);
    assert_eq!(by_text("Daqui a dois dias"), SuggestionGroup::Soon);
    assert_eq!(by_text("Bem no futuro"), SuggestionGroup::Lists);

    // And the urgent ones really come first on screen.
    assert_eq!(suggestions[0].group, SuggestionGroup::Urgent);
    assert!(
        suggestions.windows(2).all(|w| w[0].group <= w[1].group),
        "grupos fora de ordem: {:?}",
        suggestions.iter().map(|s| s.group).collect::<Vec<_>>()
    );
}

#[test]
fn a_task_taken_out_of_the_day_comes_back_as_a_recent_suggestion() {
    // 2026-08-17: taking something out of Today is not the same as never
    // having planned it, and until now the way back was to find it again in
    // the middle of its list.
    use jott_core::notebook::SuggestionGroup;

    let (_dir, notebook, id) = notebook_with_task("Arrumar o site");
    let inbox = Notebook::inbox_path();

    // A second task nobody ever pulled, so the two groups can be told apart.
    let mut list = notebook.open_list(&inbox).unwrap();
    list.add_text_with_id("Comprar café");
    list.save().unwrap();

    notebook.pull_into_day(None, &inbox, &id).unwrap();
    // While it is in the day it is not offered at all.
    assert!(
        notebook
            .grouped_suggestions(None)
            .unwrap()
            .iter()
            .all(|s| s.task.text != "Arrumar o site"),
        "uma tarefa que já está no dia não é sugestão"
    );

    notebook.remove_from_day(None, &inbox, &id).unwrap();

    let suggestions = notebook.grouped_suggestions(None).unwrap();
    let group_of = |text: &str| {
        suggestions
            .iter()
            .find(|s| s.task.text == text)
            .unwrap_or_else(|| panic!("{text} não sugerida"))
            .group
    };
    assert_eq!(group_of("Arrumar o site"), SuggestionGroup::Recent);
    assert_eq!(group_of("Comprar café"), SuggestionGroup::Lists);
    // And it is offered before the plain list entries.
    assert_eq!(suggestions[0].task.text, "Arrumar o site");

    // Pulled back in, it stops being a departure — nothing left to offer.
    notebook.pull_into_day(None, &inbox, &id).unwrap();
    notebook.remove_from_day(None, &inbox, &id).unwrap();
    notebook.pull_into_day(None, &inbox, &id).unwrap();
    assert!(
        notebook
            .grouped_suggestions(None)
            .unwrap()
            .iter()
            .all(|s| s.group != SuggestionGroup::Recent),
        "o histórico devia esquecer o que voltou para o dia"
    );
}

#[test]
fn leaving_a_day_ahead_is_a_plan_changing_not_a_departure() {
    // Only today remembers what left it: a task taken out of tomorrow was
    // never faced, so there is nothing to offer back.
    use jott_core::notebook::SuggestionGroup;

    let (_dir, notebook, id) = notebook_with_task("Revisar proposta");
    let inbox = Notebook::inbox_path();

    notebook.pull_into_day(ahead(&notebook, 1), &inbox, &id).unwrap();
    assert!(notebook.remove_from_day(ahead(&notebook, 1), &inbox, &id).unwrap());
    assert!(!notebook.remove_from_day(ahead(&notebook, 1), &inbox, &id).unwrap());

    let suggestions = notebook.grouped_suggestions(None).unwrap();
    assert_eq!(suggestions[0].group, SuggestionGroup::Lists);
    assert_eq!(suggestions[0].task.text, "Revisar proposta");
}

#[test]
fn the_urgent_tag_counts_as_much_as_a_date() {
    use jott_core::notebook::SuggestionGroup;

    let (dir, notebook) = init();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Sem data, mas urgente\n  #urgent\n",
    )
    .unwrap();

    let suggestions = notebook.grouped_suggestions(None).unwrap();
    assert_eq!(suggestions[0].group, SuggestionGroup::Urgent);
}

#[test]
fn the_automatic_urgency_can_be_switched_off() {
    // For people who do not want the interface flagging deadlines on its own.
    use jott_core::notebook::SuggestionGroup;

    let (dir, mut notebook) = init();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);

    let mut config = notebook.config().clone();
    config.auto_urgent_by_date = false;
    // Same reason as the grouping test: a dated task is in the day now, and
    // this one is about whether a date FLAGS, not about where it lands.
    config.dated_tasks_join_period = false;
    notebook.set_config(config).unwrap();

    let suggestions = notebook.grouped_suggestions(None).unwrap();
    assert_ne!(
        suggestions[0].group,
        SuggestionGroup::Urgent,
        "a data não deve marcar sozinha quando a opção está desligada"
    );

    // The hand-written tag still counts.
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Vencida ontem\n  #urgent\n",
    )
    .unwrap();
    let suggestions = notebook.grouped_suggestions(None).unwrap();
    assert_eq!(suggestions[0].group, SuggestionGroup::Urgent);
}

#[test]
fn a_dated_task_joins_the_day_without_ever_being_written_into_it() {
    // The rule flipped on 2026-08-14 (spec 3.3.1): a date used to change only
    // the ORDER of the suggestions, so a task written for today sat in a list
    // until the user went looking for it — the app quietly failing at the one
    // thing a date is for.
    //
    // What did NOT change: the state file. The task is added when the period is
    // READ, so the turn of the day has nothing to clean up and un-dating a task
    // takes it straight back out.
    let (dir, notebook) = init();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);

    let day = notebook.day_tasks(None).unwrap();
    assert_eq!(day.len(), 1, "uma tarefa com data entra no dia sozinha");
    assert_eq!(day[0].task.text, "Vencida ontem");

    assert!(
        notebook.open_state().unwrap().state.is_empty(),
        "e entra sem nada ser gravado no estado"
    );
    // It is in the day, so it is no longer something to suggest putting there.
    assert_eq!(notebook.grouped_suggestions(None).unwrap().len(), 0);
}

#[test]
fn switching_the_option_off_gives_the_manual_day_back() {
    // The old rule is still there for whoever wants it: the day as a 100%
    // deliberate choice.
    let (dir, mut notebook) = init();
    let mut config = notebook.config().clone();
    config.dated_tasks_join_period = false;
    notebook.set_config(config).unwrap();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);

    assert!(notebook.day_tasks(None).unwrap().is_empty());
    assert_eq!(notebook.grouped_suggestions(None).unwrap().len(), 1);
}

#[test]
fn a_task_dated_ahead_joins_its_own_day_and_no_other() {
    // The calendar shows a dated task on the day it is due (user call,
    // 2026-09-04), without anyone planning it — and only there: what is
    // overdue belongs to today, not to the 5th.
    let (dir, notebook) = init();
    write_dated_list(dir.path(), "Inbox", &[("Entrega", 3), ("Atrasada", -1)]);

    let texts = |day: Option<chrono::NaiveDate>| -> Vec<String> {
        notebook
            .day_tasks(day)
            .unwrap()
            .into_iter()
            .map(|listed| listed.task.text)
            .collect()
    };

    assert_eq!(texts(None), vec!["Atrasada"]);
    assert_eq!(texts(ahead(&notebook, 3)), vec!["Entrega"]);
    assert!(texts(ahead(&notebook, 2)).is_empty());
    assert!(texts(ahead(&notebook, 4)).is_empty());
    // Nothing was written into the plan for it.
    assert!(!dir.path().join(".jott/plan.json").exists());
}

#[test]
fn a_dated_task_ticked_today_stays_in_the_day_as_done() {
    // Ticking it on the Home used to make it vanish, and the summary went
    // from "0 of 3" to "0 of 2" instead of "1 of 3" (user report,
    // 2026-09-07). Today keeps what it finished, the way it keeps a task
    // pulled by hand.
    let (dir, notebook) = init();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1), ("Para hoje", 0)]);
    let id = notebook.ensure_task_id("jott.tasks/Inbox.md", 0).unwrap();
    notebook.complete_task("jott.tasks/Inbox.md", &id).unwrap();

    let day = notebook.day_tasks(None).unwrap();
    assert_eq!(day.len(), 2, "the ticked one is still counted");
    let ticked = day.iter().find(|l| l.task.text == "Vencida ontem").unwrap();
    assert!(ticked.task.done);
    assert_eq!(ticked.path, "jott.tasks/completed.md", "read from where it went");
    assert_eq!(day.iter().filter(|l| l.task.done).count(), 1);
    // Nothing was written into the state for it: still added on READ.
    assert!(notebook.open_state().unwrap().state.is_empty());
}

#[test]
fn a_dated_task_ticked_on_another_day_stays_out_of_the_day() {
    // A date on a task finished some other day is history, not a plan.
    let (dir, notebook) = init();
    let today = notebook.today();
    let yesterday = today - chrono::Duration::days(1);
    std::fs::write(
        dir.path().join("jott.tasks/completed.md"),
        format!("- [x] Feita ontem <!--id:d1 completed:{yesterday} origin:Inbox-->\n  @{yesterday}\n"),
    )
    .unwrap();

    assert!(notebook.day_tasks(None).unwrap().is_empty());
    assert!(notebook.day_tasks(ahead(&notebook, 1)).unwrap().is_empty());
}
