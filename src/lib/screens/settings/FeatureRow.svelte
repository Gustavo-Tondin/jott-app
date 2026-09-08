<script>
  // One switch of a function's page. Off limits with the notebook read-only,
  // and with its parent switch off: a child is never on under an off parent.
  import { on } from "../../services/features.js";

  let { feature, features, readOnly = false, onSet } = $props();
</script>

<label class="settings__row">
  <span class="settings__label">{feature.label()}</span>
  <input
    class="theme-switch"
    type="checkbox"
    checked={on(features, feature.key)}
    disabled={readOnly || (!!feature.parent && !on(features, feature.parent))}
    aria-label={feature.label()}
    onchange={(e) => onSet(feature.key, e.currentTarget.checked)}
  />
</label>
