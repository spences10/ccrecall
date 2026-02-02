# ccrecall - Documentation

Documentation for ccrecall: sync Claude Code transcripts and recall
context from past sessions.

## Goal

Solve the "starting from 0" problem in Claude Code sessions by:

1. Extracting memories from past sessions
2. Bootstrapping new sessions with relevant context
3. Using CLI/skills instead of MCP servers

## Design Principles

- **Zero API keys** - No external API configuration required
- **Uses existing Claude tokens** - Extraction runs within your Claude
  Code session
- **Local-first** - All data stays in SQLite, embeddings use local
  models
- **Frictionless** - Just install and use, no setup wizard

## Documents

| Doc                                                         | Description                                              |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| [01-openclaw-research](./01-openclaw-research.md)           | Research on OpenClaw/memU memory systems                 |
| [02-architecture-decisions](./02-architecture-decisions.md) | Key design choices (sessions vs memories, CLI vs MCP)    |
| [03-schema-changes](./03-schema-changes.md)                 | New `memories` table + schema migrations                 |
| [04-extraction-approach](./04-extraction-approach.md)       | Session-start trigger, background extraction             |
| [05-bootstrap-skill](./05-bootstrap-skill.md)               | `/bootstrap` skill design                                |
| [06-cli-commands](./06-cli-commands.md)                     | New CLI commands (extract-memories, memories, bootstrap) |
| [07-future-enhancements](./07-future-enhancements.md)       | Vector search, auto-categorization, etc.                 |

## Implementation Phases

1. **Phase 1: Schema** - Add memories table, extraction tracking
2. **Phase 2: CLI** - `ccrecall extract-memories`,
   `ccrecall memories`, `ccrecall bootstrap`
3. **Phase 3: Skills/Hooks** - Session-start extraction, `/bootstrap`
   skill
4. **Phase 4: Enhancements** - Vector search (local sqlite-vec),
   hybrid retrieval

## Open Questions

1. **Extraction prompt** — What makes a good "fact"?
2. **Categories** — Fixed list or LLM-generated?
3. **Token budget** — Cap for background extraction?
4. **History window** — All sessions or rolling N days?

## Key Insight

OpenClaw's "magic" is just:

- Markdown files on disk
- SQLite + sqlite-vec for search
- Pre-compaction memory flush

We achieve similar results with:

- SQLite for everything (sessions + memories)
- Local embeddings via GGUF models (no API keys)
- Hooks that use existing Claude subscription tokens
