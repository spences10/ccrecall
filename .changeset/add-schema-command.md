---
'ccrecall': patch
---

Add `schema` command for database table introspection

- `ccrecall schema` lists all tables with row counts
- `ccrecall schema <table>` shows columns, types, constraints, foreign keys, and indexes
- Supports `--format json` for machine-readable output
