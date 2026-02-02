# Extraction Approach

## Core Principle: Trigger on Session START

Session-end hooks are **unreliable** for memory extraction:

- Users may ctrl+c, terminal crashes, network disconnects
- Claude Code has no guaranteed "clean shutdown" event

Session-start is reliable because:

- UserPromptSubmit hook fires predictably on first message
- If hook doesn't fire, session never really started

Reference:
[How to Make Claude Code Skills Activate Reliably](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER STARTS NEW SESSION                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              UserPromptSubmit Hook Fires                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     Check: Does /tmp/ccrecall-session-$$ exist?                     │
│                                                                  │
│     YES → Already initialized, skip                              │
│     NO  → First message of session                               │
└─────────────────────────────────────────────────────────────────┘
                               │ NO
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     Create marker: touch /tmp/ccrecall-session-$$                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     Quick DB check: Any sessions with memories_extracted=0?      │
│                                                                  │
│     NO  → Done, return immediately                               │
│     YES → Spawn background extraction                            │
└─────────────────────────────────────────────────────────────────┘
                               │ YES
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     Spawn Background Task (run_in_background=true)               │
│     - Extract memories from unprocessed sessions                 │
│     - Write to memories table                                    │
│     - Mark sessions as processed                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     USER CONTINUES WORKING (non-blocking)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Session Detection Pattern

Use temp file as marker to distinguish first message from subsequent:

```bash
MARKER="/tmp/ccrecall-session-$$"

if [ ! -f "$MARKER" ]; then
  # First message of this session
  touch "$MARKER"
  ccrecall extract-memories --unprocessed --background
fi
```

`$$` = shell process ID, unique per terminal session.

Marker auto-cleaned on terminal close (temp dir cleared).

---

## Background Task Spawning (Uses Existing Claude Tokens)

Use Claude Code's Task tool with background execution:

```
Task tool call:
  prompt: "Extract memories from unprocessed ccrecall sessions"
  run_in_background: true
```

**Key insight: No separate API keys required.**

The extraction runs within the user's active Claude Code session,
using their existing Pro/Max subscription tokens. This means:

- Returns immediately to user
- Background task runs async
- No blocking on long extractions
- No additional API keys to configure
- No separate billing - uses existing Claude subscription
- Works within Claude Code's existing infrastructure

---

## Token Budget Considerations

Background extraction should be cost-conscious:

| Constraint             | Recommendation        |
| ---------------------- | --------------------- |
| Per-session extraction | ~500-1000 tokens      |
| Batch size             | 5-10 sessions per run |
| Total per trigger      | Cap at ~5000 tokens   |

Strategies to minimize tokens:

- Only process sessions > N messages (skip trivial sessions)
- Summarize before extracting (reduce input)
- Use structured prompts for consistent output
- Skip sessions older than X days (configurable window)

---

## Why Not Session-End?

| Approach                 | Reliability | Complexity                    |
| ------------------------ | ----------- | ----------------------------- |
| Session-end hook         | Poor (~60%) | Low                           |
| Daemon watching files    | High        | High (needs separate process) |
| Session-start background | High        | Medium                        |

Session-start with background extraction is the sweet spot:

- Reliable trigger
- No extra infrastructure
- Extracts "previous" sessions, not "current"
- Graceful degradation if skipped

---

## Implementation Checklist

- [ ] Add `memories_extracted` column to sessions table
- [ ] Create hook in `.claude/hooks/UserPromptSubmit`
- [ ] Implement `ccrecall extract-memories --unprocessed`
- [ ] Add `--background` flag for non-blocking mode
- [ ] Test marker cleanup on session end
