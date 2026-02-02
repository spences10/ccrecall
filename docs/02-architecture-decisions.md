# Architecture Decisions

Key design choices for ccrecall memory evolution.

---

## Sessions vs Memory: Distinct Concerns

### Sessions (existing)

- **Raw transcripts** — complete conversation history
- Already stored in ccrecall SQLite database
- Immutable historical record
- Large, detailed, unprocessed

### Memory (new)

- **Extracted facts** — distilled knowledge
- Preferences, patterns, learnings
- Compact, queryable, categorized
- Changes over time (updates, merges, decay)

### Decision: Keep Separate

**Chosen approach:** Separate `memories` table linked via `session_id`

**Rationale:**

- Sessions are source of truth; memories are derived
- Different access patterns (browse vs search)
- Can re-extract memories if extraction logic improves
- Memory can span multiple sessions (future: dedup/merge)
- Clean separation of concerns

**Alternative rejected:** Embedding memories inline with sessions

- Would bloat session records
- Complicates memory updates/evolution
- Harder to query across sessions

---

## MCP vs CLI/Skills

### MCP Approach

- Daemon process with tool exposure
- Used by OpenClaw for memory operations
- Persistent connection, real-time access

### CLI/Skills Approach

- Commands via `ccrecall` CLI
- Skills for Claude Code integration
- Hook-triggered background tasks

### Decision: CLI/Skills Preferred

**Rationale:**

1. **Hooks work better** — Per scottspence.com research, CLI hooks are
   more reliable than MCP for session lifecycle events
2. **No daemon needed** — No background process to manage/restart
3. **Simpler deployment** — Just npm package, no server setup
4. **Composable** — CLI commands work standalone or in scripts
5. **Debuggable** — Easy to test extraction in isolation

**Trade-offs accepted:**

- No real-time memory updates during session
- Must spawn Task for background work
- Slightly more latency than direct MCP calls

---

## OpenClaw Comparison

### What OpenClaw Does Well

- Hybrid search (BM25 + vectors)
- Pre-compaction memory flush
- Structured fact extraction
- sqlite-vec for embeddings

### What ccrecall Does Differently

| Aspect         | OpenClaw         | ccrecall                  |
| -------------- | ---------------- | ------------------------- |
| Architecture   | Monolithic MCP   | Modular CLI + Skills      |
| Session data   | Captures via MCP | Already has transcripts   |
| Memory trigger | MCP tool calls   | Hook-spawned Tasks        |
| Storage        | Single database  | Sessions + memories split |
| Format         | JSONL memories   | SQLite table              |

### Patterns Adopted

- Separate memory from raw transcript
- Confidence scores on extracted facts
- Category taxonomy for facts
- Background extraction (async)

### Patterns Avoided

- Monolithic design — ccrecall stays modular
- JSONL format — SQLite for queryability
- MCP dependency — hooks/CLI instead
- Coupled extraction — ccrecall extracts on-demand

---

## Summary

| Decision    | Choice           | Key Reason                              |
| ----------- | ---------------- | --------------------------------------- |
| Data model  | Separate tables  | Clean separation, re-extractable        |
| Integration | CLI/Skills       | Hooks reliable, no daemon               |
| vs OpenClaw | Modular approach | Already have sessions, add memory layer |
