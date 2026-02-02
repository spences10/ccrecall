# Schema Changes for Memory Extraction

## Overview

This document details the database schema changes needed to support
memory extraction in ccrecall. Changes include a new `memories` table
and two new columns on the existing `sessions` table.

## Current Schema (Relevant Tables)

The existing `sessions` table stores raw transcript metadata:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  git_branch TEXT,
  cwd TEXT,
  first_timestamp INTEGER,
  last_timestamp INTEGER,
  summary TEXT
);
```

## New: memories Table

Stores extracted facts from session transcripts. Links to sessions via
`session_id` FK.

```sql
-- Extracted memories/facts from session transcripts
-- One session can produce many memories
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,                          -- UUID for each memory
  session_id TEXT REFERENCES sessions(id),      -- Source session (nullable for manual entries)
  fact TEXT NOT NULL,                           -- The extracted fact/knowledge
  category TEXT,                                -- Classification: preferences, knowledge, patterns, context, etc.
  confidence REAL,                              -- Extraction confidence 0.0-1.0 (LLM-assigned)
  created_at INTEGER,                           -- Unix timestamp when extracted
  updated_at INTEGER                            -- Unix timestamp of last modification
);

-- Index for session lookups (find all memories from a session)
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);

-- Index for category-based queries
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

-- Index for temporal queries (recent memories)
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
```

## ALTER: sessions Table

Track extraction status per session to avoid reprocessing:

```sql
-- Track whether memories have been extracted from this session
-- 0 = not extracted, 1 = extracted
ALTER TABLE sessions ADD COLUMN memories_extracted INTEGER DEFAULT 0;

-- When extraction was last attempted (success or failure)
-- NULL = never attempted
ALTER TABLE sessions ADD COLUMN extraction_attempted_at INTEGER;
```

Combined index for finding unprocessed sessions:

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_extraction ON sessions(memories_extracted, extraction_attempted_at);
```

## Relationship Diagram

```
sessions (1) -----> (*) memories
    |                     |
    +-- id <--------------+-- session_id (FK)
    |
    +-- memories_extracted     (0 or 1)
    +-- extraction_attempted_at (timestamp)
```

## Migration SQL (Complete)

```sql
-- Memory extraction schema additions
-- Run against existing ccrecall database

-- 1. Create memories table
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  fact TEXT NOT NULL,
  category TEXT,
  confidence REAL,
  created_at INTEGER,
  updated_at INTEGER
);

-- 2. Add extraction tracking to sessions
ALTER TABLE sessions ADD COLUMN memories_extracted INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN extraction_attempted_at INTEGER;

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_extraction ON sessions(memories_extracted, extraction_attempted_at);
```

## Usage Patterns

### Find unprocessed sessions

```sql
SELECT id, project_path, last_timestamp
FROM sessions
WHERE memories_extracted = 0
ORDER BY last_timestamp DESC;
```

### Mark session as processed

```sql
UPDATE sessions
SET memories_extracted = 1,
    extraction_attempted_at = ?
WHERE id = ?;
```

### Insert extracted memory

```sql
INSERT INTO memories (id, session_id, fact, category, confidence, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?);
```

### Query memories by category

```sql
SELECT fact, confidence, created_at
FROM memories
WHERE category = ?
ORDER BY confidence DESC, created_at DESC;
```

### Full-text search across memories

```sql
SELECT fact, category, session_id
FROM memories
WHERE fact LIKE '%' || ? || '%'
ORDER BY created_at DESC;
```

## Integration with Existing Schema

The memories system integrates with existing tables:

| Table        | Relationship                                                |
| ------------ | ----------------------------------------------------------- |
| `sessions`   | Parent - memories extracted from session transcripts        |
| `messages`   | Indirect - messages provide raw content for extraction      |
| `tool_calls` | Indirect - tool usage patterns can inform memory extraction |
| `teams`      | None currently - future: team-level shared memories         |

## Category Taxonomy (Proposed)

Initial categories for the `category` column:

- `preferences` - User coding style, tool choices, patterns
- `knowledge` - Domain facts learned about the project
- `patterns` - Repeated behaviors, workflows
- `context` - Project-specific context (architecture, conventions)
- `corrections` - Things user corrected Claude on
- `todo` - Mentioned future work items
