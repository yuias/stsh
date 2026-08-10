import type { MeResponse } from '../../shared/types'
import { fetchMe } from './api'

const ANONYMOUS: MeResponse = { email: '', name: '', authenticated: false, dev: false }

const state = $state<{ me: MeResponse; loaded: boolean }>({ me: ANONYMOUS, loaded: false })

/**
 * Resolves the current identity once per page load. On Access-bypassed pages
 * this request is expected to fail, which simply means "anonymous reader".
 */
export async function loadSession(): Promise<void> {
  try {
    state.me = await fetchMe()
  } catch {
    state.me = ANONYMOUS
  } finally {
    state.loaded = true
  }
}

export function session(): { me: MeResponse; loaded: boolean } {
  return state
}
