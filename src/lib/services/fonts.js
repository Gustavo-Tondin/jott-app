// The three faces the app can be read in (Display, 2026-08-24): the
// interface, the body of a note, and the monospace of code and paths.
//
// A choice is a family NAME — never a stack, never a measurement — and the
// app turns it into a `font-family` value by putting it in FRONT of the stack
// the stylesheet already declares. That is what makes an uninstalled font
// harmless: the name simply finds nothing and the next entry answers, which
// is the face the app carries.
//
// Nothing here reads the DOM. The shell writes the values on the root
// (shell/rootStyle.js), Settings offers the list, and the machine's own
// families come from the bridge (`system_fonts` → `core/fonts.rs`).

/// What each role is called on the root, and what the app falls back to.
/// `token` is the custom property the stylesheet reads; `fallback` is what
/// goes after the user's family, and it repeats the sheet's own stack on
/// purpose — the inline property REPLACES the declaration, so the rest of the
/// chain has to be written into the value.
export const FONT_ROLES = {
  interface: {
    token: "--app-font-sans",
    fallback: ['"Inter"', "system-ui", "sans-serif"],
    /// The face the app carries for this role, named for the interface.
    shipped: "Inter",
  },
  note: {
    token: "--app-font-note",
    // The note's default is the INTERFACE's face, whatever that resolved to,
    // which is exactly what the stylesheet says when nobody has chosen.
    fallback: ["var(--app-font-sans)"],
    shipped: null,
  },
  mono: {
    token: "--app-font-mono",
    fallback: [
      '"DM Mono"',
      "ui-monospace",
      "SFMono-Regular",
      '"SF Mono"',
      "Menlo",
      '"Liberation Mono"',
      "monospace",
    ],
    shipped: "DM Mono",
  },
};

/// The generic families every machine understands, offered under the ones it
/// has installed. They are the answer for a machine the app cannot ask
/// (anything that is not Linux, where there is no fontconfig to read), and
/// they are a real choice anywhere: "whatever this system reads in" is what
/// someone who wants the OS look is asking for.
export const GENERIC_FAMILIES = ["system-ui", "sans-serif", "serif", "monospace"];

/// Whether a family name can be written into a CSS value. The same rule the
/// core applies to the machine's list (`fonts::is_safe_family`), repeated
/// here because a name can also arrive from a config file the user typed
/// into — this is the last gate before it reaches the document.
export function isSafeFamily(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 64 &&
    /[\p{L}\p{N}]/u.test(name) &&
    // eslint-disable-next-line no-control-regex
    !/["'\;{}<>\u0000-\u001f]/.test(name)
  );
}

/// The `font-family` value for a role, or null when nothing was chosen —
/// and null is what REMOVES the property, leaving the stylesheet's own
/// declaration in charge. A generic family goes in unquoted (quoting
/// `sans-serif` would name a font nobody has); anything else is quoted, so a
/// family with spaces or a digit-first name is one token.
export function fontValue(role, family) {
  const spec = FONT_ROLES[role];
  if (!spec) return null;
  const name = (family ?? "").trim();
  if (!name || !isSafeFamily(name)) return null;
  const first = GENERIC_FAMILIES.includes(name) ? name : `"${name}"`;
  return [first, ...spec.fallback].join(", ");
}

/// What the shell writes on the root for all three, ready for `setRootVar`:
/// `{ "--app-font-sans": … | null }`. One place decides, so the three
/// cannot drift apart.
export function fontVars({ interfaceFont, noteFont, monoFont } = {}) {
  return {
    [FONT_ROLES.interface.token]: fontValue("interface", interfaceFont),
    [FONT_ROLES.note.token]: fontValue("note", noteFont),
    [FONT_ROLES.mono.token]: fontValue("mono", monoFont),
  };
}

/// The rows a font picker offers for a role: the app's own answer first
/// (empty value — the pact every Display key keeps, where absent means the
/// default), then the generics, then what the machine has.
///
/// `installed` is the machine's list; a family that is already the app's own
/// or a generic is not repeated.
export function fontOptions(role, installed = [], labels = {}) {
  const spec = FONT_ROLES[role];
  const seen = new Set(GENERIC_FAMILIES.map((name) => name.toLowerCase()));
  const rows = [
    { value: "", label: labels.default ?? "Default", group: null },
    ...GENERIC_FAMILIES.map((name) => ({ value: name, label: name, group: labels.generic })),
  ];
  if (spec?.shipped) seen.add(spec.shipped.toLowerCase());
  for (const name of installed) {
    if (!isSafeFamily(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    rows.push({ value: name, label: name, group: labels.installed });
  }
  return rows;
}
