// The DRAG LAYER: where a carried item lives while it is in the air
// (`actions/reorder.js`). `position: fixed` is relative to the viewport only
// while no ancestor makes a containing block — and every screen column makes
// one (`container-type` implies `contain: layout`), so the item was pinned to
// the column and cut by its overflow. The layer is outside all of that.
// It sits INSIDE `.shell`, so what an item wears by ancestry there
// (`.shell--compact`) still reaches it, and the coordinates are written
// against the layer's own box — see `lift()`.

let host = null;
let spare = null;

/// The page's layer, registered by App.svelte (null on teardown).
export function setDragLayer(node) {
  host = node ?? null;
}

/// Where to carry an item. With no host — a component mounted on its own, a
/// test — one is made, so an item still leaves its column.
export function dragLayer(doc = document) {
  if (host?.isConnected) return host;
  if (!spare?.isConnected) {
    spare = doc.createElement("div");
    spare.className = "drag-layer";
    doc.body.append(spare);
  }
  return spare;
}
