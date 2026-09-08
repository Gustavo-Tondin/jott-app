// `use:measured` — tells a component how wide its own element is, through a
// ResizeObserver: a CSS container query cannot answer in JavaScript, and the
// notes board has to KNOW its column count (services/noteColumns.js). The
// callback gets the content-box inline size, in px, on mount and on every
// change. Disconnected on destroy.
export function measured(node, onWidth) {
  let notify = onWidth;
  // No observer (jsdom, an old engine): measure once and stop. Never throw
  // here — an action that throws takes every action mounted after it (the
  // board's reorder) down with it.
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
