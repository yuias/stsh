import { HTTPException } from 'hono/http-exception'
import { detectLanguage } from '../shared/languages'
import { LIMITS, type StashFileInput, type Visibility } from '../shared/types'

const encoder = new TextEncoder()

export interface NormalizedFile extends Required<StashFileInput> {
  size: number
}

export interface NormalizedStash {
  title: string
  description: string
  visibility: Visibility
  files: NormalizedFile[]
}

function badRequest(message: string): never {
  throw new HTTPException(400, { message })
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') badRequest(`${field} must be a string`)
  return value
}

/**
 * Strips path separators and control characters so a filename can never escape
 * its stash or smuggle newlines into headers.
 */
function normalizeFilename(raw: string, index: number): string {
  const cleaned = raw
    // Control characters could smuggle newlines into response headers.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()

  if (!cleaned) return `file${index + 1}.txt`
  if (cleaned === '.' || cleaned === '..') return `file${index + 1}.txt`
  if (cleaned.length > LIMITS.maxFilenameLength) {
    badRequest(`filename exceeds ${LIMITS.maxFilenameLength} characters`)
  }
  return cleaned
}

export function normalizeStashInput(body: unknown): NormalizedStash {
  if (typeof body !== 'object' || body === null) badRequest('body must be a JSON object')
  const input = body as Record<string, unknown>

  const title = (input.title === undefined ? '' : asString(input.title, 'title')).trim()
  if (title.length > LIMITS.maxTitleLength) {
    badRequest(`title exceeds ${LIMITS.maxTitleLength} characters`)
  }

  const description = (input.description === undefined ? '' : asString(input.description, 'description')).trim()
  if (description.length > LIMITS.maxDescriptionLength) {
    badRequest(`description exceeds ${LIMITS.maxDescriptionLength} characters`)
  }

  const rawVisibility = input.visibility === undefined ? 'private' : asString(input.visibility, 'visibility')
  if (rawVisibility !== 'private' && rawVisibility !== 'public') {
    badRequest("visibility must be 'private' or 'public'")
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    badRequest('files must be a non-empty array')
  }
  if (input.files.length > LIMITS.maxFiles) {
    badRequest(`a stash may hold at most ${LIMITS.maxFiles} files`)
  }

  const seen = new Set<string>()
  let totalSize = 0

  const files = input.files.map((raw, index): NormalizedFile => {
    if (typeof raw !== 'object' || raw === null) badRequest(`files[${index}] must be an object`)
    const file = raw as Record<string, unknown>

    const content = asString(file.content ?? '', `files[${index}].content`)
    const size = encoder.encode(content).byteLength
    if (size > LIMITS.maxFileBytes) {
      badRequest(`files[${index}] is ${size} bytes; the limit is ${LIMITS.maxFileBytes}`)
    }
    totalSize += size
    if (totalSize > LIMITS.maxTotalBytes) {
      badRequest(`stash exceeds the total size limit of ${LIMITS.maxTotalBytes} bytes`)
    }

    let filename = normalizeFilename(asString(file.filename ?? '', `files[${index}].filename`), index)
    // Duplicate filenames would make the raw endpoint ambiguous.
    if (seen.has(filename)) {
      const dot = filename.lastIndexOf('.')
      const stem = dot > 0 ? filename.slice(0, dot) : filename
      const ext = dot > 0 ? filename.slice(dot) : ''
      let suffix = 2
      while (seen.has(`${stem}-${suffix}${ext}`)) suffix += 1
      filename = `${stem}-${suffix}${ext}`
    }
    seen.add(filename)

    const language =
      typeof file.language === 'string' && file.language.trim()
        ? file.language.trim()
        : detectLanguage(filename)

    return { filename, content, language, size }
  })

  return { title, description, visibility: rawVisibility, files }
}
