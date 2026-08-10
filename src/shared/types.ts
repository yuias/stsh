export type Visibility = 'private' | 'public'

/** A single file inside a stash, as returned by the API. */
export interface StashFile {
  filename: string
  language: string
  size: number
  content: string
}

/** File payload accepted when creating or updating a stash. */
export interface StashFileInput {
  filename: string
  content: string
  /** Explicit language id; when omitted it is inferred from the filename. */
  language?: string
}

/** List-view representation: metadata only, never the file contents. */
export interface StashSummary {
  id: string
  title: string
  description: string
  visibility: Visibility
  owner: string
  createdAt: number
  updatedAt: number
  fileCount: number
  totalSize: number
  filenames: string[]
}

/** Detail-view representation, including every file's contents. */
export interface Stash {
  id: string
  title: string
  description: string
  visibility: Visibility
  owner: string
  createdAt: number
  updatedAt: number
  files: StashFile[]
}

export interface StashInput {
  title?: string
  description?: string
  visibility?: Visibility
  files: StashFileInput[]
}

export interface ListResponse {
  items: StashSummary[]
  nextCursor: string | null
}

export interface MeResponse {
  email: string
  name: string
  authenticated: boolean
  /** True while running locally, where Access is not in front of the app. */
  dev: boolean
}

export interface ApiError {
  error: string
  message: string
}

export const LIMITS = {
  /** D1 caps a single row at 1 MB; leave room for the other columns. */
  maxFileBytes: 900_000,
  maxTotalBytes: 4_000_000,
  maxFiles: 50,
  maxFilenameLength: 255,
  maxTitleLength: 200,
  maxDescriptionLength: 2_000,
  /** Above this size the viewer renders plain text instead of highlighting. */
  highlightThresholdBytes: 200_000,
  /** Above this size the viewer only renders the head of the file. */
  previewThresholdBytes: 2_000_000,
} as const
