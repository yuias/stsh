import type { Stash, StashFile, StashSummary, Visibility } from '../shared/types'
import { generateStashId } from './id'
import type { NormalizedStash } from './validate'

interface StashRow {
  id: string
  title: string
  description: string
  visibility: Visibility
  owner: string
  created_at: number
  updated_at: number
}

interface StashFileRow {
  stash_id: string
  filename: string
  language: string
  size: number
  content: string
}

interface SummaryRow extends StashRow {
  file_count: number
  total_size: number
}

const STASH_COLUMNS = 's.id, s.title, s.description, s.visibility, s.owner, s.created_at, s.updated_at'

function toStashBase(row: StashRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    owner: row.owner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ListOptions {
  limit: number
  cursor: string | null
  query: string
  visibility: Visibility | null
}

export interface ListResult {
  items: StashSummary[]
  nextCursor: string | null
}

/** Cursors encode the sort key so pagination stays stable across writes. */
function encodeCursor(row: StashRow): string {
  return `${row.updated_at}.${row.id}`
}

function decodeCursor(cursor: string): { updatedAt: number; id: string } | null {
  const separator = cursor.indexOf('.')
  if (separator <= 0) return null

  const updatedAt = Number(cursor.slice(0, separator))
  const id = cursor.slice(separator + 1)
  if (!Number.isFinite(updatedAt) || !id) return null

  return { updatedAt, id }
}

/**
 * Builds the list query. Every placeholder is numbered because a search term is
 * referenced three times and D1 binds numbered placeholders only once.
 */
function buildListStatement(db: D1Database, options: ListOptions): D1PreparedStatement {
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  const conditions: string[] = []
  const bindings: unknown[] = []

  const placeholder = (value: unknown): string => {
    bindings.push(value)
    return `?${bindings.length}`
  }

  if (options.visibility) {
    conditions.push(`s.visibility = ${placeholder(options.visibility)}`)
  }

  if (options.query) {
    // D1 caps LIKE patterns at 50 bytes, so callers must keep `query` short.
    const term = placeholder(`%${options.query}%`)
    conditions.push(
      `(s.title LIKE ${term} OR s.description LIKE ${term} OR EXISTS (SELECT 1 FROM stash_files f WHERE f.stash_id = s.id AND f.filename LIKE ${term}))`,
    )
  }

  if (cursor) {
    const updatedAt = placeholder(cursor.updatedAt)
    const id = placeholder(cursor.id)
    conditions.push(`(s.updated_at < ${updatedAt} OR (s.updated_at = ${updatedAt} AND s.id < ${id}))`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  // Fetch one extra row to detect whether another page exists.
  const limit = placeholder(options.limit + 1)

  const sql = `SELECT ${STASH_COLUMNS},
      (SELECT COUNT(*) FROM stash_files f WHERE f.stash_id = s.id) AS file_count,
      (SELECT COALESCE(SUM(f.size), 0) FROM stash_files f WHERE f.stash_id = s.id) AS total_size
    FROM stashes s
    ${where}
    ORDER BY s.updated_at DESC, s.id DESC
    LIMIT ${limit}`

  return db.prepare(sql).bind(...bindings)
}

export async function listStashes(db: D1Database, options: ListOptions): Promise<ListResult> {
  const { results } = await buildListStatement(db, options).all<SummaryRow>()
  const rows = results ?? []
  const hasMore = rows.length > options.limit
  const page = hasMore ? rows.slice(0, options.limit) : rows

  const filenamesByStash = await loadFilenames(
    db,
    page.map((row) => row.id),
  )

  const last = page[page.length - 1]

  return {
    items: page.map((row) => ({
      ...toStashBase(row),
      fileCount: row.file_count,
      totalSize: row.total_size,
      filenames: filenamesByStash.get(row.id) ?? [],
    })),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  }
}

async function loadFilenames(db: D1Database, ids: string[]): Promise<Map<string, string[]>> {
  const byStash = new Map<string, string[]>()
  if (ids.length === 0) return byStash

  const placeholders = ids.map(() => '?').join(', ')
  const { results } = await db
    .prepare(
      `SELECT stash_id, filename FROM stash_files WHERE stash_id IN (${placeholders}) ORDER BY stash_id, position`,
    )
    .bind(...ids)
    .all<{ stash_id: string; filename: string }>()

  for (const row of results ?? []) {
    const list = byStash.get(row.stash_id)
    if (list) list.push(row.filename)
    else byStash.set(row.stash_id, [row.filename])
  }

  return byStash
}

export async function getStash(db: D1Database, id: string): Promise<Stash | null> {
  const row = await db
    .prepare(`SELECT ${STASH_COLUMNS} FROM stashes s WHERE s.id = ?`)
    .bind(id)
    .first<StashRow>()

  if (!row) return null

  const { results } = await db
    .prepare('SELECT stash_id, filename, language, size, content FROM stash_files WHERE stash_id = ? ORDER BY position')
    .bind(id)
    .all<StashFileRow>()

  const files: StashFile[] = (results ?? []).map((file) => ({
    filename: file.filename,
    language: file.language,
    size: file.size,
    content: file.content,
  }))

  return { ...toStashBase(row), files }
}

/** Reads a single file without pulling the rest of the stash into memory. */
export async function getStashFile(
  db: D1Database,
  id: string,
  filename: string | null,
): Promise<{ visibility: Visibility; file: StashFile } | null> {
  const stash = await db
    .prepare('SELECT visibility FROM stashes WHERE id = ?')
    .bind(id)
    .first<{ visibility: Visibility }>()

  if (!stash) return null

  const row = filename
    ? await db
        .prepare('SELECT stash_id, filename, language, size, content FROM stash_files WHERE stash_id = ? AND filename = ?')
        .bind(id, filename)
        .first<StashFileRow>()
    : await db
        .prepare('SELECT stash_id, filename, language, size, content FROM stash_files WHERE stash_id = ? ORDER BY position LIMIT 1')
        .bind(id)
        .first<StashFileRow>()

  if (!row) return null

  return {
    visibility: stash.visibility,
    file: { filename: row.filename, language: row.language, size: row.size, content: row.content },
  }
}

function fileInsertStatements(db: D1Database, id: string, input: NormalizedStash): D1PreparedStatement[] {
  const insert = db.prepare(
    'INSERT INTO stash_files (stash_id, position, filename, language, size, content) VALUES (?, ?, ?, ?, ?, ?)',
  )
  return input.files.map((file, position) =>
    insert.bind(id, position, file.filename, file.language, file.size, file.content),
  )
}

export async function createStash(db: D1Database, owner: string, input: NormalizedStash): Promise<Stash> {
  const id = generateStashId()
  const now = Date.now()

  await db.batch([
    db
      .prepare(
        'INSERT INTO stashes (id, title, description, visibility, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, input.title, input.description, input.visibility, owner, now, now),
    ...fileInsertStatements(db, id, input),
  ])

  return {
    id,
    title: input.title,
    description: input.description,
    visibility: input.visibility,
    owner,
    createdAt: now,
    updatedAt: now,
    files: input.files.map(({ filename, language, size, content }) => ({ filename, language, size, content })),
  }
}

export async function updateStash(db: D1Database, id: string, input: NormalizedStash): Promise<Stash | null> {
  const existing = await db
    .prepare('SELECT id, created_at, owner FROM stashes WHERE id = ?')
    .bind(id)
    .first<{ id: string; created_at: number; owner: string }>()

  if (!existing) return null

  const now = Date.now()

  await db.batch([
    db
      .prepare('UPDATE stashes SET title = ?, description = ?, visibility = ?, updated_at = ? WHERE id = ?')
      .bind(input.title, input.description, input.visibility, now, id),
    db.prepare('DELETE FROM stash_files WHERE stash_id = ?').bind(id),
    ...fileInsertStatements(db, id, input),
  ])

  return {
    id,
    title: input.title,
    description: input.description,
    visibility: input.visibility,
    owner: existing.owner,
    createdAt: existing.created_at,
    updatedAt: now,
    files: input.files.map(({ filename, language, size, content }) => ({ filename, language, size, content })),
  }
}

export async function deleteStash(db: D1Database, id: string): Promise<boolean> {
  const [, stashResult] = await db.batch([
    db.prepare('DELETE FROM stash_files WHERE stash_id = ?').bind(id),
    db.prepare('DELETE FROM stashes WHERE id = ?').bind(id),
  ])

  return (stashResult?.meta.changes ?? 0) > 0
}
