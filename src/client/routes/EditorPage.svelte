<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import type { Messages } from '../locales/en'
  import { SELECTABLE_LANGUAGES, detectLanguage } from '../../shared/languages'
  import { LIMITS, type StashInput, type Visibility } from '../../shared/types'
  import { createStash, fetchStash, updateStash } from '../lib/api'
  import { describeError } from '../lib/errors'
  import { byteLength, formatBytes, formatNumber } from '../lib/format'
  import { messages } from '../lib/i18n.svelte'
  import { link, navigate } from '../lib/router.svelte'

  interface Props {
    mode: 'create' | 'edit'
    id?: string
  }

  const { mode, id = '' }: Props = $props()

  const m = $derived(messages())

  interface EditorFile {
    key: number
    filename: string
    language: string
    /** Set when the user picked the language explicitly. */
    languagePinned: boolean
    content: string
  }

  let nextKey = 1

  function blankFile(): EditorFile {
    return { key: nextKey++, filename: '', language: 'text', languagePinned: false, content: '' }
  }

  let title = $state('')
  let description = $state('')
  let visibility = $state<Visibility>('private')
  let files = $state<EditorFile[]>([blankFile()])
  let activeIndex = $state(0)

  // `mode` never changes for a given mount, so reading it once here is safe.
  let loading = $state(untrack(() => mode) === 'edit')
  let saving = $state(false)
  let failure = $state<((messages: Messages) => string) | null>(null)
  let dirty = $state(false)

  const error = $derived(failure?.(m) ?? null)
  const active = $derived(files[activeIndex] ?? files[0])

  /**
   * Character counts are cheap enough to recompute per keystroke; byte counts
   * (which need TextEncoder) are only measured when saving.
   */
  const totalCharacters = $derived(files.reduce((sum, file) => sum + file.content.length, 0))

  onMount(() => {
    if (mode === 'edit') void loadExisting()

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  })

  async function loadExisting() {
    try {
      const stash = await fetchStash(id)
      title = stash.title
      description = stash.description
      visibility = stash.visibility
      files = stash.files.map((file) => ({
        key: nextKey++,
        filename: file.filename,
        language: file.language,
        languagePinned: file.language !== detectLanguage(file.filename),
        content: file.content,
      }))
      activeIndex = 0
      dirty = false
    } catch (cause) {
      failure = (msgs) => describeError(cause, msgs, msgs.editor.loadFailed)
    } finally {
      loading = false
    }
  }

  function touch() {
    dirty = true
  }

  function onFilenameInput(file: EditorFile) {
    touch()
    if (!file.languagePinned) file.language = detectLanguage(file.filename)
  }

  function addFile() {
    files.push(blankFile())
    activeIndex = files.length - 1
    touch()
  }

  function removeFile(index: number) {
    if (files.length === 1) {
      files = [blankFile()]
      activeIndex = 0
    } else {
      files.splice(index, 1)
      activeIndex = Math.min(activeIndex, files.length - 1)
    }
    touch()
  }

  async function importFiles(list: FileList | null) {
    if (!list || list.length === 0) return

    const imported = await Promise.all(
      Array.from(list).map(async (file) => ({
        key: nextKey++,
        filename: file.name,
        language: detectLanguage(file.name),
        languagePinned: false,
        content: await file.text(),
      })),
    )

    // Drop the initial empty placeholder rather than keeping a blank tab around.
    const keep = files.filter((file) => file.filename.trim() || file.content.trim())
    files = [...keep, ...imported]
    activeIndex = files.length - 1
    touch()
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    void importFiles(event.dataTransfer?.files ?? null)
  }

  async function save() {
    if (saving) return

    const kept = files.filter((file) => file.content.length > 0 || file.filename.trim().length > 0)

    if (kept.length === 0) {
      failure = (msgs) => msgs.editor.needsOneFile
      return
    }

    const payload: StashInput = {
      title,
      description,
      visibility,
      files: kept.map((file, index) => ({
        filename: file.filename.trim() || `file${index + 1}.txt`,
        language: file.language,
        content: file.content,
      })),
    }

    // Checked here as well as on the Worker so the message can be localized and
    // the oversized body never leaves the browser.
    const tooLarge = payload.files.find((file) => byteLength(file.content) > LIMITS.maxFileBytes)
    if (tooLarge) {
      failure = (msgs) => msgs.editor.fileTooLarge(tooLarge.filename, formatBytes(LIMITS.maxFileBytes))
      return
    }

    saving = true
    failure = null
    try {
      const stash = mode === 'edit' ? await updateStash(id, payload) : await createStash(payload)
      dirty = false
      navigate(`/s/${stash.id}`, { replace: mode === 'edit' })
    } catch (cause) {
      failure = (msgs) => describeError(cause, msgs, msgs.editor.saveFailed)
    } finally {
      saving = false
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault()
      void save()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if loading}
  <p class="muted">{m.common.loading}</p>
{:else}
  <div class="editor" ondrop={onDrop} ondragover={(event) => event.preventDefault()} role="presentation">
    <div class="meta card">
      <input
        type="text"
        placeholder={m.editor.titlePlaceholder}
        bind:value={title}
        oninput={touch}
        maxlength={LIMITS.maxTitleLength}
      />
      <input
        type="text"
        placeholder={m.editor.descriptionPlaceholder}
        bind:value={description}
        oninput={touch}
        maxlength={LIMITS.maxDescriptionLength}
      />
      <div class="row">
        <label class="visibility">
          <input
            type="checkbox"
            checked={visibility === 'public'}
            onchange={(event) => {
              visibility = event.currentTarget.checked ? 'public' : 'private'
              touch()
            }}
          />
          {m.editor.publicLabel}
        </label>
      </div>
    </div>

    {#if error}
      <p class="notice">{error}</p>
    {/if}

    <div class="tabs">
      {#each files as file, index (file.key)}
        <button class="tab" class:active={index === activeIndex} onclick={() => (activeIndex = index)}>
          {file.filename || `file${index + 1}`}
        </button>
      {/each}
      <button class="tab add" onclick={addFile} title={m.editor.addFile} aria-label={m.editor.addFile}>＋</button>
      <label class="tab add" title={m.editor.importFiles}>
        ⇪
        <span class="visually-hidden">{m.editor.importFiles}</span>
        <input type="file" multiple onchange={(event) => void importFiles(event.currentTarget.files)} />
      </label>
    </div>

    {#if active}
      <div class="card pane">
        <header>
          <input
            class="filename"
            type="text"
            placeholder={m.editor.filenamePlaceholder}
            bind:value={active.filename}
            oninput={() => onFilenameInput(active)}
          />
          <select
            bind:value={active.language}
            onchange={() => {
              active.languagePinned = true
              touch()
            }}
          >
            {#each SELECTABLE_LANGUAGES as language (language)}
              <option value={language}>{language}</option>
            {/each}
          </select>
          <button class="danger" onclick={() => removeFile(activeIndex)}>{m.common.delete}</button>
        </header>

        <textarea
          class="source"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder={m.editor.contentPlaceholder}
          bind:value={active.content}
          oninput={touch}
        ></textarea>
      </div>
    {/if}

    <div class="actions">
      <span class="muted counts">
        {m.common.files(files.length)} · {m.editor.characters(formatNumber(totalCharacters))}
        <span class="limit">/ {m.editor.limitHint(formatBytes(LIMITS.maxFileBytes))}</span>
      </span>
      <span class="spacer"></span>
      {#if mode === 'edit'}
        <a class="button" href={`/s/${id}`} use:link>{m.common.cancel}</a>
      {/if}
      <button class="primary" onclick={save} disabled={saving}>
        {saving ? m.editor.saving : mode === 'edit' ? m.editor.update : m.editor.create}
      </button>
    </div>
  </div>
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
  }

  .visibility {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.88rem;
    color: var(--text-muted);
  }

  .visibility input {
    width: auto;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tab {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    font-family: var(--mono);
    font-size: 0.8rem;
    padding: 5px 12px;
  }

  .tab.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .tab.add {
    font-family: inherit;
    position: relative;
    cursor: pointer;
  }

  .tab.add input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .pane {
    overflow: hidden;
  }

  .pane header {
    display: flex;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-muted);
  }

  .filename {
    font-family: var(--mono);
    font-size: 0.85rem;
  }

  .pane select {
    width: auto;
    min-width: 140px;
  }

  .source {
    display: block;
    width: 100%;
    min-height: 55vh;
    border: 0;
    border-radius: 0;
    resize: vertical;
    font-family: var(--mono);
    font-size: 0.84rem;
    line-height: 1.55;
    tab-size: 2;
    white-space: pre;
    overflow-wrap: normal;
    overflow: auto;
  }

  .source:focus-visible {
    outline-offset: -2px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .counts {
    font-size: 0.8rem;
  }

  .limit {
    opacity: 0.7;
  }
</style>
