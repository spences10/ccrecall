# ccrecall

CLI tool that syncs Claude Code transcripts to SQLite for analytics
and context recall.

## Tech Stack

- **Runtime:** Node.js (>=22) — `node:sqlite` for DB, `tinyglobby` for
  file discovery
- **Language:** TypeScript (strict, ES2024, NodeNext modules)
- **CLI framework:** citty
- **Build/Test/Lint/Fmt:** vite-plus (`vp pack`, `vp test`,
  `vp check`)
- **Release:** changesets
- **Package manager:** pnpm

## Architecture

```
src/
  index.ts        # Entry point (#!/usr/bin/env node)
  cli.ts          # Command definitions (sync, stats, search, sessions, query, tools, schema)
  db.ts           # Database class, schema DDL, prepared statements, FTS5
  sync.ts         # Scans ~/.claude/projects/**/*.jsonl, incremental sync
  sync-teams.ts   # Syncs ~/.claude/teams/ and ~/.claude/tasks/
  parser.ts       # JSONL transcript line → structured messages
  cli.test.ts     # CLI structure validation
  db.test.ts      # DB operations + FTS5 edge cases
```

## Key Patterns

- **Incremental sync:** `sync_state` table tracks file mtime + byte
  offset to skip unchanged content
- **FTS5 search:** `messages_fts` virtual table with auto-sync
  triggers on INSERT/UPDATE/DELETE
- **`escape_fts5_query()`** in db.ts wraps special chars in quotes,
  preserves prefix/phrase syntax
- **Batch transactions** with foreign keys disabled during bulk insert
  for performance
- **Prepared statements** for all DML operations
- **UPSERT semantics** — sync is idempotent

## Commands

```bash
vp test                     # Run tests (vitest)
vp test watch               # Watch mode
vp check                    # Lint + format check (oxlint + oxfmt)
vp check --fix              # Auto-fix lint + format
vp pack                     # Build to dist/
node dist/index.js <cmd>    # Run built CLI
```

## DB Schema

Core tables: `sessions`, `messages`, `tool_calls`, `tool_results`,
`teams`, `team_members`, `team_tasks`, `sync_state`, `messages_fts`

Schema DDL lives in `SCHEMA` constant in `db.ts`.

## Adding Features

1. New command → add to `cli.ts` via `citty.defineCommand()`
2. New table/query → add to `db.ts` (schema + methods)
3. New sync logic → modify `sync.ts` or `sync-teams.ts`
4. Always add colocated tests in `src/` (e.g. `foo.test.ts`)

## Gotchas

- FTS5 special chars (`.` `/` `-` `:` `()` `^` `+` `'`) must be
  escaped — see `escape_fts5_query()`
- Legacy migration: `cclog.db` → `ccrecall.db` handled automatically
- Auto-migration resets `sync_state` when tool_calls table is empty
  but messages exist
- `node:sqlite` is experimental — shows a warning on first use
- `src/commands/` dir exists but is empty — commands are inline in
  `cli.ts`
