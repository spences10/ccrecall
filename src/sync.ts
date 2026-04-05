import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { glob } from 'tinyglobby';
import { Database } from './db.ts';
import { parse_file } from './parser.ts';

// Session directories to scan for transcripts
// Primary: standard Claude Code location
// Sneakpeek: temporary parallel build with unlocked features - can be removed when merged upstream
const PROJECTS_DIRS = [
	join(process.env.HOME!, '.claude', 'projects'),
	join(
		process.env.HOME!,
		'.claude-sneakpeek',
		'claudesp',
		'config',
		'projects',
	), // TEMPORARY: github.com/mikekelly/claude-sneakpeek
];

export interface SyncResult {
	files_scanned: number;
	files_processed: number;
	messages_added: number;
	sessions_added: number;
	tool_calls_added: number;
	tool_results_added: number;
}

export async function sync(
	db: Database,
	verbose = false,
): Promise<SyncResult> {
	const result: SyncResult = {
		files_scanned: 0,
		files_processed: 0,
		messages_added: 0,
		sessions_added: 0,
		tool_calls_added: 0,
		tool_results_added: 0,
	};

	// Auto-migration: if messages exist but no tool_calls, reset sync state
	const stats = db.get_stats();
	if (stats.messages > 0 && stats.tool_calls === 0) {
		console.log(
			'Migrating: resetting sync state to populate tool_calls...',
		);
		db.reset_sync_state();
	}

	const files: string[] = [];
	for (const projects_dir of PROJECTS_DIRS) {
		if (!existsSync(projects_dir)) continue;
		const matched = await glob('**/*.jsonl', {
			cwd: projects_dir,
			absolute: true,
		});
		files.push(...matched);
	}

	result.files_scanned = files.length;
	console.log(`Found ${files.length} transcript files`);

	const seen_sessions = new Set<string>();
	let file_idx = 0;

	db.disable_foreign_keys();
	db.begin();

	for (const file_path of files) {
		file_idx++;
		if (file_idx % 100 === 0) {
			process.stdout.write(
				`\r  Progress: ${file_idx}/${files.length}`,
			);
		}
		const last_modified = statSync(file_path).mtimeMs;

		const sync_state = db.get_sync_state(file_path);

		// Skip if file hasn't changed
		if (sync_state && sync_state.last_modified >= last_modified) {
			continue;
		}

		const start_offset = sync_state?.last_byte_offset ?? 0;
		const project_path = extract_project_path(file_path);

		if (verbose) {
			console.log(`Processing: ${file_path}`);
		}

		let last_byte_offset = start_offset;
		let file_messages_added = 0;

		for await (const { message, byte_offset } of parse_file(
			file_path,
			start_offset,
		)) {
			last_byte_offset = byte_offset;

			// Ensure session exists
			if (!seen_sessions.has(message.session_id)) {
				db.upsert_session({
					id: message.session_id,
					project_path: project_path,
					git_branch: message.git_branch,
					cwd: message.cwd,
					timestamp: message.timestamp,
					summary: message.summary,
				});
				seen_sessions.add(message.session_id);
				result.sessions_added++;
			}

			// Update session with summary if this is a summary message
			if (message.type === 'summary' && message.summary) {
				db.upsert_session({
					id: message.session_id,
					project_path: project_path,
					timestamp: message.timestamp,
					summary: message.summary,
				});
			}

			db.insert_message(message);
			file_messages_added++;

			// Insert tool calls
			for (const tool_call of message.tool_calls) {
				db.insert_tool_call({
					id: tool_call.id,
					message_uuid: message.uuid,
					session_id: message.session_id,
					tool_name: tool_call.tool_name,
					tool_input: tool_call.tool_input,
					timestamp: message.timestamp,
				});
				result.tool_calls_added++;
			}

			// Insert tool results
			for (const tool_result of message.tool_results) {
				db.insert_tool_result({
					tool_call_id: tool_result.tool_call_id,
					message_uuid: message.uuid,
					session_id: message.session_id,
					content: tool_result.content,
					is_error: tool_result.is_error,
					timestamp: message.timestamp,
				});
				result.tool_results_added++;
			}
		}

		if (file_messages_added > 0) {
			result.files_processed++;
			result.messages_added += file_messages_added;
		}

		db.set_sync_state(file_path, last_modified, last_byte_offset);
	}

	db.commit();
	db.enable_foreign_keys();

	if (files.length >= 100) {
		console.log(); // newline after progress
	}

	return result;
}

function extract_project_path(file_path: string): string {
	// Find which base dir this file belongs to
	for (const base of PROJECTS_DIRS) {
		if (file_path.startsWith(base)) {
			const rel = relative(base, file_path);
			const project_dir = rel.split('/')[0];
			if (project_dir.startsWith('-')) {
				// Decode: -home-scott-repos-foo → /home/scott/repos/foo
				// Collapse double slashes from encoded empty segments
				return (
					'/' +
					project_dir
						.slice(1)
						.replace(/-/g, '/')
						.replace(/\/\/+/g, '/')
				);
			}
			return project_dir;
		}
	}
	// Fallback: use filename
	return file_path.split('/').slice(-2, -1)[0] ?? 'unknown';
}
