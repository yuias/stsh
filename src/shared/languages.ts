/**
 * Filename -> language id mapping. Ids are Shiki language ids so the viewer can
 * feed them straight into the highlighter.
 */
const EXTENSION_LANGUAGES: Record<string, string> = {
  astro: 'astro',
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  clj: 'clojure',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cts: 'typescript',
  dart: 'dart',
  diff: 'diff',
  dockerfile: 'docker',
  elm: 'elm',
  erl: 'erlang',
  ex: 'elixir',
  exs: 'elixir',
  fish: 'fish',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  groovy: 'groovy',
  h: 'c',
  hbs: 'handlebars',
  hcl: 'hcl',
  hpp: 'cpp',
  hs: 'haskell',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  jl: 'julia',
  js: 'javascript',
  json: 'json',
  json5: 'json5',
  jsonc: 'jsonc',
  jsx: 'jsx',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'mdx',
  mjs: 'javascript',
  mts: 'typescript',
  nix: 'nix',
  patch: 'diff',
  php: 'php',
  pl: 'perl',
  proto: 'proto',
  ps1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  sass: 'sass',
  scala: 'scala',
  scss: 'scss',
  sh: 'shellscript',
  sql: 'sql',
  svelte: 'svelte',
  swift: 'swift',
  tf: 'terraform',
  tfvars: 'terraform',
  toml: 'toml',
  ts: 'typescript',
  tsv: 'tsv',
  tsx: 'tsx',
  txt: 'text',
  vim: 'viml',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zig: 'zig',
  zsh: 'bash',
}

/** Files whose whole name (not extension) determines the language. */
const FILENAME_LANGUAGES: Record<string, string> = {
  '.bashrc': 'bash',
  '.env': 'dotenv',
  '.gitignore': 'ini',
  '.zshrc': 'bash',
  brewfile: 'ruby',
  cargo: 'toml',
  dockerfile: 'docker',
  gemfile: 'ruby',
  justfile: 'makefile',
  makefile: 'makefile',
  rakefile: 'ruby',
}

export function detectLanguage(filename: string): string {
  const name = filename.trim().toLowerCase()
  if (!name) return 'text'

  const byName = FILENAME_LANGUAGES[name]
  if (byName) return byName

  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'text'

  return EXTENSION_LANGUAGES[name.slice(dot + 1)] ?? 'text'
}

export function isMarkdown(language: string): boolean {
  return language === 'markdown' || language === 'mdx'
}

/** Language ids offered in the editor's dropdown, plus whatever was detected. */
export const SELECTABLE_LANGUAGES: readonly string[] = [
  ...new Set([...Object.values(EXTENSION_LANGUAGES), ...Object.values(FILENAME_LANGUAGES), 'text']),
].sort()
