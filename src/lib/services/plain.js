// Text folded for a loose match: lower case, accents stripped.

/// Loose enough to find "atalho" written as "Atalhos" and "Día" as "dia":
/// the app is read by people who type in a hurry, and a search that only
/// answers to exact case is a search that looks broken.
export const plain = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
