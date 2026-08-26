import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ListResponse, MeResponse, Visibility } from '../shared/types'
import { isDevMode, requireIdentity, withIdentity } from './auth'
import { runBackup } from './backup'
import { isValidStashId } from './id'
import type { AppEnv, HonoEnv } from './types'
import { createStash, deleteStash, getStash, getStashFile, listStashes, updateStash } from './repo'
import { normalizeStashInput } from './validate'

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

/** D1 rejects LIKE patterns longer than 50 bytes, wildcards included. */
const MAX_QUERY_LENGTH = 40

const app = new Hono<HonoEnv>()

app.use('*', withIdentity)

app.get('/api/me', (c) => {
  const identity = c.get('identity')
  const body: MeResponse = {
    email: identity?.email ?? '',
    name: identity?.name ?? '',
    authenticated: identity !== null,
    stale: c.get('authStale'),
    dev: isDevMode,
  }
  return c.json(body)
})

app.get('/api/stashes', requireIdentity, async (c) => {
  const url = new URL(c.req.url)

  const requestedLimit = Number(url.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE

  const rawVisibility = url.searchParams.get('visibility')
  const visibility: Visibility | null =
    rawVisibility === 'private' || rawVisibility === 'public' ? rawVisibility : null

  const result = await listStashes(c.env.DB, {
    limit,
    cursor: url.searchParams.get('cursor'),
    query: (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    visibility,
  })

  const body: ListResponse = result
  return c.json(body)
})

app.post('/api/stashes', requireIdentity, async (c) => {
  const identity = c.get('identity')!
  const input = normalizeStashInput(await readJson(c.req.raw))
  const stash = await createStash(c.env.DB, identity.email, input)
  return c.json(stash, 201)
})

app.get('/api/stashes/:id', requireIdentity, async (c) => {
  const stash = await getStash(c.env.DB, requireStashId(c.req.param('id')))
  if (!stash) throw new HTTPException(404, { message: 'stash not found' })
  return c.json(stash)
})

app.put('/api/stashes/:id', requireIdentity, async (c) => {
  const input = normalizeStashInput(await readJson(c.req.raw))
  const stash = await updateStash(c.env.DB, requireStashId(c.req.param('id')), input)
  if (!stash) throw new HTTPException(404, { message: 'stash not found' })
  return c.json(stash)
})

app.delete('/api/stashes/:id', requireIdentity, async (c) => {
  const deleted = await deleteStash(c.env.DB, requireStashId(c.req.param('id')))
  if (!deleted) throw new HTTPException(404, { message: 'stash not found' })
  return c.body(null, 204)
})

/**
 * Anonymous-capable read paths. These are the prefixes intended to sit behind a
 * Cloudflare Access *Bypass* policy; the Worker still refuses to serve anything
 * that is not marked public.
 */
app.get('/api/public/stashes/:id', async (c) => {
  const stash = await getStash(c.env.DB, requireStashId(c.req.param('id')))
  if (!stash) throw new HTTPException(404, { message: 'stash not found' })
  if (stash.visibility !== 'public' && !c.get('identity')) {
    // Do not leak the existence of private stashes to anonymous callers.
    throw new HTTPException(404, { message: 'stash not found' })
  }
  return c.json(stash)
})

const serveRaw = async (c: Context<HonoEnv>) => {
  const id = requireStashId(c.req.param('id'))
  const filename = c.req.param('filename') as string | undefined
  const found = await getStashFile(c.env.DB, id, filename ? decodeURIComponent(filename) : null)

  if (!found) return c.text('Not Found', 404)
  if (found.visibility !== 'public' && !c.get('identity')) return c.text('Not Found', 404)

  const download = new URL(c.req.url).searchParams.has('download')

  return c.body(found.file.content, 200, {
    'content-type': 'text/plain; charset=utf-8',
    // The raw endpoint can be publicly reachable, so never let a browser sniff
    // a stored HTML/SVG payload into an executable content type.
    'x-content-type-options': 'nosniff',
    'content-disposition': download
      ? `attachment; filename*=UTF-8''${encodeURIComponent(found.file.filename)}`
      : 'inline',
    'cache-control': 'no-store',
  })
}

app.get('/raw/:id', serveRaw)
app.get('/raw/:id/:filename', serveRaw)

app.notFound((c) => c.json({ error: 'not_found', message: 'no such endpoint' }, 404))

app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500
  const message = error instanceof HTTPException ? error.message : 'internal error'

  if (status >= 500) console.error(error)

  // A refused token needs its own code: the client's way out is to sign out,
  // not to sign in, and only the middleware knows which of the two it was.
  const code = status === 401 && c.get('authStale') ? 'session_stale' : statusToCode(status)

  return c.json({ error: code, message }, status)
})

function statusToCode(status: number): string {
  if (status === 400) return 'bad_request'
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not_found'
  if (status === 413) return 'payload_too_large'
  return 'internal_error'
}

function requireStashId(id: string | undefined): string {
  if (!id || !isValidStashId(id)) throw new HTTPException(404, { message: 'stash not found' })
  return id
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HTTPException(400, { message: 'body must be valid JSON' })
  }
}

const scheduled: ExportedHandlerScheduledHandler<AppEnv> = async (controller, env) => {
  try {
    await runBackup(env, controller.scheduledTime)
  } catch (error) {
    // Nothing notifies on a failed Cron Trigger, so the log and the errored
    // invocation in Cron Events are the only traces a failure leaves behind.
    console.error('backup failed', error)
    throw error
  }
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<AppEnv>
