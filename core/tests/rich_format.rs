//! The task format with dates, tags, priority, description, subtasks and
//! recurrence — `docs/project-strategy.md`, section 3.2.
//!
//! The promise being tested here is narrow and important: a file written by a
//! person keeps working, and a file written by the app stays readable by a
//! person. Everything else is detail.

use chrono::NaiveDate;
use jott_core::task::{Repeat, RepeatUnit};
use jott_core::{Line, TaskList};

fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(y, m, d).unwrap()
}

/// Parses a list from text, without touching the disk.
fn list(content: &str) -> TaskList {
    TaskList::from_str(content)
}

fn only_task(content: &str) -> jott_core::Task {
    let list = list(content);
    let tasks: Vec<_> = list.tasks().cloned().collect();
    assert_eq!(tasks.len(), 1, "expected exactly one task in:\n{content}");
    tasks.into_iter().next().unwrap()
}

// ------------------------------------------------------------ o essencial

#[test]
fn a_plain_task_is_still_a_plain_line() {
    // The whole point of the format: someone who just wants a checklist never
    // sees any of the machinery.
    let content = "- [ ] Comprar leite\n";
    let list = list(content);

    assert_eq!(list.tasks().count(), 1);
    assert_eq!(list.render(), content);
}

#[test]
fn reads_the_documented_example() {
    let content = "\
- [ ] Comprar material da obra <!--id:g7h8i9-->
  @2026-07-25 #casa #urgent !2
  Falar com o Jorge antes, ele tem desconto.
  repeat: every-week
  - [ ] Cimento
  - [ ] Areia
";
    let task = only_task(content);

    assert_eq!(task.text, "Comprar material da obra");
    assert_eq!(task.id.as_deref(), Some("g7h8i9"));
    assert_eq!(task.due, Some(ymd(2026, 7, 25)));
    assert_eq!(task.tags, vec!["casa", "urgent"]);
    assert_eq!(task.priority, Some(2));
    assert_eq!(
        task.description,
        vec!["Falar com o Jorge antes, ele tem desconto."]
    );
    assert_eq!(
        task.repeat,
        Some(Repeat {
            every: 1,
            unit: RepeatUnit::Week
        })
    );
    assert_eq!(task.subtasks.len(), 2);
    assert_eq!(task.subtasks[0].text, "Cimento");
    assert!(!task.subtasks[0].done);
}

#[test]
fn the_documented_example_round_trips_unchanged() {
    let content = "\
- [ ] Comprar material da obra <!--id:g7h8i9-->
  @2026-07-25 #casa #urgent !2
  Falar com o Jorge antes, ele tem desconto.
  repeat: every-week
  - [ ] Cimento
  - [ ] Areia
- [x] Pagar boleto <!--id:h6f2b2 origin:Compras-->
  @2026-07-25 #urgent
";
    assert_eq!(list(content).render(), content);
}

#[test]
fn several_tasks_do_not_bleed_into_each_other() {
    let content = "\
- [ ] Primeira
  @2026-07-25
  descrição da primeira
- [ ] Segunda
  #tag
- [ ] Terceira
";
    let list = list(content);
    let tasks: Vec<_> = list.tasks().cloned().collect();

    assert_eq!(tasks.len(), 3);
    assert_eq!(tasks[0].description, vec!["descrição da primeira"]);
    assert!(tasks[1].description.is_empty());
    assert_eq!(tasks[1].tags, vec!["tag"]);
    assert_eq!(tasks[2].due, None);
    assert_eq!(list.render(), content);
}

// ------------------------------------------------- o que o humano escreve

#[test]
fn a_description_starting_with_a_hash_is_not_metadata() {
    // The reason the metadata line requires *every* token to be a token.
    let content = "\
- [ ] Ligar pro contador
  #1 prioridade do mês, não esquecer
";
    let task = only_task(content);

    assert!(task.tags.is_empty(), "tags: {:?}", task.tags);
    assert_eq!(task.description, vec!["#1 prioridade do mês, não esquecer"]);
    assert_eq!(list(content).render(), content);
}

#[test]
fn an_unknown_named_field_is_kept_as_description() {
    // Never lose a line. `lembrar:` is not ours, so it stays text.
    let content = "\
- [ ] Ligar pro contador
  lembrar: perguntar sobre a NF
";
    let task = only_task(content);

    assert_eq!(task.description, vec!["lembrar: perguntar sobre a NF"]);
    assert_eq!(list(content).render(), content);
}

