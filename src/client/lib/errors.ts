import type { Messages } from '../locales/en'
import { ApiError } from './api'

/**
 * Turns a thrown value into something worth showing the user.
 *
 * Transport-level failures have localized wording here. Validation failures are
 * reported by the Worker with a specific, English message (which byte limit was
 * exceeded, and by how much) — that detail beats a vague localized sentence, so
 * it is passed through as-is.
 */
export function describeError(cause: unknown, messages: Messages, fallback: string): string {
  if (!(cause instanceof ApiError)) return fallback

  switch (cause.code) {
    case 'network':
      return messages.errors.network
    case 'session_expired':
      return messages.errors.sessionExpired
    case 'unexpected_response':
      return messages.errors.unexpected(cause.status)
    default:
      return cause.message || fallback
  }
}
