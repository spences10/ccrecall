# Bootstrap Skill

Claude Code skill that injects relevant context at session start,
solving the "starting from 0" problem.

## Purpose

Every new Claude Code session starts with no memory of prior sessions.
The bootstrap skill queries ccrecall's database to surface:

- Recent session context (what was worked on)
- Extracted memories/facts (preferences, patterns, decisions)
- Project-specific knowledge

This gives Claude immediate context without manual prompting.

## Skill Format

```yaml
---
name: bootstrap
description:
  Bootstrap session with relevant context from ccrecall. Use when user
  invokes /bootstrap, /context, or at session start. Queries recent
  sessions and memories to provide relevant context.
tools: Bash
---
```

**Invocation:**

- `/bootstrap` - manual invocation
- `/context` - alias
- Optionally auto-triggered via session-start hook

## How It Works

### 1. Query Recent Sessions

```bash
ccrecall sessions --recent 5 --project $(pwd)
```

Returns recent sessions for current project:

- Session summaries
- Last activities
- Files touched

### 2. Query Memories Table

```bash
ccrecall memories search "relevant query"
ccrecall memories list --category preferences
```

Returns extracted facts:

- User preferences (`pnpm over npm`)
- Learned patterns (`always run tests before commit`)
- Project knowledge (`auth uses JWT, stored in redis`)

### 3. Inject Context

Skill formats queried data as context block for Claude:

```markdown
## Session Context (from ccrecall)

### Recent Sessions

- 2h ago: Refactored auth middleware
- 1d ago: Added rate limiting to API

### Relevant Memories

- Preference: Use pnpm, not npm
- Pattern: Run `pnpm test` before any commit
- Knowledge: API uses Express + Prisma
```

## Search Approach

### Phase 1: Keyword Search (Current)

Simple text matching on:

- Session summaries
- Memory fact text
- Tool call content (file paths, code snippets)

```sql
SELECT fact, category FROM memories
WHERE fact LIKE '%' || :query || '%'
ORDER BY updated_at DESC
LIMIT 10;
```

### Phase 2: Hybrid Search (Future)

When sqlite-vec is added:

```sql
-- Keyword match
WITH keyword_matches AS (
  SELECT id, fact, 1.0 as score FROM memories
  WHERE fact LIKE '%' || :query || '%'
),
-- Vector similarity
vector_matches AS (
  SELECT id, fact, vec_distance(embedding, :query_vec) as score
  FROM memories
  WHERE embedding IS NOT NULL
)
-- Combine with RRF or similar
SELECT * FROM keyword_matches
UNION
SELECT * FROM vector_matches
ORDER BY score DESC
LIMIT 10;
```

Vector embeddings enable:

- Semantic similarity
  (`"auth" finds "authentication", "login", "JWT"`)
- Fuzzy matching
- Cross-session pattern detection

## CLI Commands

```bash
# Bootstrap with auto-detected context
ccrecall bootstrap

# Bootstrap with specific query
ccrecall bootstrap --query "api rate limiting"

# Bootstrap for specific project
ccrecall bootstrap --project /path/to/repo

# Output format options
ccrecall bootstrap --format markdown  # default
ccrecall bootstrap --format json      # for programmatic use
```

## Expected Output

### Markdown (Default)

```markdown
## Context from ccrecall

### Recent Activity (this project)

- **2h ago**: Refactored middleware error handling
- **5h ago**: Added input validation to user routes
- **1d ago**: Set up Prisma with PostgreSQL

### Relevant Memories

| Category   | Fact                            |
| ---------- | ------------------------------- |
| preference | Use pnpm for package management |
| pattern    | Run tests with `pnpm test:unit` |
| knowledge  | Auth tokens expire after 24h    |

### Files Frequently Touched

- `src/middleware/auth.ts` (12 edits)
- `src/routes/users.ts` (8 edits)
- `prisma/schema.prisma` (5 edits)
```

### JSON (Programmatic)

```json
{
	"sessions": [
		{
			"id": "abc123",
			"summary": "Refactored middleware error handling",
			"timestamp": 1706800000,
			"files": ["src/middleware/auth.ts"]
		}
	],
	"memories": [
		{
			"fact": "Use pnpm for package management",
			"category": "preference",
			"confidence": 0.95
		}
	],
	"frequent_files": [
		{ "path": "src/middleware/auth.ts", "edit_count": 12 }
	]
}
```

## Integration with Claude Code

### As a Skill

Create `.claude/skills/bootstrap/SKILL.md`:

```markdown
---
name: bootstrap
description:
  Bootstrap session context from ccrecall history. Use when user says
  /bootstrap or /context.
tools: Bash
---

# Bootstrap Skill

Query ccrecall for session context and memories.

## Steps

1. Run `ccrecall bootstrap --project $(pwd) --format markdown`
2. Present output as context
3. Offer to expand on any area

## Example

User: /bootstrap → Run ccrecall bootstrap → Display context summary →
"I've loaded context from your recent sessions. Anything specific
you'd like to focus on?"
```

### As a Hook (Auto-Bootstrap)

In `.claude/settings.json`:

```json
{
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "first_message",
				"command": "ccrecall bootstrap --project $PWD --format markdown"
			}
		]
	}
}
```

This auto-injects context on session start.

## Token Efficiency

Bootstrap output is designed to be concise:

| Component         | Estimated Tokens |
| ----------------- | ---------------- |
| 5 recent sessions | ~150             |
| 10 memories       | ~200             |
| 5 frequent files  | ~50              |
| **Total**         | ~400 tokens      |

Compare to re-reading files (~2000+ tokens) or manual context
(~variable).

## Privacy Considerations

- All data stays local (SQLite)
- No external API calls
- Memories extracted only from user's own sessions
- User controls what gets extracted via prompts
