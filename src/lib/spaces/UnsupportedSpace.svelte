<script>
  // The polite fallback of the registry: a space type this build cannot
  // render is shown and named, never hidden and never touched. Erasing or
  // "fixing" it would destroy data written by a newer version or a community
  // template — the exact failure spec 3.5 forbids.
  import { S } from "../services/strings.js";

  let { source } = $props();
</script>

<section class="unsupported-space">
  <strong>{S.unsupportedSpaceTitle(source.kind)}</strong>
  <p class="unsupported-space__body">{S.unsupportedSpaceBody}</p>
</section>
