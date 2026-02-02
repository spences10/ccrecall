# Future Enhancements

## Vector Embeddings

### sqlite-vec Integration

- Use [sqlite-vec](https://github.com/asg017/sqlite-vec) extension
- Store embeddings alongside memories in SQLite
- Pattern from OpenClaw: dedicated `embeddings` table linked to
  content

```sql
CREATE TABLE memory_embeddings (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id),
  embedding BLOB NOT NULL,  -- sqlite-vec vec type
  model TEXT,               -- embedding model used
  created_at INTEGER
);
CREATE INDEX idx_memory_embeddings_vec ON memory_embeddings(embedding);
```

### Embedding Providers (Local Only - No API Keys)

**Design principle:** Zero external API dependencies. Users should not
need to configure API keys.

**Local GGUF models:**

- all-MiniLM-L6-v2 (384 dimensions, ~25MB, fast)
- nomic-embed-text (768 dimensions, ~100MB, better quality)
- bge-small-en (384 dimensions, ~45MB, good balance)

**How it works:**

- First run auto-downloads model to `~/.ccrecall/models/`
- Embeddings computed locally via llama.cpp bindings
- No network calls, no API keys, no costs

**Config:**

```bash
ccrecall config set embedding.model all-MiniLM-L6-v2
```

**Note:** API-based providers intentionally not supported to keep
setup frictionless.

---

## Hybrid Search

### BM25 + Vector Combination

OpenClaw pattern: **70% vector, 30% keyword**

```
final_score = (0.7 * vector_similarity) + (0.3 * bm25_score)
```

**Why hybrid:**

- Vector alone misses exact matches ("pnpm" vs "package manager")
- BM25 alone misses semantic similarity ("error handling" vs
  "exception management")
- Hybrid catches both

### Implementation

- SQLite FTS5 for BM25 scoring
- sqlite-vec for cosine similarity
- Normalize both scores to 0-1 range before combining

```sql
-- FTS5 for keyword search
CREATE VIRTUAL TABLE memories_fts USING fts5(
  fact,
  content='memories',
  content_rowid='rowid'
);
```

---

## Chunking Strategies

### OpenClaw Parameters

- **Chunk size:** 400 tokens
- **Overlap:** 80 tokens (20%)
- **Splitter:** Recursive character with semantic boundaries

### Why Chunk

- Embedding models have token limits (512-8192)
- Smaller chunks = more precise retrieval
- Overlap prevents context loss at boundaries

### Session-Specific Considerations

- Split by turn boundaries when possible
- Keep tool calls with their results
- Preserve code blocks as atomic units

---

## Auto-Categorization

### Category Taxonomy

```
preferences    - User preferences, settings, style choices
knowledge      - Facts about codebase, architecture, domain
patterns       - Coding patterns, conventions, approaches
skills         - User skills, expertise areas
projects       - Project-specific context, goals, status
relationships  - Entity relationships, dependencies
```

### LLM-Based Classification

- Run categorization during extraction
- Use fast model (Haiku/GPT-4o-mini)
- Include in extraction prompt:
  ```
  Extract facts and categorize each as:
  preferences | knowledge | patterns | skills | projects | relationships
  ```

### Fallback

- Default to "knowledge" if uncertain
- Allow manual recategorization via CLI

---

## Memory Deduplication

### Problem

Same fact extracted from multiple sessions:

- "User prefers pnpm" (session A)
- "Uses pnpm instead of npm" (session B)
- "pnpm is the package manager" (session C)

### Approaches

**1. Embedding Similarity**

- Before inserting, check vector similarity to existing memories
- Threshold: 0.95 cosine similarity = probable duplicate
- Merge: keep older memory, update confidence, link all source
  sessions

**2. LLM-Based Merging**

- Periodic consolidation pass
- Prompt: "Are these facts about the same thing? If yes, provide
  merged version."
- More accurate but higher cost

**3. Source Tracking**

```sql
CREATE TABLE memory_sources (
  memory_id TEXT REFERENCES memories(id),
  session_id TEXT REFERENCES sessions(id),
  turn_index INTEGER,
  extracted_at INTEGER
);
```

---

## Confidence Decay

### Time-Based Decay

- Memories become less reliable over time
- Decay function: `confidence * e^(-lambda * days_since_update)`
- Lambda = 0.01 (half-life ~70 days)

### Reinforcement

- Same fact extracted again → refresh confidence
- User confirms fact → boost confidence
- User corrects fact → reduce confidence, create new memory

### Usage in Retrieval

```sql
SELECT *,
  confidence * EXP(-0.01 * (unixepoch() - updated_at) / 86400) as effective_confidence
FROM memories
ORDER BY effective_confidence DESC;
```

### Pruning

- Effective confidence < 0.1 → archive
- No references in 6 months → suggest deletion
- User command: `ccrecall memories prune --dry-run`

---

## Implementation Priority

| Enhancement          | Complexity | Value  | Priority |
| -------------------- | ---------- | ------ | -------- |
| Hybrid BM25 search   | Low        | High   | P1       |
| Auto-categorization  | Low        | Medium | P1       |
| Memory deduplication | Medium     | High   | P2       |
| Vector embeddings    | Medium     | High   | P2       |
| Confidence decay     | Low        | Medium | P3       |
| Chunking strategies  | Medium     | Medium | P3       |

---

## Open Questions

- Embedding model choice: quality vs speed vs privacy tradeoffs?
- Decay parameters: what half-life makes sense for code context?
- Dedup threshold: 0.95 too aggressive? Too conservative?
- Category list: fixed or extensible?
- Vector storage: sqlite-vec or external (Chroma, Qdrant)?
