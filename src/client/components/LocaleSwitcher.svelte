<script lang="ts">
  import { en } from '../locales/en'
  import { ja } from '../locales/ja'
  import { LOCALES, localeOverride, messages, setLocaleOverride, type Locale } from '../lib/i18n.svelte'

  const m = $derived(messages())

  // Each option is labelled in its own language, so it stays recognisable to a
  // reader who cannot understand the currently selected one.
  const NAMES: Record<Locale, string> = { en: en.meta.localeName, ja: ja.meta.localeName }

  const value = $derived(localeOverride() ?? '')

  function onChange(event: Event & { currentTarget: HTMLSelectElement }) {
    const next = event.currentTarget.value
    setLocaleOverride(next === '' ? null : (next as Locale))
  }
</script>

<select class="switcher" aria-label={m.nav.language} {value} onchange={onChange}>
  <option value="">{m.nav.auto}</option>
  {#each LOCALES as code (code)}
    <option value={code}>{NAMES[code]}</option>
  {/each}
</select>

<style>
  .switcher {
    width: auto;
    padding: 4px 8px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
