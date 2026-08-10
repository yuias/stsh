<script lang="ts">
  import { LIMITS } from '../../shared/types'
  import { highlightToHtml } from '../lib/highlight'
  import { formatBytes } from '../lib/format'
  import { messages } from '../lib/i18n.svelte'

  interface Props {
    content: string
    language: string
  }

  const { content, language }: Props = $props()

  const m = $derived(messages())

  /**
   * Very large files are truncated for display; the full text stays one click
   * away via the raw endpoint. Highlighting megabytes would lock up the tab.
   */
  const truncated = $derived(content.length > LIMITS.previewThresholdBytes)
  const shown = $derived(truncated ? content.slice(0, LIMITS.previewThresholdBytes) : content)
  const highlightable = $derived(shown.length <= LIMITS.highlightThresholdBytes)

  let html = $state<string | null>(null)
  let failed = $state(false)

  $effect(() => {
    if (!highlightable) {
      html = null
      return
    }

    let cancelled = false
    html = null
    failed = false

    highlightToHtml(shown, language)
      .then((result) => {
        if (!cancelled) html = result
      })
      .catch(() => {
        if (!cancelled) failed = true
      })

    return () => {
      cancelled = true
    }
  })
</script>

{#if html && !failed}
  <!-- Markup is produced by Shiki's serializer, which escapes the source text. -->
  {@html html}
{:else}
  <pre class="plain">{shown}</pre>
{/if}

{#if truncated}
  <p class="truncation muted">{m.file.truncated(formatBytes(LIMITS.previewThresholdBytes))}</p>
{/if}

<style>
  .truncation {
    margin: 0;
    padding: 8px 16px;
    border-top: 1px solid var(--border);
    font-size: 0.8rem;
  }
</style>
