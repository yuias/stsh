<script lang="ts">
  import LocaleSwitcher from './components/LocaleSwitcher.svelte'
  import ThemeSwitcher from './components/ThemeSwitcher.svelte'
  import { messages } from './lib/i18n.svelte'
  import { currentRoute, link } from './lib/router.svelte'
  import { session } from './lib/session.svelte'
  import EditorPage from './routes/EditorPage.svelte'
  import ListPage from './routes/ListPage.svelte'
  import NotFoundPage from './routes/NotFoundPage.svelte'
  import ViewPage from './routes/ViewPage.svelte'

  const route = $derived(currentRoute())
  const me = $derived(session())
  const m = $derived(messages())

  /**
   * Cloudflare Access answers both of these itself; neither reaches the Worker,
   * and both must be plain navigations rather than SPA routing. Signing out is
   * also how a user switches between the available login methods.
   */
  const SIGN_IN_URL = '/'
  const SIGN_OUT_URL = '/cdn-cgi/access/logout'
</script>

<div class="app">
  <header class="app-header">
    <a class="brand" href="/" use:link>stsh</a>
    {#if me.me.authenticated}
      <a class="button" href="/new" use:link>{m.nav.new}</a>
    {/if}
    <div class="spacer"></div>
    <ThemeSwitcher />
    <LocaleSwitcher />
    {#if me.loaded}
      <span class="identity" class:stale={me.me.stale}>
        {#if me.me.authenticated}
          {me.me.email}{#if me.me.dev} <span class="badge">{m.nav.dev}</span>{/if}
        {:else if me.me.stale}
          {m.nav.sessionStale}
        {:else}
          {m.nav.readOnly}
        {/if}
      </span>
      <!-- Access is not in front of the Worker in dev, so neither URL exists. -->
      {#if !me.me.dev}
        <!-- A stale token gets signing out, not signing in: Access would wave
             the same token through and land the reader right back here. -->
        {#if me.me.authenticated || me.me.stale}
          <a class="auth-link" href={SIGN_OUT_URL}>{m.nav.signOut}</a>
        {:else}
          <a class="auth-link" href={SIGN_IN_URL}>{m.nav.signIn}</a>
        {/if}
      {/if}
    {/if}
  </header>

  <main>
    {#if route.name === 'list'}
      <ListPage />
    {:else if route.name === 'new'}
      <EditorPage mode="create" />
    {:else if route.name === 'edit'}
      {#key route.id}
        <EditorPage mode="edit" id={route.id} />
      {/key}
    {:else if route.name === 'view'}
      {#key route.id}
        <ViewPage id={route.id} />
      {/key}
    {:else}
      <NotFoundPage />
    {/if}
  </main>
</div>
