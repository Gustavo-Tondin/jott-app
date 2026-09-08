// Raw SVG strings for the icons the INTERFACE draws by itself. Explicit
// imports (not a glob) keep the bundle tree-shaken; the FULL Phosphor set
// under `src/assets/icons/phosphor/` is read lazily by `services/iconLibrary.js`
// (the icon picker, and `Icon.svelte` for a name not in this map). `?raw`
// gives the text; `fill="currentColor"`. Keys carry the weight (`-bold`, `-fill`).

import xBold from "../../assets/icons/phosphor/bold/x.svg?raw";
import plusBold from "../../assets/icons/phosphor/bold/plus.svg?raw";

import bookmarkSimpleFill from "../../assets/icons/phosphor/fill/bookmark-simple.svg?raw";

import plus from "../../assets/icons/phosphor/regular/plus.svg?raw";
import house from "../../assets/icons/phosphor/regular/house.svg?raw";
import checkSquare from "../../assets/icons/phosphor/regular/check-square.svg?raw";
import note from "../../assets/icons/phosphor/regular/note.svg?raw";
import folder from "../../assets/icons/phosphor/regular/folder.svg?raw";
import folders from "../../assets/icons/phosphor/regular/folders.svg?raw";
import folderPlus from "../../assets/icons/phosphor/regular/folder-plus.svg?raw";
import gear from "../../assets/icons/phosphor/regular/gear.svg?raw";
import bookmarkSimple from "../../assets/icons/phosphor/regular/bookmark-simple.svg?raw";
import arrowClockwise from "../../assets/icons/phosphor/regular/arrow-clockwise.svg?raw";
import sparkle from "../../assets/icons/phosphor/regular/sparkle.svg?raw";
import dotsThree from "../../assets/icons/phosphor/regular/dots-three.svg?raw";
import caretDown from "../../assets/icons/phosphor/regular/caret-down.svg?raw";
import caretLeft from "../../assets/icons/phosphor/regular/caret-left.svg?raw";
import caretRight from "../../assets/icons/phosphor/regular/caret-right.svg?raw";
import caretUp from "../../assets/icons/phosphor/regular/caret-up.svg?raw";
import listBullets from "../../assets/icons/phosphor/regular/list-bullets.svg?raw";
import listChecks from "../../assets/icons/phosphor/regular/list-checks.svg?raw";
import notepad from "../../assets/icons/phosphor/regular/notepad.svg?raw";
import sun from "../../assets/icons/phosphor/regular/sun.svg?raw";
import tag from "../../assets/icons/phosphor/regular/tag.svg?raw";
// The app's own glyph: the sun with a stroke through it — a task leaving the
// day. Not Phosphor.
import sunOff from "../../assets/icons/jott/sun-off.svg?raw";
import calendarBlank from "../../assets/icons/phosphor/regular/calendar-blank.svg?raw";
import clock from "../../assets/icons/phosphor/regular/clock.svg?raw";
import eye from "../../assets/icons/phosphor/regular/eye.svg?raw";
import alarm from "../../assets/icons/phosphor/regular/alarm.svg?raw";
import paperclip from "../../assets/icons/phosphor/regular/paperclip.svg?raw";
import pencil from "../../assets/icons/phosphor/regular/pencil-simple.svg?raw";
import trash from "../../assets/icons/phosphor/regular/trash.svg?raw";
import tray from "../../assets/icons/phosphor/regular/tray.svg?raw";
import dotsThreeVertical from "../../assets/icons/phosphor/regular/dots-three-vertical.svg?raw";
import x from "../../assets/icons/phosphor/regular/x.svg?raw";
import sidebarSimple from "../../assets/icons/phosphor/regular/sidebar-simple.svg?raw";
import browser from "../../assets/icons/phosphor/regular/browser.svg?raw";
import arrowLeft from "../../assets/icons/phosphor/regular/arrow-left.svg?raw";
import arrowRight from "../../assets/icons/phosphor/regular/arrow-right.svg?raw";
import flag from "../../assets/icons/phosphor/regular/flag.svg?raw";
import dotsSixVertical from "../../assets/icons/phosphor/regular/dots-six-vertical.svg?raw";
import list from "../../assets/icons/phosphor/regular/list.svg?raw";
import magnifyingGlass from "../../assets/icons/phosphor/regular/magnifying-glass.svg?raw";
import path from "../../assets/icons/phosphor/regular/path.svg?raw";
import checks from "../../assets/icons/phosphor/regular/checks.svg?raw";
import lightbulb from "../../assets/icons/phosphor/regular/lightbulb.svg?raw";

// The settings menu: one glyph per section, naming what the section is ABOUT.
import monitor from "../../assets/icons/phosphor/regular/monitor.svg?raw";
import notebookIcon from "../../assets/icons/phosphor/regular/notebook.svg?raw";
import keyboard from "../../assets/icons/phosphor/regular/keyboard.svg?raw";
import slidersHorizontal from "../../assets/icons/phosphor/regular/sliders-horizontal.svg?raw";
import info from "../../assets/icons/phosphor/regular/info.svg?raw";

// The image library and the note banner; `image` is also the placeholder a
// missing picture leaves.
import image from "../../assets/icons/phosphor/regular/image.svg?raw";

