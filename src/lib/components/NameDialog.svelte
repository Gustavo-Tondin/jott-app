<script>
  // The app's own name prompt — mounted once by App, driven by `nameRequest`.
  // Replaces window.prompt, which WebKitGTK does not implement (it returned
  // null, which is the widget-naming bug). The look lives in
  // styles/components/name-dialog.css (frontend architecture invariant).
  import { nameRequest } from "../services/dialog.js";
  import { S } from "../services/strings.js";

  let value = $state("");
  let input = $state(null);

  // Seed the field each time a new request arrives, and focus it.
  $effect(() => {
    if ($nameRequest) {
      value = $nameRequest.value ?? "";
      queueMicrotask(() => input?.focus());
      queueMicrotask(() => input?.select());
    }
  });

  function settle(result) {
    const req = $nameRequest;
    nameRequest.set(null);
    req?.resolve(result);
  }

  function confirm() {
    const text = value.trim();
    settle(text ? text : null);
  }

  function onKey(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      settle(null);
    }
  }
</script>

{#if $nameRequest}
  <div
    class="theme-modal-backdrop name-dialog__backdrop"
    role="presentation"
    onpointerdown={(e) => e.target === e.currentTarget && settle(null)}
  >
    <div class="theme-modal name-dialog" role="dialog" aria-label={$nameRequest.title}>
      <p class="theme-modal__title name-dialog__title">{$nameRequest.title}</p>
      <input
        bind:this={input}
        bind:value
        class="theme-input name-dialog__input"
        placeholder={$nameRequest.placeholder}
        onkeydown={onKey}
      />
      <div class="theme-modal__actions name-dialog__actions">
        <button class="theme-btn" onclick={() => settle(null)}>{S.cancel}</button>
        <button class="theme-btn--primary name-dialog__confirm" onclick={confirm}>
          {$nameRequest.confirm}
        </button>
      </div>
    </div>
  </div>
{/if}
