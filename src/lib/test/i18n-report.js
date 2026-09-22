// What each shipped language still owes the source table — `npm run i18n`.
// The same audit locale.test.js runs, printed for the translator, in plain
// node: nothing here touches the bridge. Exits 1 on what the test would fail.

import { S } from "../services/strings.js";
import { LANGUAGES, audit } from "../locales/index.js";

let failed = false;
for (const [tag, { load }] of Object.entries(LANGUAGES)) {
  if (!load) continue;
  const { orphans, malformed, broken, stale, missing, covered, total } = audit(
    S,
    (await load()).default,
  );
  const percent = ((covered / total) * 100).toFixed(1);
  console.log(`${tag}: ${covered}/${total} keys (${percent}%)`);
  const list = (label, keys) => keys.length && console.log(`  ${label} (${keys.length}):\n    ${keys.join("\n    ")}`);
  list("orphan — not in strings.js", orphans);
  list("malformed — not an [en, translation] pair of the source's shape", malformed);
  list("broken — function or table whose English moved on", broken);
  list("stale — string whose English moved on (shown in English)", stale);
  list("missing", missing);
  if (orphans.length || malformed.length || broken.length) failed = true;
}
process.exit(failed ? 1 : 0);
