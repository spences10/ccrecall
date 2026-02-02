# OpenClaw & memU Research

Research into existing AI memory systems for cclog evolution.

---

## OpenClaw Architecture

OpenClaw uses a **file-first, Markdown-driven memory system** with
semantic search.

### Storage Structure

```
~/.openclaw/workspace/
  MEMORY.md              # Curated long-term memory
  memory/
    YYYY-MM-DD.md        # Daily logs (append-only)
  sessions/
    YYYY-MM-DD-<slug>.md # Session transcripts
```

### Memory Layers

| Layer     | Location               | Purpose                                 |
| --------- | ---------------------- | --------------------------------------- |
| Ephemeral | `memory/YYYY-MM-DD.md` | Daily context, loads today + yesterday  |
| Durable   | `MEMORY.md`            | Long-term facts, preferences, decisions |
| Session   | `sessions/*.md`        | Searchable conversation transcripts     |

### Search Infrastructure

- **SQLite** for index storage (`~/.openclaw/memory/<agentId>.sqlite`)
- **sqlite-vec** extension for in-database vector similarity
- **FTS5** for BM25 lexical search
- Per-agent isolation via separate SQLite files

---

## memU Addon

memU is an agentic memory framework with a 3-tier hierarchy.

### Three-Layer Architecture

| Layer | Name            | Description                                      |
| ----- | --------------- | ------------------------------------------------ |
| 1     | Resource        | Raw multimodal data (text, images, audio, video) |
| 2     | Memory Item     | Fine-grained facts as natural language sentences |
| 3     | Memory Category | Thematic files synthesizing related items        |

### Bidirectional Traceability

```
Raw Data <-> Memory Items <-> Memory Categories
```

Every piece of knowledge traces to origin, enabling provenance
tracking.

### Category Examples

memU supports 10+ categories including:

- Preferences / Decisions
- Knowledge / Facts
- Patterns / Conventions
- Project context
- User interactions
- Custom categories via LLM auto-classification

### Core Processes

1. **Memorization** - Async transform from raw -> items -> categories
2. **Retrieval** - Top-down search: Categories -> Items -> Resources
3. **LLM-based Search** - Model directly reads category files
   (non-embedding)

---

## Key Patterns to Adopt

### 1. Hybrid BM25 + Vector Search

OpenClaw combines two retrieval methods with weighted fusion:

```
finalScore = vectorWeight * vectorScore + textWeight * textScore
```

**Default weights**: 70% vector / 30% BM25

**Why hybrid?**

- Vector: semantic matches ("gateway host" ~ "machine running
  gateway")
- BM25: exact tokens (error codes, function names, IDs)

BM25 score normalization:

```
textScore = 1 / (1 + max(0, bm25Rank))
```

### 2. Pre-Compaction Memory Flush

Before context compaction, OpenClaw triggers silent agentic turn to
persist memory.

**Trigger condition**:

```
tokenUsed >= contextWindow - reserveTokensFloor - softThresholdTokens
```

**Behavior**:

- Silent by default (`NO_REPLY` if nothing to save)
- One flush per compaction cycle
- Skipped in read-only mode

**cclog adaptation**: Trigger extraction at session START instead
(more reliable hook point).

### 3. Embedding Cache

SHA-256 hash-based deduplication:

- Same content -> same hash -> cache hit -> skip re-embedding
- Stored in SQLite alongside chunks
- Max 50,000 entries default

**Cost savings**: Up to 50% with cache hits + OpenAI Batch API.

### 4. Chunking Strategy

- **Target**: ~400 tokens per chunk (~1600 chars)
- **Overlap**: 80 tokens (~320 chars) between chunks
- **Line-aware**: Preserves line numbers for attribution
- **Hash-based**: Each chunk gets SHA-256 for cache lookup

---

## What NOT to Copy

### 1. Monolithic Design

OpenClaw bundles everything (gateway, channels, plugins). cclog should
stay focused:

- Keep CLI-first approach
- Skills/hooks integration vs. built-in MCP server
- Separate concerns: sessions (existing) vs. memories (new)

### 2. JSONL Format

OpenClaw session logs use JSONL
(`~/.openclaw/agents/<id>/sessions/*.jsonl`).

**Problems**:

- Less human-readable
- Harder to edit manually
- cclog already uses SQLite - stay consistent

**cclog approach**: SQLite for both sessions and memories, linked via
`session_id`.

### 3. External API Dependencies

OpenClaw requires separate API keys for embeddings (OpenAI/Gemini).

**ccrecall approach: Zero API keys required**

- Extraction uses Claude Code's existing session (user's Pro/Max
  tokens)
- Embeddings use local GGUF models (optional, for semantic search)
- All computation happens locally or via existing Claude subscription
- No additional accounts or API keys to configure

### 4. Real-time File Watching

OpenClaw watches memory files with debounced sync.

**cclog approach**: Extract on-demand at session start, not continuous
watching.

---

## Sources

- [OpenClaw Memory Docs](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Memory Deep Dive (Study Notes)](https://snowan.gitbook.io/study-notes/ai-blogs/openclaw-memory-system-deep-dive)
- [memU Documentation](https://memu.pro/docs)
- [memU Memory Categories](https://memu.pro/ai-agent-memory-category)
- [Clawdbot Memory Architecture (Medium)](https://medium.com/aimonks/clawdbots-memory-architecture-pre-compaction-flush-the-engineering-reality-behind-never-c8ff84a4a11a)