#[test]
fn an_unparseable_repeat_stays_description_instead_of_vanishing() {
    let content = "\
- [ ] Regar as plantas
  repeat: quando lembrar
";
    let task = only_task(content);

    assert_eq!(task.repeat, None);
    assert_eq!(task.description, vec!["repeat: quando lembrar"]);
    assert_eq!(list(content).render(), content);
}

#[test]
fn metadata_can_come_in_any_order() {
    let task = only_task("- [ ] Tarefa\n  !3 #casa @2026-07-25 #fiscal\n");

    assert_eq!(task.due, Some(ymd(2026, 7, 25)));
    assert_eq!(task.priority, Some(3));
    assert_eq!(task.tags, vec!["casa", "fiscal"]);
}

#[test]
fn metadata_and_description_can_come_in_any_order() {
    let task = only_task(
        "- [ ] Tarefa\n  uma explicação primeiro\n  @2026-07-25 #casa\n  e mais texto\n",
    );

    assert_eq!(task.due, Some(ymd(2026, 7, 25)));
    assert_eq!(task.tags, vec!["casa"]);
    assert_eq!(
        task.description,
        vec!["uma explicação primeiro", "e mais texto"]
    );
}

#[test]
fn a_hand_typed_date_is_normalised_to_iso() {
    // Same courtesy as the hand-written checkbox: accept what the person
    // typed, write back the canonical form.
    for typed in ["25-07-2026", "25/07/2026"] {
        let task = only_task(&format!("- [ ] Tarefa\n  @{typed}\n"));
        assert_eq!(task.due, Some(ymd(2026, 7, 25)), "digitado: {typed}");
        assert!(
            task.render_block().contains("@2026-07-25"),
            "deveria gravar ISO, gravou: {}",
            task.render_block()
        );
    }
}

#[test]
fn an_invalid_date_or_priority_makes_the_line_description() {
    // Better a line that reads oddly than a date silently thrown away.
    for line in ["@2026-13-45", "!9", "@ontem"] {
        let task = only_task(&format!("- [ ] Tarefa\n  {line}\n"));
        assert_eq!(task.due, None, "linha: {line}");
        assert_eq!(task.priority, None, "linha: {line}");
        assert_eq!(task.description, vec![line.to_string()]);
    }
}

#[test]
fn blank_lines_and_prose_around_tasks_survive() {
    let content = "\
# Minha lista

Uma introdução qualquer.

- [ ] Comprar leite
  @2026-07-25

Um comentário no meio.

- [ ] Outra tarefa
";
    let list = list(content);

    assert_eq!(list.tasks().count(), 2);
    assert_eq!(list.render(), content);
}

// ------------------------------------------------------------- subtarefas

#[test]
fn subtasks_carry_only_text_and_state() {
    let task = only_task("- [ ] Obra\n  - [x] Cimento\n  - [ ] Areia\n");

    assert_eq!(task.subtasks.len(), 2);
    assert!(task.subtasks[0].done);
    assert_eq!(task.subtasks[0].text, "Cimento");
    assert!(!task.subtasks[1].done);
}

#[test]
fn a_deeper_indent_still_belongs_to_the_task() {
    // People indent by feel; four spaces means the same thing as two.
    let task = only_task("- [ ] Obra\n    - [ ] Cimento\n    mais contexto\n");

    assert_eq!(task.subtasks.len(), 1);
    assert_eq!(task.description, vec!["mais contexto"]);
}

// -------------------------------------------------- compatibilidade e id

#[test]
fn the_old_format_still_reads_and_keeps_its_meta() {
    // A notebook written by 0.4 must not lose anything on the way in.
    let content = "- [x] Pagar internet <!--id:d4e5f6 origin:Compras meta:{\"k\":1}-->\n";
    let task = only_task(content);

    assert_eq!(task.id.as_deref(), Some("d4e5f6"));
    assert_eq!(task.origin.as_deref(), Some("Compras"));
    assert_eq!(task.meta, Some(serde_json::json!({ "k": 1 })));
    assert_eq!(list(content).render(), content);
}

