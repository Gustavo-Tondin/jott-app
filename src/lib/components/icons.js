// Raw SVG strings for the icons the UI renders today.
//
// Explicit imports (not a glob) keep the bundle tree-shaken: only the handful
// the interface actually draws is compiled in. The FULL Phosphor set lives on
// disk under `src/assets/icons/phosphor/` — vendored for the future per-space
// icon picker (roadmap, Fase 13), where it will be read lazily, not bundled.
//
// `?raw` gives the file's text; each SVG uses `fill="currentColor"`, so an icon
// takes the colour of whatever renders it. Keys carry the weight when it is not
// regular (`-bold`, `-fill`).

import xBold from "../../assets/icons/phosphor/bold/x.svg?raw";
import plusBold from "../../assets/icons/phosphor/bold/plus.svg?raw";

import bookmarkSimpleFill from "../../assets/icons/phosphor/fill/bookmark-simple.svg?raw";

import plus from "../../assets/icons/phosphor/regular/plus.svg?raw";
import house from "../../assets/icons/phosphor/regular/house.svg?raw";
import checkSquare from "../../assets/icons/phosphor/regular/check-square.svg?raw";
import note from "../../assets/icons/phosphor/regular/note.svg?raw";
import folder from "../../assets/icons/phosphor/regular/folder.svg?raw";
import folders from "../../assets/icons/phosphor/regular/folders.svg?raw";
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
import calendarBlank from "../../assets/icons/phosphor/regular/calendar-blank.svg?raw";
import clock from "../../assets/icons/phosphor/regular/clock.svg?raw";
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
import lightbulb from "../../assets/icons/phosphor/regular/lightbulb.svg?raw";

// The settings menu (2026-08-20, wireframe "Settings"). One glyph per section
// of the screen, each naming what the section is ABOUT rather than the word it
// uses: a screen for how the app looks, a calendar for when the day turns, a
// notebook for the folder itself, a keyboard for the chords, sliders for the
// switches, and the arrow that brings a new version down.
import monitor from "../../assets/icons/phosphor/regular/monitor.svg?raw";
import notebookIcon from "../../assets/icons/phosphor/regular/notebook.svg?raw";
import keyboard from "../../assets/icons/phosphor/regular/keyboard.svg?raw";
import slidersHorizontal from "../../assets/icons/phosphor/regular/sliders-horizontal.svg?raw";
import downloadSimple from "../../assets/icons/phosphor/regular/download-simple.svg?raw";
import info from "../../assets/icons/phosphor/regular/info.svg?raw";

// The image library and the note banner (2026-08-18). `image` is the placeholder
// a picture leaves when it is missing — the same grey square the wireframes
// draw on a card whose banner is an image.
import image from "../../assets/icons/phosphor/regular/image.svg?raw";

// Writing Markdown by keyboard and by the formatting panel (2026-08-18). The
// six heading glyphs are one icon each rather than a number in a box: Phosphor
// draws them as `H1`…`H6`, which is what the mark itself is called.
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

// The panel completed (2026-08-19, wireframe "Format panel"): underline,
// indent/outdent, the brackets that link to a note, and undo/redo. `text-h` and
// `text-a-underline` are the two OPENERS of the narrow bar — a whole group
// folded behind one glyph, which is how the mobile wireframe fits six rows on
// one line.
import textUnderline from "../../assets/icons/phosphor/regular/text-underline.svg?raw";
import textIndent from "../../assets/icons/phosphor/regular/text-indent.svg?raw";
import textOutdent from "../../assets/icons/phosphor/regular/text-outdent.svg?raw";
import bracketsSquare from "../../assets/icons/phosphor/regular/brackets-square.svg?raw";
import arrowArcLeft from "../../assets/icons/phosphor/regular/arrow-arc-left.svg?raw";
import arrowArcRight from "../../assets/icons/phosphor/regular/arrow-arc-right.svg?raw";
import textH from "../../assets/icons/phosphor/regular/text-h.svg?raw";
import textAUnderline from "../../assets/icons/phosphor/regular/text-a-underline.svg?raw";

// The narrow bar folds EVERY category, not two of them (user report,
// 2026-08-19: "faltam diversos botões"). Three more openers, each named after
// what it holds: a paragraph for the shapes a block takes, a plain list for the
// three list kinds, and a plus for what is put INTO the note. None of the three
// repeats a glyph a command already wears — an opener that looked like `bullet`
// would read as the command itself.
import paragraph from "../../assets/icons/phosphor/regular/paragraph.svg?raw";
import listDashes from "../../assets/icons/phosphor/regular/list-dashes.svg?raw";
import plusCircle from "../../assets/icons/phosphor/regular/plus-circle.svg?raw";

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
  "calendar-blank": calendarBlank,
  alarm,
  clock,
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
  monitor,
  notebook: notebookIcon,
  keyboard,
  "sliders-horizontal": slidersHorizontal,
  "download-simple": downloadSimple,
  info,
  image,
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
};
