# CLI Commands

New CLI commands for memory extraction and context bootstrapping.

---

## Existing Commands

### `ccrecall sync`

Sync Claude Code transcripts to SQLite database.

```bash
ccrecall sync [-v] [-d path]

# Options:
#   -v, --verbose    Show detailed output
#   -d, --db <path>  Database path (default: ~/.claude/ccrecall.db)
```

### `ccrecall stats`

Show database statistics.

```bash
ccrecall stats [-d path]

# Output:
#   Sessions, messages, tool calls, tokens usage
```

---

## Memory Extraction Commands

### `ccrecall extract-memories`

Extract memories from session transcripts.

```bash
# Extract from specific session
ccrecall extract-memories --session <session-id>

# Extract from sessions since date
ccrecall extract-memories --since <date>
ccrecall extract-memories --since yesterday
ccrecall extract-memories --since 2024-01-15

# Extract all unprocessed sessions
ccrecall extract-memories --unprocessed
```

**Options:** | Flag | Description | |------|-------------| |
`--session <id>` | Extract from specific session ID | |
`--since <date>` | Extract from sessions after date | |
`--unprocessed` | Only sessions not yet extracted |

**Output:**

```
Extracting memories...
  Session: abc123
    Facts extracted: 4
    Categories: preferences (2), knowledge (1), patterns (1)
  Session: def456
    Facts extracted: 2
    Categories: preferences (1), knowledge (1)

Done!
  Sessions processed: 2
  Total facts: 6
```

---

## Memory Query Commands

### `ccrecall memories search`

Search extracted memories.

```bash
ccrecall memories search <query>
ccrecall memories search "pnpm preference"
ccrecall memories search "testing patterns" --category patterns
```

**Options:** | Flag | Description | |------|-------------| |
`--category <cat>` | Filter by category |

**Output:**

```
Found 3 memories:

[preferences] confidence: 0.9
  "User prefers pnpm over npm for package management"
  Session: abc123 | 2024-01-15

[preferences] confidence: 0.85
  "Prefers bun for TypeScript projects"
  Session: def456 | 2024-01-10

[patterns] confidence: 0.8
  "Tends to use pnpm workspaces for monorepos"
  Session: ghi789 | 2024-01-08
```

### `ccrecall memories list`

List all memories, optionally filtered.

```bash
# List all
ccrecall memories list

# Filter by category
ccrecall memories list --category preferences
ccrecall memories list --category knowledge
ccrecall memories list --category patterns
```

**Categories:**

- `preferences` — User preferences and choices
- `knowledge` — Domain knowledge, project facts
- `patterns` — Behavioral patterns, workflows
- `learnings` — Things learned during sessions

---

## Bootstrap Command

### `ccrecall bootstrap`

Generate context bootstrap from memories and recent sessions.

```bash
ccrecall bootstrap --query <query>
ccrecall bootstrap --query "current project context"
ccrecall bootstrap --query "user preferences"
```

**Options:** | Flag | Description | |------|-------------| |
`--query <query>` | Semantic query for relevant context | |
`--limit <n>` | Max memories to include (default: 10) |

**Output:** Markdown-formatted context suitable for injection into
Claude session.

```markdown
## User Preferences

- Prefers pnpm for package management
- Uses Bun for TypeScript projects
- Favors concise code over verbose

## Recent Context

- Working on ccrecall memory feature
- Using SQLite for storage

## Patterns

- Tends to refactor after initial implementation
- Prefers tests alongside implementation
```

**Use case:** Called by `/bootstrap` skill at session start to inject
relevant context.

---

## Global Options

All commands support:

| Flag              | Description                                   |
| ----------------- | --------------------------------------------- |
| `-d, --db <path>` | Database path (default: `~/.claude/ccrecall.db`) |
| `-v, --verbose`   | Show detailed output                          |
| `-h, --help`      | Show help                                     |

---

## Examples

```bash
# Full workflow: sync, extract, query
ccrecall sync
ccrecall extract-memories --unprocessed
ccrecall memories search "preferences"

# Bootstrap context for new session
ccrecall bootstrap --query "working on ccrecall" > context.md

# Check extraction status
ccrecall stats  # Shows memories count in stats
```
