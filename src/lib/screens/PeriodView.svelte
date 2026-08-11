<script>
  // Today and This Week — the tasks widget over a period.
  //
  // Both used to be a screen of their own, with their own card list, their own
  // add-a-task form and their own suggestions panel. Since 2026-08-06 they are
  // the SAME widget the Home and a workspace draw, told to read the day or the
  // week instead of a folder (`period`). What is left here is the frame: which
  // period, and the props the widget needs.
  //
  // Neither stores content — a task created here is written to a real list and
  // pulled in, which is what `taskCompose` does.
  import { S } from "../services/strings.js";
  import TasksWidget from "../widgets/TasksWidget.svelte";

  let {
    period,
    clock,
    /// Every list of the notebook, for the composer's destination chip.
    lists = [],
    tags = [],
    completedName = "Completed",
    /// Where a task composed here is written before joining the period.
    inbox = null,
    readOnly = false,
    onChanged,
    onError,
    reloadKey = 0,
    onSelect,
    selectedTask = null,
    dateFormat = "mm/dd/yyyy",
    /// Whether the widget draws its titled header, and where a new task comes
    /// from. The Tasks screen has its own strip above and its bar below, so it
    /// asks for neither header nor button.
    header = true,
    compose = "bar",
    /// Asks the shell to open the right panel on this period's suggestions.
    onSuggest,
    /// The host's own controls, for the widget's top row.
    toolbar,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
  } = $props();

  // The title only shows when a host asks for the header; the Tasks screen
  // names the period in its own strip.
  let widget = $derived({
    kind: "tasks",
    folder: null,
    name: period === "day" ? S.today : S.weekTitle,
  });
</script>

<div class="period-view">
  <TasksWidget
    {widget}
    {period}
    {header}
    {compose}
    {lists}
    {tags}
    {completedName}
    defaultList={inbox}
    today={clock?.today}
    {dateFormat}
    {readOnly}
    {reloadKey}
    {selectedTask}
    onSelectTask={onSelect}
    {onSuggest}
    {toolbar}
    {f}
    {onChanged}
    {onError}
  />
</div>
