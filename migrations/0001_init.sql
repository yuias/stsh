-- Migration number: 0001 	 2026-08-11T00:00:00.000Z

CREATE TABLE stashes (
  id          TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL DEFAULT '',
  description TEXT    NOT NULL DEFAULT '',
  visibility  TEXT    NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  owner       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_stashes_updated_at ON stashes (updated_at DESC);
CREATE INDEX idx_stashes_owner ON stashes (owner, updated_at DESC);

CREATE TABLE stash_files (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  stash_id TEXT    NOT NULL REFERENCES stashes (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  filename TEXT    NOT NULL,
  language TEXT    NOT NULL DEFAULT '',
  size     INTEGER NOT NULL,
  content  TEXT    NOT NULL
);

CREATE INDEX idx_stash_files_stash_id ON stash_files (stash_id, position);
