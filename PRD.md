# Claude Code Analytics - PRD

## Problem

Capture Claude Code conversations in a queryable SQLite database without interfering with Claude processes.

## Solution

Standalone process that scans `~/.claude/projects/` and compiles transcript data into SQLite.

## Data Source

Transcript files: `~/.claude/projects/{project-path}/{session-id}.jsonl`

Contains:
- `type: "user"` - user messages with `message.content`
- `type: "assistant"` - assistant messages with `message.content`, `message.usage`
- `type: "summary"` - auto-generated session summary
- `sessionId`, `uuid`, `parentUuid`, `timestamp`
- Token usage: `input_tokens`, `output_tokens`, `cache_*`

## Architecture

```
~/.claude/projects/**/*.jsonl  -->  [parser]  -->  ~/.claude/claude-code-analytics.db
```

- Runs outside Claude processes (zero interference)
- User triggers manually or via cron/timer
- Tracks processed files/UUIDs to avoid duplicates

## Install

```bash
npm i -g claude-code-analytics
```

## Usage

```bash
claude-code-analytics sync
```

Scans all transcripts, parses, writes new data to SQLite.

## Database Location

`~/.claude/claude-code-analytics.db`

## Requirements

1. Parse all transcript JSONL files in ~/.claude/projects/
2. Extract user messages, assistant messages, usage metrics
3. Store in SQLite with proper schema
4. Track what's been processed (avoid duplicate writes)
5. No hooks, no background daemons, no interference with Claude

## Out of Scope (for now)

- Real-time capture via hooks
- Query CLI interface
- Web UI
- Analytics/visualizations

## Open Questions

- Schema design for messages table?
- How to handle agent-*.jsonl (subagent transcripts)?
- Include tool_use content blocks or text only?
