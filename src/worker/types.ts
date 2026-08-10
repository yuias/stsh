/**
 * `wrangler types` narrows plain string vars to their literal default (""),
 * which is useless once the real values are set in the dashboard. Widen them.
 */
export interface AppEnv extends Omit<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_POLICY_AUD' | 'ALLOWED_EMAILS'> {
  ACCESS_TEAM_DOMAIN: string
  ACCESS_POLICY_AUD: string
  ALLOWED_EMAILS: string
}

export interface Identity {
  email: string
  name: string
}

export interface HonoEnv {
  Bindings: AppEnv
  Variables: {
    /** Set by `withIdentity`; null when the request is anonymous. */
    identity: Identity | null
  }
}
