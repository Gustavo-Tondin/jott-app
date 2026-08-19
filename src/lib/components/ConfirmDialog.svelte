<script>
  // The app's own "are you sure?" — mounted once by App, driven by
  // `confirmRequest`. Replaces window.confirm for the reason `askName`
  // replaced window.prompt: WebKitGTK's own dialog is not the app's, and a
  // question about deleting something has a second sentence to say — what
  // breaks, and where the thing goes.
  import { confirmRequest } from "../services/dialog.js";
  import { S } from "../services/strings.js";
  import Modal from "./Modal.svelte";

  let button = $state(null);
  let stopAsking = $state(false);

  // Focused so Enter answers and Escape cancels without reaching for a mouse.
  // The DANGEROUS button takes the focus deliberately: it is the one the
  // person came here to press, and the frame's Escape is the way out.
  $effect(() => {
    if ($confirmRequest) {
      stopAsking = false;
      queueMicrotask(() => button?.focus());
    }
  });

  function settle(ok) {
    const request = $confirmRequest;
    confirmRequest.set(null);
    request?.resolve({ ok, stopAsking });
  }
</script>

{#if $confirmRequest}
  <Modal
    label={$confirmRequest.title}
    backdropClass="confirm-dialog__backdrop"
    panelClass="confirm-dialog"
    onClose={() => settle(false)}
  >
    <p class="theme-modal__title confirm-dialog__title">{$confirmRequest.title}</p>
    {#if $confirmRequest.detail}
      <p class="confirm-dialog__detail">{$confirmRequest.detail}</p>
    {/if}
    {#if $confirmRequest.code}
      <!-- Set apart because it is meant to be READ, not skimmed: the host a
           download would contact is the fact the question is about. -->
      <p class="confirm-dialog__code">{$confirmRequest.code}</p>
    {/if}
    {#if $confirmRequest.remember}
      <label class="confirm-dialog__again">
        <input class="theme-checkbox" type="checkbox" bind:checked={stopAsking} />
        {S.dontAskAgain}
      </label>
    {/if}
    <div class="theme-modal__actions confirm-dialog__actions">
      <button class="theme-btn" onclick={() => settle(false)}>{S.cancel}</button>
      <button
        bind:this={button}
        class="theme-btn theme-btn--danger confirm-dialog__confirm"
        onclick={() => settle(true)}
      >
        {$confirmRequest.danger}
      </button>
    </div>
  </Modal>
{/if}
