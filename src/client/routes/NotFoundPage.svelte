<script lang="ts">
  import { messages } from '../lib/i18n.svelte'
  import { link } from '../lib/router.svelte'

  const m = $derived(messages())
</script>

<div class="wrap">
  <h1>404</h1>
  <p class="muted">{m.notFound.message}</p>
  <a class="button" href="/" use:link>{m.notFound.back}</a>
</div>

<style>
  .wrap {
    text-align: center;
    padding: 64px 0;
  }

  h1 {
    margin: 0;
    font-size: 3rem;
  }
</style>
