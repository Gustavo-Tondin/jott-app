<script>
  // Draws a vendored Phosphor SVG by name. The single door to icons in the UI —
  // the rest of the app says `<Icon name="..." />` and never touches raw SVG.
  //
  // Two shelves (2026-09-07). The bundled map (`icons.js`) has every glyph the
  // interface draws by itself, and it answers synchronously. A name it lacks
  // is one a person chose in the icon picker, and it lives in the library —
  // the whole set, read lazily the first time any Icon needs it and then
  // shared by every Icon in the window (services/iconSearch.js). Until it
  // arrives the span is empty, which is a blink at start-up and nothing after.
  import { ICONS } from "./icons.js";
  import { loadIconLibrary } from "../services/iconSearch.js";

  let { name, size = "1em", label = null } = $props();

  // `raw`: the map is 1512 plain strings, and there is nothing in it to track.
  let library = $state.raw(null);

  let svg = $derived(ICONS[name] ?? library?.[name] ?? "");

  $effect(() => {
    if (!name || ICONS[name] || library) return;
    loadIconLibrary().then((lib) => {
      library = lib.SVGS;
    });
  });
</script>

<span
  class="theme-icon"
  style="--icon-size:{size}"
  role={label ? "img" : "presentation"}
  aria-label={label}
  aria-hidden={label ? null : "true"}
>
  {@html svg}
</span>
