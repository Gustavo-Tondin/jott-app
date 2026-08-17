<script>
  // The app's own name prompt — mounted once by App, driven by `nameRequest`.
  // Replaces window.prompt, which WebKitGTK does not implement (it returned
  // null, which is the widget-naming bug). The look lives in
  // styles/components/name-dialog.css (frontend architecture invariant).
  import { nameRequest } from "../services/dialog.js";
  import { S } from "../services/strings.js";
  import Modal from "./Modal.svelte";

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

  // Enter only: Escape belongs to the frame, which swallows it so the shell
  // does not also close the inspector behind the dialog.
  function onKey(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    confirm();
  }
</script>

{#if $nameRequest}
  <Modal
    label={$nameRequest.title}
    backdropClass="name-dialog__backdrop"
    panelClass="name-dialog"
    onClose={() => settle(null)}
  >
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
  </Modal>
{/if}
