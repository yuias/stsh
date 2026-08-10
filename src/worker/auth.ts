import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv, HonoEnv, Identity } from './types'

/**
 * Local development runs without Cloudflare Access in front of the Worker, so
 * there is no JWT to verify. This is compiled out of production builds.
 */
const IS_DEV = import.meta.env.DEV

const DEV_IDENTITY: Identity = { email: 'dev@localhost', name: 'Local Dev' }

/** Send this header in dev to exercise the anonymous (Access bypass) paths. */
const DEV_ANONYMOUS_HEADER = 'x-dev-anonymous'

/**
 * `createRemoteJWKSet` keeps its own key cache, so it must be reused across
 * requests within an isolate rather than rebuilt per request.
 */
const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksByTeamDomain.get(teamDomain)
  if (cached) return cached

  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
  jwksByTeamDomain.set(teamDomain, jwks)
  return jwks
}

function readAccessToken(request: Request): string | null {
  const header = request.headers.get('cf-access-jwt-assertion')
  if (header) return header

  // Cloudflare Access also stores the application token in this cookie, which
  // is what a plain browser navigation carries.
  const cookie = request.headers.get('cookie')
  if (!cookie) return null

  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'CF_Authorization' && rest.length > 0) return rest.join('=')
  }
  return null
}

function isAllowed(email: string, allowedEmails: string): boolean {
  const allowlist = allowedEmails
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  return allowlist.length === 0 || allowlist.includes(email.toLowerCase())
}

/**
 * Resolves the caller's identity, or null when the request carries no valid
 * Access token. Never throws for anonymous requests — route handlers decide
 * whether anonymous access is acceptable.
 */
export async function resolveIdentity(request: Request, env: AppEnv): Promise<Identity | null> {
  if (IS_DEV) {
    return request.headers.get(DEV_ANONYMOUS_HEADER) ? null : DEV_IDENTITY
  }

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, '')
  const audience = env.ACCESS_POLICY_AUD

  if (!teamDomain || !audience) {
    // Fail closed: a misconfigured deployment must not silently become open.
    throw new HTTPException(500, {
      message: 'ACCESS_TEAM_DOMAIN and ACCESS_POLICY_AUD are not configured',
    })
  }

  const token = readAccessToken(request)
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience,
    })

    const email = typeof payload.email === 'string' ? payload.email : ''
    if (!email || !isAllowed(email, env.ALLOWED_EMAILS ?? '')) return null

    const name = typeof payload.name === 'string' && payload.name ? payload.name : email
    return { email, name }
  } catch {
    return null
  }
}

/** Attaches the resolved identity to the context without enforcing it. */
export const withIdentity: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('identity', await resolveIdentity(c.req.raw, c.env))
  await next()
}

/** Rejects anonymous requests. Must run after `withIdentity`. */
export const requireIdentity: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!c.get('identity')) {
    throw new HTTPException(401, { message: 'Cloudflare Access authentication required' })
  }
  await next()
}

export const isDevMode = IS_DEV
