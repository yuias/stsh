<script lang="ts">
  import type { Stash } from '../../shared/types'
  import FileCard from '../components/FileCard.svelte'
  import { ApiError, deleteStash, fetchPublicStash, fetchStash } from '../lib/api'
  import { formatBytes, formatRelative, formatTimestamp } from '../lib/format'
  import { link, navigate } from '../lib/router.svelte'
  import { session, sessionReady } from '../lib/session.svelte'

  interface Props {
    id: string
  }

  const { id }: Props = $props()
  const me = $derived(session())

  let stash = $state<Stash | null>(null)
  let error = $state<string | null>(null)
  let loading = $state(true)
  let deleting = $state(false)

  const totalSize = $derived(stash?.files.reduce((sum, file) => sum + file.size, 0) ?? 0)

  /**
   * `/api/public/*` sits behind an Access Bypass policy, so Cloudflare attaches
   * no identity token to those requests — an authenticated owner would look
   * anonymous there and be denied their own private stashes. Signed-in users
   * therefore go through the protected endpoint instead.
   */
  async function loadStash(stashId: string): Promise<Stash> {
    await sessionReady

    if (session().me.authenticated) {
      try {
        return await fetchStash(stashId)
      } catch (cause) {
        // Fall through to the public endpoint only when the session is gone.
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause
      }
    }

    return await fetchPublicStash(stashId)
  }

  $effect(() => {
    let cancelled = false
    loading = true
    error = null

    loadStash(id)
      .then((result) => {
        if (!cancelled) stash = result
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        error = cause instanceof ApiError ? cause.message : '読み込みに失敗しました'
      })
      .finally(() => {
        if (!cancelled) loading = false
      })

    return () => {
      cancelled = true
    }
  })

  async function remove() {
    if (!stash) return
    if (!window.confirm(`${stash.title || stash.id} を削除しますか？`)) return

    deleting = true
    try {
      await deleteStash(stash.id)
      navigate('/', { replace: true })
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : '削除に失敗しました'
      deleting = false
    }
  }
</script>

{#if loading}
  <p class="muted">読み込み中…</p>
{:else if error}
  <p class="notice">{error}</p>
{:else if stash}
  <header class="head">
    <div class="row">
      <h1>{stash.title || stash.id}</h1>
      <span class="badge" class:public={stash.visibility === 'public'}>{stash.visibility}</span>
    </div>

    {#if stash.description}
      <p class="description">{stash.description}</p>
    {/if}

    <p class="muted meta">
      {stash.files.length} files · {formatBytes(totalSize)} ·
      <time title={formatTimestamp(stash.updatedAt)}>更新 {formatRelative(stash.updatedAt)}</time>
      {#if stash.owner} · {stash.owner}{/if}
    </p>

    {#if me.me.authenticated}
      <div class="row">
        <a class="button" href={`/s/${stash.id}/edit`} use:link>Edit</a>
        <button class="danger" onclick={remove} disabled={deleting}>Delete</button>
      </div>
    {/if}
  </header>

  {#if stash.files.length > 1}
    <nav class="card index">
      {#each stash.files as file (file.filename)}
        <a href={`#file-${encodeURIComponent(file.filename)}`}>{file.filename}</a>
      {/each}
    </nav>
  {/if}

  <div class="files">
    {#each stash.files as file (file.filename)}
      <FileCard stashId={stash.id} {file} />
    {/each}
  </div>
{/if}

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    overflow-wrap: anywhere;
  }

  .description {
    margin: 0;
    white-space: pre-wrap;
  }

  .meta {
    margin: 0;
    font-size: 0.82rem;
  }

  .index {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-family: var(--mono);
    font-size: 0.8rem;
  }

  .files {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
</style>
