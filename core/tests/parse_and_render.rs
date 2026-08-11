//! Parser and writer of the task line format.
//!
//! Users can edit these files in any Markdown editor, so the format is a
//! contract. These tests are its executable specification.

use jott_core::{Task, TaskList};

fn list_from(content: &str) -> TaskList {
    let dir = std::env::temp_dir().join("jott-parse-tests");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("list-{}.md", jott_core::id::generate()));
    std::fs::write(&path, content).unwrap();
    TaskList::load(path).unwrap()
}

#[test]
fn parses_a_plain_open_task() {
    let task = Task::parse("- [ ] Comprar leite <!--id:a1b2c3-->").unwrap();
    assert_eq!(task.text, "Comprar leite");
    assert_eq!(task.id.as_deref(), Some("a1b2c3"));
    assert!(!task.done);
    assert_eq!(task.origin, None);
}

#[test]
fn parses_a_completed_task_with_origin() {
    let task = Task::parse("- [x] Pagar internet <!--id:d4e5f6 origin:Compras-->").unwrap();
    assert_eq!(task.text, "Pagar internet");
    assert_eq!(task.id.as_deref(), Some("d4e5f6"));
    assert!(task.done);
    assert_eq!(task.origin.as_deref(), Some("Compras"));
}

#[test]
fn accepts_a_checkbox_typed_by_hand_without_an_id() {
    // Someone editing the file in Obsidian writes plain Markdown. The app has
    // to adopt it, not ignore it.
    let task = Task::parse("- [ ] Ligar pro dentista").unwrap();
    assert_eq!(task.text, "Ligar pro dentista");
    assert_eq!(task.id, None);
}

#[test]
fn accepts_uppercase_x_and_other_bullet_markers() {
    assert!(Task::parse("- [X] feito").unwrap().done);
    assert_eq!(Task::parse("* [ ] com asterisco").unwrap().text, "com asterisco");
    assert_eq!(Task::parse("+ [ ] com mais").unwrap().text, "com mais");
}

#[test]
fn preserves_indentation_of_nested_tasks() {
    let task = Task::parse("    - [ ] subtarefa <!--id:aaa111-->").unwrap();
    assert_eq!(task.indent, "    ");
    assert_eq!(task.render_block(), "    - [ ] subtarefa <!--id:aaa111-->");
}

#[test]
fn ignores_lines_that_are_not_tasks() {
    for line in [
        "# Minhas tarefas",
        "",
        "Um parágrafo qualquer.",
        "- item de lista sem checkbox",
        "- [] colchete malformado",
        "> citação",
    ] {
        assert!(Task::parse(line).is_none(), "should not parse: {line:?}");
    }
}

#[test]
fn reads_meta_json_even_with_spaces_inside() {
    let task =
        Task::parse(r#"- [ ] Tarefa <!--id:x1y2z3 meta:{"due": "2026-07-20", "n": 2}-->"#).unwrap();
    assert_eq!(task.text, "Tarefa");
    let meta = task.meta.as_ref().unwrap();
    assert_eq!(meta["due"], "2026-07-20");
    assert_eq!(meta["n"], 2);
}

#[test]
fn malformed_meta_does_not_break_the_line() {
    // The task must survive; only the unreadable metadata is dropped.
    let task = Task::parse("- [ ] Tarefa <!--id:x1y2z3 meta:{quebrado-->").unwrap();
    assert_eq!(task.text, "Tarefa");
    assert_eq!(task.id.as_deref(), Some("x1y2z3"));
    assert_eq!(task.meta, None);
}

#[test]
fn render_round_trips_every_field() {
    let original = r#"- [x] Pagar internet <!--id:d4e5f6 origin:Compras meta:{"n":1}-->"#;
    let task = Task::parse(original).unwrap();
    assert_eq!(task.render_block(), original);
}

#[test]
fn parses_an_empty_file() {
    let list = list_from("");
    assert!(list.is_empty());
    assert_eq!(list.tasks().count(), 0);
    assert_eq!(list.render(), "");
}

#[test]
fn parses_a_file_mixing_done_and_open_tasks() {
    let list = list_from(
        "- [ ] Comprar leite <!--id:a1b2c3-->\n\
         - [x] Pagar internet <!--id:d4e5f6-->\n\
         - [ ] Ligar pro dentista <!--id:g7h8i9-->\n",
    );

    assert_eq!(list.tasks().count(), 3);
    assert_eq!(list.tasks().filter(|t| t.done).count(), 1);
    assert_eq!(list.find("d4e5f6").unwrap().text, "Pagar internet");
}

#[test]
fn keeps_non_task_lines_untouched_when_rewriting() {
    // The whole point of the open format: the app is a guest in this file.
    let content = "# Compras\n\
                   \n\
                   Lembrar de conferir a validade.\n\
                   \n\
                   - [ ] Comprar leite <!--id:a1b2c3-->\n\
                   \n\
                   ## Depois\n\
                   \n\
                   - [ ] Comprar pão <!--id:b2c3d4-->\n";

    let list = list_from(content);
    assert_eq!(list.tasks().count(), 2);
    assert_eq!(list.render(), content, "rewriting changed unrelated lines");

    // 2 headings + 1 paragraph + 4 blank lines.
    assert_eq!(non_task_lines(&list), 7, "non-task lines were swallowed");
}

fn non_task_lines(list: &TaskList) -> usize {
    list.render()
        .lines()
        .filter(|line| Task::parse(line).is_none())
        .count()
}

#[test]
fn a_broken_line_does_not_break_the_rest_of_the_file() {
    let list = list_from(
        "- [ ] válida <!--id:a1b2c3-->\n\
         - [] malformada\n\
         !!! lixo <!--id:-->\n\
         - [x] outra válida <!--id:d4e5f6-->\n",
    );

    assert_eq!(list.tasks().count(), 2, "one bad line killed the parse");
    assert!(list.find("a1b2c3").is_some());
    assert!(list.find("d4e5f6").is_some());
}

#[test]
fn a_file_without_trailing_newline_stays_without_one() {
    let list = list_from("- [ ] sem quebra final <!--id:a1b2c3-->");
    assert_eq!(list.render(), "- [ ] sem quebra final <!--id:a1b2c3-->");
}

#[test]
fn tasks_iterator_skips_raw_lines() {
    let list = list_from("# Título\n- [ ] tarefa <!--id:a1b2c3-->\nprosa\n");
    let tasks: Vec<_> = list.tasks().collect();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].text, "tarefa");
    assert_eq!(non_task_lines(&list), 2);
}
