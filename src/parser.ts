export interface TranscriptMessage {
	uuid: string;
	parentUuid?: string;
	sessionId: string;
	type: 'user' | 'assistant' | 'summary';
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
	// tool_use fields
	id?: string;
	name?: string;
	input?: unknown;
	// tool_result fields
	tool_use_id?: string;
	content?: string | ContentBlock[];
	is_error?: boolean;
}

export interface ToolCall {
	id: string;
	tool_name: string;
	tool_input: string;
}

export interface ToolResult {
	tool_call_id: string;
	content: string;
	is_error: boolean;
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
	tool_calls: ToolCall[];
	tool_results: ToolResult[];
}

function extract_text(
	content: string | ContentBlock[] | undefined,
): string | undefined {
	if (!content) return undefined;
	if (typeof content === 'string') return content;

	const text_parts = content
		.filter(
			(b): b is ContentBlock & { text: string } =>
				b.type === 'text' && typeof b.text === 'string',
		)
		.map((b) => b.text);

	return text_parts.length > 0 ? text_parts.join('\n') : undefined;
}

function extract_thinking(
	content: string | ContentBlock[] | undefined,
): string | undefined {
	if (!content || typeof content === 'string') return undefined;

	const thinking = content.find(
		(b) => b.type === 'thinking' && b.thinking,
	);
	return thinking?.thinking;
}

function extract_tool_calls(
	content: string | ContentBlock[] | undefined,
): ToolCall[] {
	if (!content || typeof content === 'string') return [];

	return content
		.filter((b) => b.type === 'tool_use' && b.id && b.name)
		.map((b) => ({
			id: b.id!,
			tool_name: b.name!,
			tool_input: b.input ? JSON.stringify(b.input) : '{}',
		}));
}

function extract_tool_results(
	content: string | ContentBlock[] | undefined,
): ToolResult[] {
	if (!content || typeof content === 'string') return [];

	return content
		.filter((b) => b.type === 'tool_result' && b.tool_use_id)
		.map((b) => {
			let result_content = '';
			if (typeof b.content === 'string') {
				result_content = b.content;
			} else if (Array.isArray(b.content)) {
				result_content = b.content
					.filter((c) => c.type === 'text' && c.text)
					.map((c) => c.text)
					.join('\n');
			}
			return {
				tool_call_id: b.tool_use_id!,
				content: result_content,
				is_error: b.is_error ?? false,
			};
		});
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
			content_text:
				data.type === 'summary'
					? data.summary
					: extract_text(data.message?.content),
			content_json: data.message?.content
				? JSON.stringify(data.message.content)
				: undefined,
			thinking: extract_thinking(data.message?.content),
			timestamp,
			input_tokens: usage?.input_tokens ?? 0,
			output_tokens: usage?.output_tokens ?? 0,
			cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
			cache_creation_tokens: usage?.cache_creation_input_tokens ?? 0,
			cwd: data.cwd,
			git_branch: data.gitBranch,
			summary: data.summary,
			tool_calls: extract_tool_calls(data.message?.content),
			tool_results: extract_tool_results(data.message?.content),
		};
	} catch {
		return null;
	}
}

export async function* parse_file(
	file_path: string,
	start_offset = 0,
): AsyncGenerator<{ message: ParsedMessage; byte_offset: number }> {
	const file = Bun.file(file_path);
	const text = await file.text();

	// If starting from offset, slice the content
	const content =
		start_offset > 0
			? new TextDecoder().decode(
					new TextEncoder().encode(text).slice(start_offset),
				)
			: text;

	const lines = content.split('\n');
	let byte_offset = start_offset;

	for (const line of lines) {
		const line_bytes = new TextEncoder().encode(line).length + 1; // +1 for newline

		if (line.trim()) {
			const message = parse_message(line);
			if (message) {
				yield { message, byte_offset: byte_offset + line_bytes };
			}
		}

		byte_offset += line_bytes;
	}
}
