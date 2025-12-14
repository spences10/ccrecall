import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface TranscriptMessage {
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  type: "user" | "assistant" | "summary";
  timestamp: string;
  cwd?: string;
  gitBranch?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  summary?: string;
  leafUuid?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
}

export interface ParsedMessage {
  uuid: string;
  session_id: string;
  parent_uuid?: string;
  type: string;
  model?: string;
  content_text?: string;
  content_json?: string;
  thinking?: string;
  timestamp: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cwd?: string;
  git_branch?: string;
  summary?: string;
}

function extract_text(content: string | ContentBlock[] | undefined): string | undefined {
  if (!content) return undefined;
  if (typeof content === "string") return content;

  const text_parts = content
    .filter((b): b is ContentBlock & { text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text);

  return text_parts.length > 0 ? text_parts.join("\n") : undefined;
}

function extract_thinking(content: string | ContentBlock[] | undefined): string | undefined {
  if (!content || typeof content === "string") return undefined;

  const thinking = content.find((b) => b.type === "thinking" && b.thinking);
  return thinking?.thinking;
}

export function parse_message(line: string): ParsedMessage | null {
  try {
    const data = JSON.parse(line) as TranscriptMessage;

    if (!data.uuid || !data.sessionId || !data.type) return null;

    const timestamp = new Date(data.timestamp).getTime();
    if (isNaN(timestamp)) return null;

    const usage = data.message?.usage;

    return {
      uuid: data.uuid,
      session_id: data.sessionId,
      parent_uuid: data.parentUuid,
      type: data.type,
      model: data.message?.model,
      content_text: data.type === "summary" ? data.summary : extract_text(data.message?.content),
      content_json: data.message?.content ? JSON.stringify(data.message.content) : undefined,
      thinking: extract_thinking(data.message?.content),
      timestamp,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
      cache_creation_tokens: usage?.cache_creation_input_tokens ?? 0,
      cwd: data.cwd,
      git_branch: data.gitBranch,
      summary: data.summary,
    };
  } catch {
    return null;
  }
}

export async function* parse_file(
  file_path: string,
  start_offset = 0
): AsyncGenerator<{ message: ParsedMessage; byte_offset: number }> {
  const stream = createReadStream(file_path, { start: start_offset, encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let byte_offset = start_offset;

  for await (const line of rl) {
    const line_bytes = Buffer.byteLength(line, "utf-8") + 1; // +1 for newline

    if (line.trim()) {
      const message = parse_message(line);
      if (message) {
        yield { message, byte_offset: byte_offset + line_bytes };
      }
    }

    byte_offset += line_bytes;
  }
}
