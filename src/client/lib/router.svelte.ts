export type RouteName = 'list' | 'new' | 'view' | 'edit' | 'notfound'

export interface Route {
  name: RouteName
  id: string
  search: string
}

function parse(pathname: string, search: string): Route {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return { name: 'list', id: '', search }
  if (segments.length === 1 && segments[0] === 'new') return { name: 'new', id: '', search }

  if (segments[0] === 's' && segments[1]) {
    if (segments.length === 2) return { name: 'view', id: segments[1], search }
    if (segments.length === 3 && segments[2] === 'edit') return { name: 'edit', id: segments[1], search }
  }

  return { name: 'notfound', id: '', search }
}

const state = $state<{ current: Route }>({
  current: parse(window.location.pathname, window.location.search),
})

window.addEventListener('popstate', () => {
  state.current = parse(window.location.pathname, window.location.search)
})

export function currentRoute(): Route {
  return state.current
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const url = new URL(to, window.location.origin)
  if (url.href === window.location.href) return

  if (options.replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)

  state.current = parse(url.pathname, url.search)
  window.scrollTo(0, 0)
}

/** Intercepts same-origin clicks so `<a href>` works without a full reload. */
export function link(node: HTMLAnchorElement): { destroy(): void } {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const href = node.getAttribute('href')
    if (!href || href.startsWith('http') || node.target) return

    event.preventDefault()
    navigate(href)
  }

  node.addEventListener('click', onClick)
  return { destroy: () => node.removeEventListener('click', onClick) }
}
