<script>
  // Tags management (reestruturação 2026-07-30): the user's tags and their
  // colours, from `.jott/tags.json`. A tag's colour is what shows as a pill on
  // a task card and colour+text in the inspector. Opened from the sidebar
  // hamburger.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askConfirm, askName } from "../services/dialog.js";
  import { makeAct } from "../services/act.js";
  import { accentColor } from "../services/accent.js";
  import AccentPicker from "../components/AccentPicker.svelte";
  import Icon from "../components/Icon.svelte";

  let { tags = [], onChanged, onError } = $props();

  // No `load`: the catalogue rides in with the snapshot, so refreshing the
  // shell is the reload. Callbacks wrapped — see services/act.js.
  const act = makeAct({
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  const add = () =>
    act(async () => {
      const name = await askName(S.newTagName, "", { confirm: S.create });
      if (!name) return;
      await api.setTag(name, null);
    });

  const setColor = (name, color) => act(() => api.setTag(name, color));
  const remove = async (name) => {
    // Not DELETING: removing a tag forgets its colour and nothing else — the
    // shared "goes to the trash" detail would promise a trip that never
    // happens (core: `remove_tag`).
    const ok = await askConfirm(S.confirmDeleteTag(name), {
      detail: S.tagTextStays,
      danger: S.deleteAction,
      remember: "confirmDeletes",
    });
    if (ok) act(() => api.removeTag(name));
  };
</script>

<section class="tags-view">
  <header class="tags-view__header">
    <h2 class="theme-title tags-view__title">{S.tagsTitle}</h2>
    <button class="theme-btn theme-btn--primary" onclick={add}>{S.newTagName}</button>
  </header>

  {#if tags.length === 0}
    <p class="tags-view__empty">{S.tagsEmpty}</p>
  {:else}
    <ul class="tags-view__list">
      {#each tags as tag (tag.name)}
        <li class="theme-row tags-view__item">
          <span
            class="theme-swatch theme-swatch--lg tags-view__swatch"
            style={`--tag-color: ${accentColor(tag.color) ?? "var(--theme-brand)"}`}
          ></span>
          <span class="tags-view__name">{tag.name}</span>
          <!-- The seven, not the OS colour dialog (2026-08-13). The native
               picker offered sixteen million colours the app cannot place on a
               ground: a hex has no light half and no dark half, so a tag chosen
               there would keep one value on the white canvas and the black
               sidebar and lose its contrast on one of them. -->
          <AccentPicker
            value={tag.color}
            label={`${tag.name} colour`}
            onPick={(c) => setColor(tag.name, c || null)}
          />
          <!-- The same trash the inspector's footer wears (user call,
               2026-08-13): one glyph for "throw this away", wherever the app
               offers it. As a worded button it was the widest thing in the row
               and read as the row's main action. -->
          <button
            class="theme-btn--icon tags-view__delete"
            onclick={() => remove(tag.name)}
            aria-label={S.deleteTag}
            title={S.deleteTag}
          >
            <Icon name="trash" size="1.125rem" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