#[test]
fn a_task_with_no_metadata_writes_no_comment() {
    // The lazy id promise: a plain checklist has no machinery in it.
    let mut list = list("");
    list.add_text("Comprar leite");

    assert_eq!(list.render(), "- [ ] Comprar leite\n");
}

#[test]
fn created_is_written_only_when_it_exists() {
    let content = "- [ ] Regar as plantas <!--created:2026-07-20-->\n  repeat: every-week\n";
    let task = only_task(content);

    assert_eq!(task.created, Some(ymd(2026, 7, 20)));
    assert_eq!(list(content).render(), content);
}

#[test]
fn the_completion_date_survives_a_round_trip() {
    // Stamped on completion (2026-08-04) so the by-completion ordering has a
    // date to read; hidden in the comment like every app-owned field.
    let content = "- [x] Pagar internet <!--id:a1 created:2026-07-30 completed:2026-08-01-->\n";
    let task = only_task(content);

    assert_eq!(task.completed, Some(ymd(2026, 8, 1)));
    assert_eq!(list(content).render(), content);
}

// ------------------------------------------------------------ recorrência

#[test]
fn parses_both_repeat_shapes() {
    assert_eq!(
        Repeat::parse("every-week"),
        Some(Repeat { every: 1, unit: RepeatUnit::Week })
    );
    assert_eq!(
        Repeat::parse("every-3-days"),
        Some(Repeat { every: 3, unit: RepeatUnit::Day })
    );
    assert_eq!(
        Repeat::parse("every-2-months"),
        Some(Repeat { every: 2, unit: RepeatUnit::Month })
    );
}

#[test]
fn repeat_round_trips_through_text() {
    for text in ["every-day", "every-week", "every-month", "every-3-days"] {
        assert_eq!(Repeat::parse(text).unwrap().render(), text);
    }
}

#[test]
fn refuses_nonsense_repeats() {
    for text in ["every-0-days", "every-", "weekly", "every-3-fortnights", ""] {
        assert_eq!(Repeat::parse(text), None, "{text:?} should not parse");
    }
}

// --------------------------------------------------------- tags reservadas

#[test]
fn reserved_tags_are_recognised_only_in_english() {
    let task = only_task("- [ ] Tarefa\n  #urgent #pinned #urgente\n");

    assert!(task.is_marked_urgent());
    assert!(task.is_pinned());
    // The Portuguese one is a normal tag: reserving every translation is not
    // something we can promise.
    assert!(task.tags.iter().any(|t| t == "urgente"));
}

// ------------------------------------------------------------ preservação

#[test]
fn editing_one_task_leaves_the_rest_of_the_file_byte_identical() {
    let content = "\
# Lista

- [ ] Primeira <!--id:aaa111-->
  @2026-07-25 #casa
  com descrição
- [ ] Segunda
  - [ ] sub

Rodapé em prosa.
";
    let mut list = list(content);
    list.edit_text("aaa111", "Primeira editada").unwrap();

    let rendered = list.render();
    assert!(rendered.contains("- [ ] Primeira editada <!--id:aaa111-->"));
    assert!(rendered.contains("  @2026-07-25 #casa"));
    assert!(rendered.contains("  com descrição"));
    assert!(rendered.contains("Rodapé em prosa."));
    assert!(rendered.contains("  - [ ] sub"));
}

#[test]
fn a_line_that_is_not_indented_is_not_absorbed() {
    let content = "- [ ] Tarefa\numa linha sem indentação\n";
    let list = list(content);

    assert_eq!(list.tasks().next().unwrap().description.len(), 0);
    assert!(matches!(list.lines().last(), Some(Line::Raw(_))));
    assert_eq!(list.render(), content);
}

// ------------------------------------------------------------------
// Hostile round-trips (structural analysis 2026-07, items 2.2 and 2.3).
// The promise under test: nothing a caller can write through the API may
// silently change meaning on the next read.

#[test]
fn an_origin_with_spaces_survives_the_comment_round_trip() {
    // `origin:Meu Mercado` used to read back as `Meu`, and undoing a
    // completed task then CREATED a list called "Meu". Spaced names are a
    // documented case — `Projeto Y.md` is the example in the spec.
    let mut task = jott_core::Task::new("Pagar boleto");
    task.id = Some("a1".into());
    task.origin = Some("Meu Mercado".into());

    let rendered = task.render_block();
    assert!(
        rendered.contains("origin:\"Meu Mercado\""),
        "a spaced value must be quoted: {rendered}"
    );

    let reread = jott_core::TaskList::from_str(&rendered);
    let back = reread.tasks().next().unwrap();
    assert_eq!(back.origin.as_deref(), Some("Meu Mercado"));
    assert_eq!(back.id.as_deref(), Some("a1"));
}

