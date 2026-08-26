<script>
  // Today and This Week — the tasks screen over a period.
  //
  // Both used to be a screen of their own, with their own card list, their own
  // add-a-task form and their own suggestions panel. Since 2026-08-06 they are
  // the SAME screen the Home and a space draw, told to read the day or the
  // week instead of a folder (`period`). What is left here is the frame: which
  // period, and the props that screen needs.
  //
  // Neither stores content — a task created here is written to a real list and
  // pulled in, which is what `taskCompose` does.
  import { S } from "../services/strings.js";
  import TasksSpace from "../spaces/TasksSpace.svelte";

  let {
    period,
    clock,
    /// Every list of the notebook, for the composer's destination chip.
    lists = [],
    tags = [],
    completedName = "completed",
    /// Where a task composed here is written before joining the period.
    inbox = null,
    readOnly = false,
    onChanged,
    onError,
    reloadKey = 0,
    onSelect,
    selectedTask = null,
    dateFormat = "mm/dd/yyyy",
    /// Whether the screen draws its titled header, and where a new task comes
    /// from. The Tasks screen has its own strip above and its bar below, so it
    /// asks for neither header nor button.
    header = true,
    compose = "bar",
    /// Asks the shell to open the right panel on this period's suggestions.
    onSuggest,
    /// The host's own controls, for the screen's top row.
    toolbar,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js). Null when
    /// the screen IS the space, and nothing is said.
    origin = null,
  } = $props();

  // The title only shows when a host asks for the header; the Tasks screen
  // names the period in its own strip.
  let source = $derived({
    kind: "tasks",
    folder: null,
    name: period === "day" ? S.today : S.weekTitle,
  });
</script>

<div class="period-view">
  <TasksSpace
    {source}
    {period}
    {origin}
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
