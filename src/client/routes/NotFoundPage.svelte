<script lang="ts">
  import { link } from '../lib/router.svelte'
</script>

<div class="wrap">
  <h1>404</h1>
  <p class="muted">そのページはありません。</p>
  <a class="button" href="/" use:link>一覧へ</a>
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