#[test]
fn an_unspaced_origin_stays_unquoted_so_existing_files_do_not_change() {
    let mut task = jott_core::Task::new("Pagar boleto");
    task.id = Some("a1".into());
    task.origin = Some("Compras".into());
    assert!(task.render_block().contains("origin:Compras"));
}

#[test]
fn a_hand_quoted_comment_field_is_read_even_with_other_fields_after_it() {
    let task = jott_core::Task::parse(
        r#"- [x] Pagar <!--id:a1 origin:"Projeto v2.0 Final" created:2026-07-01-->"#,
    )
    .unwrap();
    assert_eq!(task.origin.as_deref(), Some("Projeto v2.0 Final"));
    assert!(task.created.is_some(), "fields after the quoted one still parse");
}

#[test]
fn normalize_tag_turns_anything_into_one_token_or_nothing() {
    use jott_core::task::normalize_tag;
    assert_eq!(normalize_tag("casa nova"), Some("casa-nova".into()));
    assert_eq!(normalize_tag("  #urgent "), Some("urgent".into()));
    assert_eq!(normalize_tag("##a  b   c"), Some("a-b-c".into()));
    assert_eq!(normalize_tag("   "), None);
    assert_eq!(normalize_tag("#"), None);
}

#[test]
fn a_normalized_tag_round_trips_without_eating_the_metadata_line() {
    // The bug this guards: tags = ["casa nova"] rendered as `#casa nova`,
    // the loose word stopped the line from being all-tokens, and the whole
    // line — date and priority included — silently became description.
    let mut task = jott_core::Task::new("Comprar material");
    task.due = chrono::NaiveDate::from_ymd_opt(2026, 7, 25);
    task.priority = Some(2);
    task.tags = vec![jott_core::task::normalize_tag("casa nova").unwrap()];

    let reread = jott_core::TaskList::from_str(&task.render_block());
    let back = reread.tasks().next().unwrap();
    assert_eq!(back.due, task.due, "the date must survive");
    assert_eq!(back.priority, Some(2), "the priority must survive");
    assert_eq!(back.tags, vec!["casa-nova"]);
    assert!(back.description.is_empty(), "nothing may degrade to description");
}

#[test]
fn task_text_is_collapsed_to_a_single_line() {
    // A `\n` inside a name would render as two lines and re-read as a task
    // plus a stray description — same family of silent corruption.
    let task = jott_core::Task::new("Comprar\nleite  integral");
    assert_eq!(task.text, "Comprar leite integral");

    let reread = jott_core::TaskList::from_str(&task.render_block());
    assert_eq!(reread.tasks().count(), 1);
}

#[test]
fn pinning_rides_in_the_hidden_comment_and_unpinning_removes_it() {
    // The card's bookmark (2026-08-05). Pinning is filing, not a label: it must
    // not appear as a `#pinned` tag, which would show as a coloured pill and
    // land in the tag manager.
    let mut tasks = list("- [ ] Pagar boleto <!--id:abc-->\n");
    let task = tasks.task_mut("abc").unwrap();
    task.pinned = true;
    let rendered = tasks.render();
    assert!(rendered.contains("pinned:true"), "{rendered}");
    assert!(!rendered.contains("#pinned"), "{rendered}");

    let reread = list(&rendered);
    assert!(reread.tasks().next().unwrap().is_pinned());

    // Unpinning takes the field out rather than leaving `pinned:false` behind.
    let mut tasks = list(&rendered);
    tasks.task_mut("abc").unwrap().pinned = false;
    let rendered = tasks.render();
    assert!(!rendered.contains("pinned"), "{rendered}");

    // A `#pinned` tag written by hand still counts — what the human writes
    // keeps working; the app just stops writing it that way.
    let by_hand = list("- [ ] Ligar\n  #pinned\n");
    assert!(by_hand.tasks().next().unwrap().is_pinned());
}
