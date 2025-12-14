import { join, relative } from 'path';
import { Database } from './db.ts';
import { parse_file } from './parser.ts';

const CLAUDE_DIR = join(Bun.env.HOME!, '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

export interface SyncResult {
	files_scanned: number;
	files_processed: number;
	messages_added: number;
	sessions_added: number;
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
	};

	const glob = new Bun.Glob('**/*.jsonl');
	const files: string[] = [];
	for await (const file of glob.scan({
		cwd: PROJECTS_DIR,
		absolute: true,
	})) {
		files.push(file);
	}

	result.files_scanned = files.length;
	console.log(`Found ${files.length} transcript files`);

	const seen_sessions = new Set<string>();
	let file_idx = 0;

	db.begin();

	for (const file_path of files) {
		file_idx++;
		if (file_idx % 100 === 0) {
			process.stdout.write(
				`\r  Progress: ${file_idx}/${files.length}`,
			);
		}
		const file = Bun.file(file_path);
		const last_modified = file.lastModified;

		const sync_state = db.get_sync_state(file_path);

		// Skip if file hasn't changed
		if (sync_state && sync_state.last_modified >= last_modified) {
			continue;
		}

		const start_offset = sync_state?.last_byte_offset ?? 0;
		const project_path = extract_project_path(file_path);

		if (verbose) {
			console.log(`Processing: ${relative(PROJECTS_DIR, file_path)}`);
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
		}

		if (file_messages_added > 0) {
			result.files_processed++;
			result.messages_added += file_messages_added;
		}

		db.set_sync_state(file_path, last_modified, last_byte_offset);
	}

	db.commit();

	if (files.length >= 100) {
		console.log(); // newline after progress
	}

	return result;
}

function extract_project_path(file_path: string): string {
	const rel = relative(PROJECTS_DIR, file_path);
	const project_dir = rel.split('/')[0];

	if (project_dir.startsWith('-')) {
		return project_dir.slice(1).replace(/-/g, '/');
	}

	return project_dir;
}