// Markdown formatting. The six heading glyphs are Phosphor's own `H1`…`H6`.
import textB from "../../assets/icons/phosphor/regular/text-b.svg?raw";
import textItalic from "../../assets/icons/phosphor/regular/text-italic.svg?raw";
import textStrikethrough from "../../assets/icons/phosphor/regular/text-strikethrough.svg?raw";
import code from "../../assets/icons/phosphor/regular/code.svg?raw";
import link from "../../assets/icons/phosphor/regular/link.svg?raw";
import listNumbers from "../../assets/icons/phosphor/regular/list-numbers.svg?raw";
import quotes from "../../assets/icons/phosphor/regular/quotes.svg?raw";
import minus from "../../assets/icons/phosphor/regular/minus.svg?raw";
import textHOne from "../../assets/icons/phosphor/regular/text-h-one.svg?raw";
import textHTwo from "../../assets/icons/phosphor/regular/text-h-two.svg?raw";
import textHThree from "../../assets/icons/phosphor/regular/text-h-three.svg?raw";
import textHFour from "../../assets/icons/phosphor/regular/text-h-four.svg?raw";
import textHFive from "../../assets/icons/phosphor/regular/text-h-five.svg?raw";
import textHSix from "../../assets/icons/phosphor/regular/text-h-six.svg?raw";

// Formatting panel: underline, indent/outdent, the note-link brackets and
// undo/redo. `text-h` and `text-a-underline` are OPENERS of the narrow bar —
// a whole group folded behind one glyph.
import textUnderline from "../../assets/icons/phosphor/regular/text-underline.svg?raw";
import textIndent from "../../assets/icons/phosphor/regular/text-indent.svg?raw";
import textOutdent from "../../assets/icons/phosphor/regular/text-outdent.svg?raw";
import bracketsSquare from "../../assets/icons/phosphor/regular/brackets-square.svg?raw";
import arrowArcLeft from "../../assets/icons/phosphor/regular/arrow-arc-left.svg?raw";
import arrowArcRight from "../../assets/icons/phosphor/regular/arrow-arc-right.svg?raw";
import textH from "../../assets/icons/phosphor/regular/text-h.svg?raw";
import textAUnderline from "../../assets/icons/phosphor/regular/text-a-underline.svg?raw";
// Tables: the opener, the two that add, the two that name what a removal
// takes (the panel writes the verb beside them).
import table from "../../assets/icons/phosphor/regular/table.svg?raw";
import columnsPlusRight from "../../assets/icons/phosphor/regular/columns-plus-right.svg?raw";
import rowsPlusBottom from "../../assets/icons/phosphor/regular/rows-plus-bottom.svg?raw";
import columns from "../../assets/icons/phosphor/regular/columns.svg?raw";
import rows from "../../assets/icons/phosphor/regular/rows.svg?raw";

// The narrow bar's other three openers, each named after what it holds. None
// repeats a glyph a command already wears — it would read as the command itself.
import paragraph from "../../assets/icons/phosphor/regular/paragraph.svg?raw";
import listDashes from "../../assets/icons/phosphor/regular/list-dashes.svg?raw";
import plusCircle from "../../assets/icons/phosphor/regular/plus-circle.svg?raw";
// The shell's states: still reading, error, conflict, and the file a trashed
// folder or note is drawn as.
import circleNotch from "../../assets/icons/phosphor/regular/circle-notch.svg?raw";
import warning from "../../assets/icons/phosphor/regular/warning.svg?raw";
import warningCircle from "../../assets/icons/phosphor/regular/warning-circle.svg?raw";
import file from "../../assets/icons/phosphor/regular/file.svg?raw";

export const ICONS = {
  // weighted variants
  "x-bold": xBold,
  "plus-bold": plusBold,
  "bookmark-simple-fill": bookmarkSimpleFill,
  // regular
  plus,
  house,
  "check-square": checkSquare,
  note,
  folder,
  folders,
  "folder-plus": folderPlus,
  gear,
  "bookmark-simple": bookmarkSimple,
  "arrow-clockwise": arrowClockwise,
  sparkle,
  "dots-three": dotsThree,
  "caret-down": caretDown,
  "caret-left": caretLeft,
  "caret-right": caretRight,
  "caret-up": caretUp,
  "list-bullets": listBullets,
  "list-checks": listChecks,
  notepad,
  lightbulb,
  sun,
  "sun-off": sunOff,
  tag,
  "calendar-blank": calendarBlank,
  alarm,
  clock,
  eye,
  paperclip,
  pencil,
  trash,
  tray,
  "dots-three-vertical": dotsThreeVertical,
  x,
  "sidebar-simple": sidebarSimple,
  tabs: browser,
  "arrow-left": arrowLeft,
  "arrow-right": arrowRight,
  flag,
  "dots-six-vertical": dotsSixVertical,
  list,
  "magnifying-glass": magnifyingGlass,
  path,
  checks,
  monitor,
  notebook: notebookIcon,
  keyboard,
  "sliders-horizontal": slidersHorizontal,
  info,
  image,
  "circle-notch": circleNotch,
  warning,
  "warning-circle": warningCircle,
  file,
  // markdown
  bold: textB,
  italic: textItalic,
  strike: textStrikethrough,
  code,
  link,
  bullet: listBullets,
  ordered: listNumbers,
  task: listChecks,
  quote: quotes,
  rule: minus,
  h1: textHOne,
  h2: textHTwo,
  h3: textHThree,
  h4: textHFour,
  h5: textHFive,
  h6: textHSix,
  underline: textUnderline,
  indent: textIndent,
  outdent: textOutdent,
  reference: bracketsSquare,
  attach: paperclip,
  undo: arrowArcLeft,
  redo: arrowArcRight,
  headings: textH,
  marks: textAUnderline,
  blocks: paragraph,
  lists: listDashes,
  inserts: plusCircle,
  table,
  "table-add-column": columnsPlusRight,
  "table-add-row": rowsPlusBottom,
  "table-column": columns,
  "table-row": rows,
};
