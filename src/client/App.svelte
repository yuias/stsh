<script lang="ts">
  import LocaleSwitcher from './components/LocaleSwitcher.svelte'
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
</script>

<div class="app">
  <header class="app-header">
    <a class="brand" href="/" use:link>stsh</a>
    {#if me.me.authenticated}
      <a class="button" href="/new" use:link>{m.nav.new}</a>
    {/if}
    <div class="spacer"></div>
    <LocaleSwitcher />
    {#if me.loaded}
      <span class="identity">
        {#if me.me.authenticated}
          {me.me.email}{#if me.me.dev} <span class="badge">{m.nav.dev}</span>{/if}
        {:else}
          {m.nav.readOnly}
        {/if}
      </span>
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
