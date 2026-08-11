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
import caretDownBold from "../../assets/icons/phosphor/bold/caret-down.svg?raw";

import houseFill from "../../assets/icons/phosphor/fill/house.svg?raw";
import checkSquareFill from "../../assets/icons/phosphor/fill/check-square.svg?raw";
import bookmarkSimpleFill from "../../assets/icons/phosphor/fill/bookmark-simple.svg?raw";

import plus from "../../assets/icons/phosphor/regular/plus.svg?raw";
import house from "../../assets/icons/phosphor/regular/house.svg?raw";
import checkSquare from "../../assets/icons/phosphor/regular/check-square.svg?raw";
import note from "../../assets/icons/phosphor/regular/note.svg?raw";
import folder from "../../assets/icons/phosphor/regular/folder.svg?raw";
import folders from "../../assets/icons/phosphor/regular/folders.svg?raw";
import folderPlus from "../../assets/icons/phosphor/regular/folder-plus.svg?raw";
import gear from "../../assets/icons/phosphor/regular/gear.svg?raw";
import square from "../../assets/icons/phosphor/regular/square.svg?raw";
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
import trash from "../../assets/icons/phosphor/regular/trash.svg?raw";
import tray from "../../assets/icons/phosphor/regular/tray.svg?raw";
import dotsThreeVertical from "../../assets/icons/phosphor/regular/dots-three-vertical.svg?raw";
import x from "../../assets/icons/phosphor/regular/x.svg?raw";
import sidebarSimple from "../../assets/icons/phosphor/regular/sidebar-simple.svg?raw";
import flag from "../../assets/icons/phosphor/regular/flag.svg?raw";
import dotsSixVertical from "../../assets/icons/phosphor/regular/dots-six-vertical.svg?raw";
import list from "../../assets/icons/phosphor/regular/list.svg?raw";
import lightbulb from "../../assets/icons/phosphor/regular/lightbulb.svg?raw";

export const ICONS = {
  // weighted variants
  "x-bold": xBold,
  "plus-bold": plusBold,
  "caret-down-bold": caretDownBold,
  "house-fill": houseFill,
  "check-square-fill": checkSquareFill,
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
  square,
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
  trash,
  tray,
  "dots-three-vertical": dotsThreeVertical,
  x,
  "sidebar-simple": sidebarSimple,
  flag,
  "dots-six-vertical": dotsSixVertical,
  list,
};
