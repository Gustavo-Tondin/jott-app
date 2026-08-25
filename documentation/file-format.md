# The file format

Everything Jott knows is in the notebook folder, and everything in there is
readable without the app. This document is the whole contract: enough to
write your own tool against a Jott notebook, or to move your notes somewhere
else without asking anyone.

Two promises hold everywhere below:

1. **What you wrote survives.** A key Jott doesn't recognise, a field from a
   newer version, a hand-written label — all of it makes the round trip
   untouched.
2. **Nothing is destroyed.** Deleting in the app moves the file into
   `.jott/trash/`, from where it returns to exactly where it was.

---

## The tree

```
MyNotebook/
├── jott.home/           ← the fixed Home space (no files of its own)
├── jott.tasks/          ← the fixed Tasks space
│   ├── task-list.md
│   ├── completed.md
│   └── .space.json
├── jott.notes/          ← the fixed Notes space
├── assets/              ← every file the notebook uses, one library
├── Groceries/           ← a tasks space you made
├── Work/                ← a group: it gathers spaces, holds no content
│   ├── .group.json
│   └── Clients/         ← a notes space you made
└── .jott/
    ├── config.json      ← preferences that travel with the notebook
    ├── themes/          ← the looks you brought in, if any
    ├── trash/           ← deleted things, waiting
    └── _FORMAT.txt      ← this document's short version, in every notebook
```

**A space is a folder with one job**: it is a task list *or* a notebook of
notes, never both, and it never contains another level of organisation.
**A group** is a folder that gathers spaces and other groups in the sidebar —
it has no content of its own, and groups nest.

**The folder name is the name.** Renaming a space in the app moves the
folder. The three `jott.*` spaces are the exception: their folder is an
identifier, so only they keep a display name inside their marker.

**A space's identity is its path from the notebook root**, not its leaf name:
`Design/Tasks` and `Personal/Tasks` are two legitimate places.

**Reserved folder names**, because the app writes them: `assets`,
`task-list`, `completed`.

---

## Tasks

A tasks space holds `task-list.md` (shown as **Inbox**) plus any lists you
add, and `completed.md` beside them. Both of those two exist in every tasks
space and come back if deleted.

A task is one Markdown checklist line:

```markdown
- [ ] Buy milk
- [x] Pay the internet bill
```

Details go on indented lines below it:

```markdown
- [ ] Buy building material
  @2026-07-25 #home #urgent !2
  Talk to Jorge first, he gives a discount.
  repeat: every-week
  remind: 2026-07-24T18:00
  [invoice.pdf](assets/invoice.pdf)
  - [ ] Cement
  - [ ] Sand
```

