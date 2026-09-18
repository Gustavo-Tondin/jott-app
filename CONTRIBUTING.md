# Contributing to Jott

Thanks for looking. The full guide lives in
**[`documentation/contributing.md`](documentation/contributing.md)** — setup,
the test suites, and the handful of rules that keep this codebase the way it
is.

The short version:

- **Questions**: ask in [Q&A](https://github.com/Gustavo-Tondin/jott-app/discussions/categories/q-a).
- **Bugs**: open an [issue](https://github.com/Gustavo-Tondin/jott-app/issues/new/choose)
  — the form asks for your version and platform. Don't attach your notebook —
  those are your files.
- **Ideas**: talk them over in [Ideas](https://github.com/Gustavo-Tondin/jott-app/discussions/categories/ideas);
  a concrete proposal becomes an issue before anyone writes code. Part of the
  design is already decided ([roadmap](README.md#roadmap), [extending
  Jott](documentation/plugins.md)).
- **Themes** are the easiest useful contribution — one CSS file, no Rust:
  [`documentation/theming.md`](documentation/theming.md). Share yours in
  [Show and tell](https://github.com/Gustavo-Tondin/jott-app/discussions/categories/show-and-tell).
- Before pushing: `cargo test`, `npm test`, and
  `cargo clippy --workspace --all-targets`, all green.

Everything ships under the [MIT License](LICENSE).
