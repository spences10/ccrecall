# ccrecall

## 0.0.10

### Patch Changes

- 2bb7ed3: Add `schema` command for database table introspection
  - `ccrecall schema` lists all tables with row counts
  - `ccrecall schema <table>` shows columns, types, constraints,
    foreign keys, and indexes
  - Supports `--format json` for machine-readable output

- 3b08272: Add --wide flag to query command to disable column
  truncation
- f2723b7: Fix table column truncation to scale with terminal width
  instead of hard 50-char cap
- 8dbcf27: Add --context flag and session grouping to search command
- 6d4408d: Show truncated session IDs in sessions command output

## 0.0.9

### Patch Changes

- c6c21df: Fix tool stats percentage calculation to use total
  tool_calls count instead of only the displayed rows

## 0.0.8

### Patch Changes

- 73a3520: add engines and a runtime guard

## 0.0.7

### Patch Changes

- aedba94: Fix FTS5 search failing with period (.) and plus (+) in
  query

## 0.0.6

### Patch Changes

- 1cf71ca: Fix FTS5 search failing with special characters (/, -, :,
  etc.) in query

## 0.0.5

### Patch Changes

- e3dac4c: Add `query` command for raw SQL queries
- fcdddb9: Add `sessions` command to list recent sessions
- c8e5c3f: Add `tools` command for tool usage stats

## 0.0.4

### Patch Changes

- 3bc47bb: rename to ccrecall
- 8c1e3f5: use citty for cli

## 0.0.3

### Patch Changes

- c142833: Add team/swarm tracking tables for debugging multi-agent
  sessions

## 0.0.2

### Patch Changes

- 85628c9: add claude-sneakpeek to sessions

## 0.0.1

### Patch Changes

- 672ca55: Add compiled binary releases via GitHub Actions
