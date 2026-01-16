# cclog

Sync Claude Code transcripts to SQLite for analytics.

## Install

### Binary (recommended)

| File                                                                                                         | Platform                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| [`cclog-linux-x64`](https://github.com/spences10/cclog/releases/latest/download/cclog-linux-x64)             | Linux (Intel/AMD)         |
| [`cclog-linux-arm64`](https://github.com/spences10/cclog/releases/latest/download/cclog-linux-arm64)         | Linux (ARM, Raspberry Pi) |
| [`cclog-darwin-x64`](https://github.com/spences10/cclog/releases/latest/download/cclog-darwin-x64)           | macOS (Intel)             |
| [`cclog-darwin-arm64`](https://github.com/spences10/cclog/releases/latest/download/cclog-darwin-arm64)       | macOS (Apple Silicon)     |
| [`cclog-windows-x64.exe`](https://github.com/spences10/cclog/releases/latest/download/cclog-windows-x64.exe) | Windows                   |

Or use curl:

```bash
# Linux (x64)
curl -fsSL https://github.com/spences10/cclog/releases/latest/download/cclog-linux-x64 -o ~/.local/bin/cclog && chmod +x ~/.local/bin/cclog

# Linux (arm64)
curl -fsSL https://github.com/spences10/cclog/releases/latest/download/cclog-linux-arm64 -o ~/.local/bin/cclog && chmod +x ~/.local/bin/cclog

# macOS (Apple Silicon)
curl -fsSL https://github.com/spences10/cclog/releases/latest/download/cclog-darwin-arm64 -o /usr/local/bin/cclog && chmod +x /usr/local/bin/cclog

# macOS (Intel)
curl -fsSL https://github.com/spences10/cclog/releases/latest/download/cclog-darwin-x64 -o /usr/local/bin/cclog && chmod +x /usr/local/bin/cclog
```

### From source

Requires [Bun](https://bun.sh) >= 1.0:

```bash
git clone https://github.com/spences10/cclog.git
cd cclog
bun install
bun src/index.ts sync
```

## Usage

```bash
# Sync transcripts from ~/.claude/projects to SQLite
cclog sync

# Show stats
cclog stats

# Help
cclog --help
```

### From source

```bash
bun src/index.ts sync
bun src/index.ts stats
```

### Commands

| Command | Description                       |
| ------- | --------------------------------- |
| `sync`  | Import transcripts (incremental)  |
| `stats` | Show session/message/token counts |

### Options

| Flag              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `-v, --verbose`   | Show files being processed                           |
| `-d, --db <path>` | Custom database path (default: `~/.claude/cclog.db`) |

## Database Schema

```sql
sessions (id, project_path, git_branch, cwd, first_timestamp, last_timestamp, summary)
messages (uuid, session_id, parent_uuid, type, model, content_text, content_json, thinking, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
tool_calls (id, message_uuid, session_id, tool_name, tool_input, timestamp)
tool_results (id, tool_call_id, message_uuid, session_id, content, is_error, timestamp)
sync_state (file_path, last_modified, last_byte_offset)
```

## Example Queries

```sql
-- Token usage by project
SELECT project_path, SUM(input_tokens + output_tokens) as tokens
FROM sessions s
JOIN messages m ON m.session_id = s.id
GROUP BY project_path
ORDER BY tokens DESC;

-- Daily message count
SELECT DATE(timestamp/1000, 'unixepoch') as day, COUNT(*) as messages
FROM messages
GROUP BY day
ORDER BY day DESC;

-- Most used models
SELECT model, COUNT(*) as count
FROM messages
WHERE model IS NOT NULL
GROUP BY model
ORDER BY count DESC;

-- Tool usage breakdown
SELECT tool_name, COUNT(*) as count
FROM tool_calls
GROUP BY tool_name
ORDER BY count DESC;

-- Files read in a session
SELECT tc.tool_name, json_extract(tc.tool_input, '$.file_path') as file
FROM tool_calls tc
WHERE tc.tool_name = 'Read' AND tc.session_id = 'your-session-id';

-- Code changes (edits) with before/after
SELECT
  json_extract(tc.tool_input, '$.file_path') as file,
  json_extract(tc.tool_input, '$.old_string') as old,
  json_extract(tc.tool_input, '$.new_string') as new
FROM tool_calls tc
WHERE tc.tool_name = 'Edit';

-- Session cost estimate (Opus 4.5)
SELECT
  s.project_path,
  SUM(m.input_tokens) / 1000000.0 * 15 +
  SUM(m.output_tokens) / 1000000.0 * 75 +
  SUM(m.cache_read_tokens) / 1000000.0 * 1.5 +
  SUM(m.cache_creation_tokens) / 1000000.0 * 18.75 as cost_usd
FROM sessions s
JOIN messages m ON m.session_id = s.id
WHERE m.model LIKE '%opus%'
GROUP BY s.id
ORDER BY cost_usd DESC;
```

## License

MIT
