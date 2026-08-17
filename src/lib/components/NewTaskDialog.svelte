<script>
  // The "New task" popup: the composer row, centred over a dimmed page.
  //
  // Same shape as NameDialog — mounted once by App, driven by a store, resolving
  // a promise — because that is what makes `await askTask(...)` read like the
  // `prompt` this app cannot use (WebKitGTK does not implement it).
  //
  // It does not write anything: it hands back the intent, and the caller passes
  // it to `taskCompose`. So the blue button on Home can pull the fresh task into
  // the day while the same dialog inside a space does not.
  import { taskRequest } from "../services/dialog.js";
  import { S } from "../services/strings.js";
  import Modal from "./Modal.svelte";
  import TaskComposer from "./TaskComposer.svelte";
  import Icon from "./Icon.svelte";

  function settle(result) {
    const request = $taskRequest;
    taskRequest.set(null);
    request?.resolve(result ?? null);
  }
</script>

{#if $taskRequest}
  <Modal
    label={S.newTask}
    wide
    backdropClass="new-task__backdrop"
    panelClass="new-task"
    onClose={() => settle(null)}
  >
    <div class="theme-modal__head new-task__head">
      <p class="theme-modal__title new-task__title">{S.newTask}</p>
      <button
        class="theme-btn--icon"
        aria-label={S.cancel}
        title={S.cancel}
        onclick={() => settle(null)}
      >
        <Icon name="x" size="1rem" />
      </button>
    </div>

    <TaskComposer
      variant="dialog"
      autofocus
      lists={$taskRequest.lists}
      defaultList={$taskRequest.defaultList}
      dateFormat={$taskRequest.dateFormat}
      f={$taskRequest.f ?? (() => true)}
      onSubmit={settle}
    />
  </Modal>
{/if}
