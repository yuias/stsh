<script lang="ts">
  import type { StashFile } from '../../shared/types'
  import { isMarkdown } from '../../shared/languages'
  import { rawUrl } from '../lib/api'
  import { countLines, formatBytes } from '../lib/format'
  import { messages } from '../lib/i18n.svelte'
  import CodeBlock from './CodeBlock.svelte'
  import MarkdownBlock from './MarkdownBlock.svelte'

  interface Props {
    stashId: string
    file: StashFile
  }

  const { stashId, file }: Props = $props()

  const m = $derived(messages())
  const markdown = $derived(isMarkdown(file.language))
  let renderMarkdown = $state(true)
  let copied = $state(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.content)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      copied = false
    }
  }
</script>

<section class="card file" id={`file-${encodeURIComponent(file.filename)}`}>
  <header>
    <strong class="name">{file.filename}</strong>
    <span class="badge">{file.language}</span>
    <span class="muted meta">{m.common.lines(countLines(file.content))} · {formatBytes(file.size)}</span>
    <span class="spacer"></span>
    {#if markdown}
      <button class="ghost" onclick={() => (renderMarkdown = !renderMarkdown)}>
        {renderMarkdown ? m.file.source : m.file.preview}
      </button>
    {/if}
    <button class="ghost" onclick={copy}>{copied ? m.file.copied : m.file.copy}</button>
    <a class="button ghost" href={rawUrl(stashId, file.filename)} target="_blank" rel="noreferrer">{m.file.raw}</a>
    <a class="button ghost" href={rawUrl(stashId, file.filename, true)}>{m.file.download}</a>
  </header>

  {#if markdown && renderMarkdown}
    <MarkdownBlock source={file.content} />
  {:else}
    <CodeBlock content={file.content} language={file.language} />
  {/if}
</section>

<style>
  .file {
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-muted);
  }

  .name {
    font-family: var(--mono);
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }

  .meta {
    font-size: 0.78rem;
  }

  .spacer {
    flex: 1;
  }

  header button,
  header :global(a.button) {
    padding: 4px 9px;
    font-size: 0.78rem;
  }
</style>
