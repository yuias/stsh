<script lang="ts">
  import { onMount } from 'svelte'
  import type { Messages } from '../locales/en'
  import type { StashSummary, Visibility } from '../../shared/types'
  import { listStashes } from '../lib/api'
  import { describeError } from '../lib/errors'
  import { formatBytes, formatRelative, formatTimestamp } from '../lib/format'
  import { messages } from '../lib/i18n.svelte'
  import { link } from '../lib/router.svelte'

  const m = $derived(messages())

  let items = $state<StashSummary[]>([])
  let nextCursor = $state<string | null>(null)
  let query = $state('')
  let visibility = $state<Visibility | ''>('')
  // Holding a renderer rather than a finished string keeps the message correct
  // when the locale changes while it is on screen.
  let failure = $state<((messages: Messages) => string) | null>(null)
  let loading = $state(false)

  const error = $derived(failure?.(m) ?? null)

  /** Debounced so typing in the search box does not fire a request per keystroke. */
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  async function load(cursor: string | null) {
    loading = true
    failure = null
    try {
      const result = await listStashes({
        cursor,
        query,
        visibility: visibility || null,
      })
      items = cursor ? [...items, ...result.items] : result.items
      nextCursor = result.nextCursor
    } catch (cause) {
      failure = (msgs) => describeError(cause, msgs, msgs.list.loadFailed)
    } finally {
      loading = false
    }
  }

  function scheduleSearch() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void load(null), 250)
  }

  // Loading is driven explicitly by mount, search input and the filter, so it
  // must not live in an $effect that would re-run on every keystroke.
  onMount(() => {
    void load(null)
    return () => clearTimeout(searchTimer)
  })
</script>

<div class="toolbar">
  <input type="search" placeholder={m.list.searchPlaceholder} bind:value={query} oninput={scheduleSearch} />
  <select bind:value={visibility} onchange={() => void load(null)}>
    <option value="">{m.visibility.all}</option>
    <option value="private">{m.visibility.private}</option>
    <option value="public">{m.visibility.public}</option>
  </select>
</div>

{#if error}
  <p class="notice">{error}</p>
{/if}

{#if items.length === 0 && !loading && !error}
  <p class="muted empty">{m.list.empty} <a href="/new" use:link>{m.list.emptyAction}</a></p>
{/if}

<ul class="list">
  {#each items as item (item.id)}
    <li class="card entry">
      <div class="row title-row">
        <a class="title" href={`/s/${item.id}`} use:link>{item.title || item.id}</a>
        <span class="badge" class:public={item.visibility === 'public'}>
          {item.visibility === 'public' ? m.visibility.public : m.visibility.private}
        </span>
      </div>

      {#if item.description}
        <p class="description muted">{item.description}</p>
      {/if}

      <p class="filenames">
        {#each item.filenames.slice(0, 6) as filename (filename)}
          <span class="filename">{filename}</span>
        {/each}
        {#if item.filenames.length > 6}
          <span class="muted">{m.list.overflow(item.filenames.length - 6)}</span>
        {/if}
      </p>

      <p class="muted meta">
        {m.common.files(item.fileCount)} · {formatBytes(item.totalSize)} ·
        <time title={formatTimestamp(item.updatedAt)}>{formatRelative(item.updatedAt)}</time>
      </p>
    </li>
  {/each}
</ul>

{#if nextCursor}
  <div class="more">
    <button onclick={() => void load(nextCursor)} disabled={loading}>
      {loading ? m.common.loading : m.list.loadMore}
    </button>
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 18px;
  }

  .toolbar select {
    width: auto;
    min-width: 120px;
  }

  .empty {
    text-align: center;
    padding: 40px 0;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entry {
    padding: 14px 16px;
  }

  .title-row {
    gap: 8px;
  }

  .title {
    font-weight: 600;
    font-size: 1.02rem;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .title:hover {
    text-decoration: underline;
  }

  .description {
    margin: 6px 0 0;
    font-size: 0.88rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .filenames {
    margin: 8px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.76rem;
  }

  .filename {
    font-family: var(--mono);
    padding: 1px 7px;
    border-radius: 5px;
    background: var(--surface-muted);
    border: 1px solid var(--border);
  }

  .meta {
    margin: 8px 0 0;
    font-size: 0.78rem;
  }

  .more {
    display: flex;
    justify-content: center;
    margin-top: 20px;
  }
</style>
