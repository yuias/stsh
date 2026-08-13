/**
 * The default catalog, and the source of truth for the message shape: every
 * other locale is typed as `Messages`, so a missing or mistyped key is a
 * compile error rather than a blank label at runtime.
 *
 * Parameterised messages are plain functions. That keeps pluralisation and word
 * order a property of each language instead of something the call site has to
 * anticipate.
 */
export const en = {
  meta: {
    /** Shown in the language picker; always written in its own language. */
    localeName: 'English',
    htmlLang: 'en',
  },
  nav: {
    new: 'New',
    readOnly: 'Read-only',
    dev: 'dev',
    language: 'Language',
    auto: 'Auto',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    signIn: 'Sign in',
    signOut: 'Sign out',
    sessionStale: 'Session invalid',
  },
  common: {
    loading: 'Loading…',
    delete: 'Delete',
    cancel: 'Cancel',
    files: (count: number) => `${count} ${count === 1 ? 'file' : 'files'}`,
    lines: (count: number) => `${count} ${count === 1 ? 'line' : 'lines'}`,
  },
  visibility: {
    private: 'private',
    public: 'public',
    all: 'All',
  },
  list: {
    searchPlaceholder: 'Search by title, description or filename',
    empty: 'Nothing here yet.',
    emptyAction: 'Create your first stash',
    loadMore: 'Load more',
    loadFailed: 'Could not load the list.',
    overflow: (count: number) => `+${count}`,
  },
  view: {
    updated: (relative: string) => `Updated ${relative}`,
    edit: 'Edit',
    confirmDelete: (name: string) => `Delete ${name}?`,
    deleteFailed: 'Could not delete this stash.',
    loadFailed: 'Could not load this stash.',
  },
  editor: {
    titlePlaceholder: 'Title',
    descriptionPlaceholder: 'Description (optional)',
    publicLabel: 'Public — reachable through the Access bypass paths',
    addFile: 'Add a file',
    importFiles: 'Import files',
    filenamePlaceholder: 'filename.ext',
    contentPlaceholder: 'Paste here, or drop files',
    create: 'Create',
    update: 'Update',
    saving: 'Saving…',
    needsOneFile: 'At least one file is required.',
    fileTooLarge: (filename: string, limit: string) =>
      `${filename} is over the ${limit} per-file limit.`,
    saveFailed: 'Could not save.',
    loadFailed: 'Could not load this stash.',
    characters: (formattedCount: string) => `${formattedCount} chars`,
    limitHint: (size: string) => `up to ${size} per file`,
  },
  file: {
    source: 'Source',
    preview: 'Preview',
    copy: 'Copy',
    copied: 'Copied',
    raw: 'Raw',
    download: 'Download',
    truncated: (size: string) => `Showing the first ${size}. Fetch the whole file from Raw.`,
  },
  notFound: {
    message: 'That page does not exist.',
    back: 'Back to the list',
  },
  errors: {
    network: 'Could not reach the server. Try signing in again.',
    /** Access bounced the request to its login page: reloading starts a login. */
    sessionExpired: 'Your session has expired. Reload the page.',
    /** Access let a token through that we refuse; only signing out clears it. */
    sessionStale: 'Your session is no longer accepted. Sign out, then sign in again.',
    unauthorized: 'Sign in to continue.',
    unexpected: (status: number) => `Unexpected response (${status})`,
  },
}

/**
 * Deliberately not `as const`: the literal types that would produce force every
 * other locale to repeat the English wording verbatim.
 */
export type Messages = typeof en
