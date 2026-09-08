// The three faces the app reads in: interface, note body, and monospace.
// A choice is a family NAME, never a stack: the app puts it in FRONT of the
// stylesheet's own stack, so an uninstalled font is harmless. Nothing here
// reads the DOM — the shell writes the values on the root (shell/rootStyle.js);
// the machine's families come from the bridge (`system_fonts`).

/// `token` is the custom property the stylesheet reads; `fallback` repeats
/// the sheet's own stack on purpose — the inline property REPLACES the
/// declaration, so the rest of the chain has to be in the value.
export const FONT_ROLES = {
  interface: {
    token: "--app-font-sans",
    fallback: ['"Inter"', "system-ui", "sans-serif"],
    /// The face the app carries for this role.
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

/// Offered under the installed ones, and the whole answer on a machine the
/// app cannot ask (no fontconfig outside Linux).
const GENERIC_FAMILIES = ["system-ui", "sans-serif", "serif", "monospace"];

/// Whether a family name can be written into a CSS value — the core's
/// `fonts::is_safe_family`, repeated because a name can also arrive from a
/// hand-edited config. The last gate before the document.
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

/// The `font-family` value for a role, or null — which REMOVES the property
/// and leaves the stylesheet in charge. A generic family goes in unquoted
/// (quoting `sans-serif` names a font nobody has); anything else is quoted.
///
/// `systemFamily` is the family this desktop draws its own interface in, as
/// the bridge answers it (`system_ui_font`). It goes in FRONT of `system-ui`
/// because the keyword does not mean the same thing everywhere: WebKitGTK
/// resolves it through fontconfig and never reads the desktop's setting, so
/// picking "system-ui" changed nothing visible on Linux. With no answer the
/// keyword stands on its own, which is right on Windows and Android.
export function fontValue(role, family, systemFamily = "") {
  const spec = FONT_ROLES[role];
  if (!spec) return null;
  const name = (family ?? "").trim();
  if (!name || !isSafeFamily(name)) return null;
  if (name === "system-ui") {
    const desktop = (systemFamily ?? "").trim();
    const chain = isSafeFamily(desktop) ? [`"${desktop}"`, "system-ui"] : ["system-ui"];
    // The app's own face is NOT in this chain: it would win the moment the
    // desktop's family went missing, and the choice would look ignored.
    return [...chain, "sans-serif"].join(", ");
  }
  const first = GENERIC_FAMILIES.includes(name) ? name : `"${name}"`;
  return [first, ...spec.fallback].join(", ");
}

/// What the shell writes on the root for all three, ready for `setRootVar`:
/// `{ "--app-font-sans": … | null }`.
export function fontVars({ interfaceFont, noteFont, monoFont } = {}, systemFamily = "") {
  return {
    [FONT_ROLES.interface.token]: fontValue("interface", interfaceFont, systemFamily),
    [FONT_ROLES.note.token]: fontValue("note", noteFont, systemFamily),
    [FONT_ROLES.mono.token]: fontValue("mono", monoFont, systemFamily),
  };
}

/// The rows a font picker offers: the app's own answer first (empty value —
/// absent means default), then the generics, then `installed` minus what is
/// already the app's own or a generic.
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