| Written | Means |
|---|---|
| `@2026-07-25` | a date, always year-month-day |
| `#home` | a tag. Two mean something to the app: `#urgent` and `#pinned` |
| `!1` … `!3` | priority, 1 highest |
| `repeat: every-week` | also `every-day`, `every-month`, `every-3-days`… |
| `remind: 2026-07-24T18:00` | when to ring: date, `T`, hour and minute, in your local time — no zone. A space instead of the `T`, or seconds, read fine and are written back in this form. Independent of `@date`: a task without a date can ring, and a dated one rings only if asked (or if the notebook's automatic reminder is on — that one is a setting, never written here). On a repeating task it moves with the date |
| `- [ ] …` | a subtask |
| a line of **only** links into `assets/` | the task's attachments |
| anything else | description |

That last distinction is deliberate: a line with a link to the web, or to a
file of your own, is description and is left exactly as you wrote it. Only a
line whose every link points inside `assets/` becomes attachments — and a
label you typed by hand survives the app rewriting the line.

### The hidden comment

```markdown
- [ ] Ship the proposal <!--id:k3f9a2 meta:{"…"}-->
```

`id:` is added **only when the app needs to track that task** — when you pull
it into your day or week, or complete it. You never write one, and you can
leave them alone.

`meta:` is a slot that carries fields from **another version of the app**.
This build never writes into it and never drops it. It is what lets a
notebook survive being opened by a newer Jott and then an older one.

`completed.md` lines carry `origin:` naming the list the task came from, so
restoring puts it back where it was.

---

## Notes

One note is one `.md` file. Optional YAML front matter at the very top:

```markdown
---
created: 2026-07-21
pinned: true
---

Text of the note.
```

The block is optional — a plain `.md` you wrote by hand is a perfectly good
note. Keys Jott doesn't know are left untouched. A checklist typed inside a
note stays text: notes and tasks never mix.

### Banners

A note can carry a coloured or illustrated head. It is one HTML comment, on
the first line of the body:

```markdown
<!--banner: yellow-->
<!--banner: assets/sunset.jpg-->
```

Comment syntax because every Markdown renderer hides it, so the file stays
normal everywhere else. **The value decides the type**: an image extension is
an image, anything else is a colour — one of the eight names (`red`,
`orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `neutral`), never a
hex. The banner is not body text; the app separates it and writes it back
untouched.

### References

```markdown
[[Another note]]        by TITLE — survives the note being moved
[[/invoice.pdf]]        by ADDRESS — the leading slash is the difference
![](assets/sunset.jpg)  a plain Markdown image
```

The slash is what separates the two namespaces. This is not CommonMark and
it is not Obsidian's spelling (there, an embed is `![[…]]`) — an accepted
cost, in exchange for one syntax that says which of two things you meant.

An ambiguous title is never guessed: it opens search instead.

### Addresses are relative to the notebook root

`assets/sunset.jpg` means the same thing from any note and any task, at any
depth. Moving a note never rewrites its body — there's a test that compares
it byte for byte.

### Markdown Jott writes

- **Tables** are GFM pipe tables, always written aligned:

  ```markdown
  | Item   | Qty |
  | ------ | --- |
  | Cement | 4   |
  ```

  Reading accepts the tight form and short or long rows. `\|` is a pipe
  inside a cell; a cell is one line. An alignment marker (`:--:`) already in
  the file is preserved — the app doesn't offer them, but doesn't strip them.
- **Underline is `<u>text</u>`**, because `__text__` is *bold* in CommonMark
  and would make the file lie outside Jott.
- **`==highlight==` is refused** on purpose: it isn't CommonMark, and
  adopting it would change the dialect of your file.

### Renaming

When a file or note is renamed, only the forms the app itself writes are
rewritten: `[[/name]]`, `](assets/name)`, banners and attachment lines. A
loose search-and-replace would eat the start of `assets/photo.jpg.bak`
inside somebody's note.

---

## `assets/`

One library for the whole notebook, at the root, with no `jott.` prefix. Any
kind of file goes in; only an image can be a banner or be shown inside a
note. Drop files in there yourself if you like — the app lists whatever is
present, and can tell you where each file is used.

---

## Marker files

Each space folder carries `.space.json`, each group `.group.json`. They hold
what the filesystem can't: the type of the space, its colour and icon, the
order you dragged things into.

```json
{
  "schemaVersion": 1,
  "type": "notes",
  "color": "blue",
  "icon": "notebook",
  "sort": "custom",
  "order": ["Ideas.md", "Trip.md"],
  "noteLayout": "grid",
  "folders": { "Clients": { "color": "orange", "pinned": true } }
}
```

| Key | What it is |
|---|---|
| `type` | `tasks`, `notes`, or `home` on the fixed Home. **Never cleared**: a type this build doesn't know is kept, and the space is shown as unsupported rather than repurposed |
| `name` | display name — only the three `jott.*` spaces use it |
| `color`, `icon` | a colour **name**, and a [Phosphor](https://phosphoricons.com) icon name |
| `sort` | `name`, `created`, `completed` or `custom` |
| `order` | the hand-dragged arrangement, read when `sort` is `custom`. Task ids in a tasks space, note paths in a notes one — kept here and never in the `.md`, because the arrangement is the app's and the file is yours |
| `noteLayout` | `grid` or `tree`; absent follows the notebook default |
| `folders` | colour and pin per note folder, keyed by its path inside the space. Here, and not as marker files scattered through your own tree |

---

## `.jott/`

- **`config.json`** — preferences that **travel with the notebook**, because
  they answer to a *person*: rollover hours, retention days, confirmation
  prompts, feature switches, shortcut bindings, quick-capture destinations,
  sort orders, the fallback appearance, and the automatic reminder
  (`autoRemind`: `off` / `dayOf` / `dayBefore`, at `reminderTime`, `HH:MM`). Written in camelCase, guarded by
  `schemaVersion`.

  The pact is the same for every key: **a value that fails validation reads
  as the app's default, an absent key means untouched, and an unknown key
  makes the round trip**. Editing it by hand while the app is running works —
  a watcher picks the file up, no restart.

  If you're writing a tool against a notebook, you can ignore this file: it
  holds preferences, not your content.

- **`themes/`** — the looks this notebook carries, each either a
  `<name>.css` or a `<name>/` holding `theme.css` and an optional
  `manifest.json`. Yours: the app only ever reads them, except for the one
  button that writes a starting point. Written in full in
  [`theming.md`](theming.md).

- **`trash/`** — everything deleted, with enough context to go back exactly
  where it was (a task returns to its line). Retention is configurable;
  0 means forever. The only destruction in Jott is you emptying the trash.

- **`_FORMAT.txt`** — the short version of this document, written into every
  notebook, in plain text. **Jott never overwrites it**: the file is yours.

**Not in the notebook:** anything that answers to a *machine* rather than a
person — panel widths, zoom, the last screen, the theme this installation
chose — lives in the OS config folder, so your phone doesn't inherit your
desktop's layout.

---

## Version guard

`schemaVersion` appears in `config.json` and in every marker. Jott **refuses
to write** a file whose schema is from the future, rather than downgrading
it. Reading still works wherever it can.

Before v1 there is no automatic migration between formats. An older notebook
keeps its folders alongside the new ones, and that coexistence is the
correct behaviour.
