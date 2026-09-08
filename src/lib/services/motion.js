// Waiting on an animation the STYLESHEET owns: the sheet decides how long a
// send-off takes and the code only names it, so a theme may retime it without
// touching a line of this. Nothing playing (jsdom, reduced motion) resolves at
// once, and a ceiling guards a play that never reports back.

/// Above every play the app asks for, so the guard never cuts one short.
export const CEILING = 1500;

/// Resolves when every animation named in `names` that is playing on `node`
/// (or inside it) has finished — or when the ceiling runs out.
export function played(node, names, ceiling = CEILING) {
  const playing = (node?.getAnimations?.({ subtree: true }) ?? []).filter((a) =>
    names.has(a.animationName),
  );
  if (!playing.length) return Promise.resolve();
  return Promise.race([
    Promise.all(playing.map((a) => a.finished)).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ceiling)),
  ]);
}
