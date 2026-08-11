<script>
  // The polite fallback of the registry: a workspace type this build cannot
  // render is shown and named, never hidden and never touched. Erasing or
  // "fixing" it would destroy data written by a newer version or a community
  // template — the exact failure spec 3.5 forbids.
  import { S } from "../services/strings.js";

  let { widget } = $props();
</script>

<section class="unsupported-widget">
  <strong>{S.unsupportedWidgetTitle(widget.kind)}</strong>
  <p class="unsupported-widget__body">{S.unsupportedWidgetBody}</p>
</section>
