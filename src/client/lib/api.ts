import type { ListResponse, MeResponse, Stash, StashInput, Visibility } from '../../shared/types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Why the session stopped working, which decides the way out: an expired
 * session signs in again, a refused token has to sign out first (Access
 * would otherwise wave the same token straight back in).
 */
export type SessionLoss = 'expired' | 'stale'

let sessionLostListener: ((kind: SessionLoss) => void) | null = null

/**
 * Registered by the session store rather than imported here, so this module
 * stays free of rune state.
 */
export function onSessionLost(listener: (kind: SessionLoss) => void): void {
  sessionLostListener = listener
}

function reportIfSessionLost(error: ApiError): ApiError {
  if (error.code === 'session_stale') sessionLostListener?.('stale')
  else if (error.code === 'session_expired' || error.status === 401) sessionLostListener?.('expired')
  return error
}

/**
 * Access answers an expired session with a redirect to its login page on
 * another origin. Followed, that redirect fails CORS and looks exactly like
 * being offline; held back with `redirect: 'manual'` it is recognisable. No
 * API route redirects on its own, so any redirect here is Access.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
      redirect: 'manual',
    })
  } catch {
    throw new ApiError(0, 'network', 'the server could not be reached')
  }
  if (response.type === 'opaqueredirect') {
    throw reportIfSessionLost(new ApiError(0, 'session_expired', 'the session has expired'))
  }

  if (response.status === 204) return undefined as T

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  if (!isJson) {
    throw new ApiError(response.status, 'unexpected_response', `expected JSON, got ${response.status}`)
  }

  const body = (await response.json()) as unknown

  if (!response.ok) {
    const error = body as { error?: string; message?: string }
    throw reportIfSessionLost(
      new ApiError(response.status, error.error ?? 'error', error.message ?? 'the request failed'),
    )
  }

  return body as T
}

export function fetchMe(): Promise<MeResponse> {
  return request<MeResponse>('/api/me')
}

export interface ListParams {
  cursor?: string | null
  query?: string
  visibility?: Visibility | null
  limit?: number
}

export function listStashes(params: ListParams = {}): Promise<ListResponse> {
  const search = new URLSearchParams()
  if (params.cursor) search.set('cursor', params.cursor)
  if (params.query) search.set('q', params.query)
  if (params.visibility) search.set('visibility', params.visibility)
  if (params.limit) search.set('limit', String(params.limit))

  const suffix = search.size > 0 ? `?${search}` : ''
  return request<ListResponse>(`/api/stashes${suffix}`)
}

/** Owner view: requires an authenticated session. */
export function fetchStash(id: string): Promise<Stash> {
  return request<Stash>(`/api/stashes/${id}`)
}

/** Reader view: also succeeds anonymously when the stash is public. */
export function fetchPublicStash(id: string): Promise<Stash> {
  return request<Stash>(`/api/public/stashes/${id}`)
}

export function createStash(input: StashInput): Promise<Stash> {
  return request<Stash>('/api/stashes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateStash(id: string, input: StashInput): Promise<Stash> {
  return request<Stash>(`/api/stashes/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteStash(id: string): Promise<void> {
  return request<void>(`/api/stashes/${id}`, { method: 'DELETE' })
}

export function rawUrl(id: string, filename: string, download = false): string {
  return `/raw/${id}/${encodeURIComponent(filename)}${download ? '?download' : ''}`
}
