// Where a quick task can land, and how `.jott/config.json` names the choice
// (`quickTaskList`) — the tasks mirror of `noteTargets.js`:
//   ""             — the fixed Tasks space's Inbox (the default);
//   "compras"      — a list of the fixed space, by its file name;
//   "Design/Tasks" — a user task space, by root-relative path; its main list takes it.

import { folderOf, listName, MAIN_LIST } from "./paths.js";
import { S } from "./strings.js";

/// The places a quick task can go, in the order the pickers offer them.
/// `{list, label, value}` — `list` is the path `composeTask` writes to,
/// `value` what the config stores.
export function taskTargets({
  inbox,
  completed = null,
  lists = [],
  spaces = [],
  fixedShown = true,
}) {
  const out = [];
  const fixedFolder = inbox ? folderOf(inbox) : null;
  if (fixedShown && inbox) {
    out.push({ list: inbox, label: S.inboxTasks, value: "" });
  }
  if (fixedShown) {
    for (const entry of lists ?? []) {
      if (!entry?.path || entry.path === inbox || entry.path === completed) continue;
      // `lists` carries EVERY list of the notebook, the user spaces' own
      // task-list/completed included — and those share file names, so they
      // would be duplicate keys. Only the FIXED space's lists belong here.
      if (folderOf(entry.path) !== fixedFolder) continue;
      const name = listName(entry.path);
      out.push({ list: entry.path, label: entry.name ?? name, value: name });
    }
  }
  for (const sp of spaces ?? []) {
    // The fixed space rides in `spaces` too (it has a marker like any other);
    // its doors are the fixed entries above, not a duplicate row here.
    if (sp?.kind !== "tasks" || sp.fixed || sp.path === fixedFolder) continue;
    out.push({ list: `${sp.path}/${MAIN_LIST}.md`, label: sp.name, value: sp.path });
  }
  return out;
}

/// The target `value` names, else the first offered, else null — no target,
/// no capture.
export function quickTaskTarget(value, targets) {
  return targets.find((t) => t.value === value) ?? targets[0] ?? null;
}
