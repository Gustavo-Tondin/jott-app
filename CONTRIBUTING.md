# Contributing to Jott

Thanks for looking. The full guide lives in
**[`documentation/contributing.md`](documentation/contributing.md)** — setup,
the test suites, and the handful of rules that keep this codebase the way it
is.

The short version:

- **Bugs**: open an issue with your version and platform. Don't attach your
  notebook — those are your files.
- **Features**: open an issue before writing. Part of the design is already
  decided ([roadmap](README.md#roadmap), [extending
  Jott](documentation/plugins.md)).
- **Themes** are the easiest useful contribution — one CSS file, no Rust:
  [`documentation/theming.md`](documentation/theming.md).
- Before pushing: `cargo test`, `npm test`, and
  `cargo clippy --workspace --all-targets`, all green.

Everything ships under the [MIT License](LICENSE).
