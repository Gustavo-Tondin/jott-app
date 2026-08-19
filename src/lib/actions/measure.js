// `use:measured` — tells a component how wide its own element is.
//
// One question, asked the only way a browser answers it honestly: a
// ResizeObserver. It exists because a CSS container query cannot answer in
// JavaScript, and the notes board has to KNOW its column count rather than
// leave it to the browser — see services/noteColumns.js for why.
//
// The callback runs with the content-box inline size, in px, on mount and on
// every change. Disconnected on destroy: an observer outliving its node is the
// classic leak.
export function measured(node, onWidth) {
  let notify = onWidth;
  // No observer here (jsdom, and any engine old enough to lack one): measure
  // once and stop. The board then draws at whatever width it had on mount,
  // which is right until something resizes — and an action that THREW here
  // would take the reorder action mounted after it down with it, which is
  // exactly how the board lost its drag in the tests (2026-08-19).
  if (typeof ResizeObserver !== "function") {
    notify?.(node.getBoundingClientRect?.().width ?? 0);
    return {
      update(next) {
        notify = next;
      },
    };
  }
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      // `contentBoxSize` is the modern shape; `contentRect` is what jsdom and
      // older engines give. Either way it is the box the children live in.
      const width =
        entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect?.width ?? 0;
      notify?.(width);
    }
  });
  observer.observe(node);
  return {
    update(next) {
      notify = next;
    },
    destroy() {
      observer.disconnect();
    },
  };
}
