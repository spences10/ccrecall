import { Database as BunDB, Statement } from 'bun:sqlite';
import { join } from 'path';

const DEFAULT_DB_PATH = join(Bun.env.HOME!, '.claude', 'cclog.db');
const SCHEMA = await Bun.file(
	join(import.meta.dir, 'schema.sql'),
).text();

export class Database {
	private db: BunDB;
	private stmt_upsert_session: Statement;
	private stmt_insert_message: Statement;
	private stmt_get_sync_state: Statement;
	private stmt_set_sync_state: Statement;

	constructor(db_path = DEFAULT_DB_PATH) {
		this.db = new BunDB(db_path);
		this.db.run('PRAGMA foreign_keys = ON');
		this.db.run(SCHEMA);

		this.stmt_upsert_session = this.db.prepare(`
			INSERT INTO sessions (id, project_path, git_branch, cwd, first_timestamp, last_timestamp, summary)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				last_timestamp = MAX(last_timestamp, excluded.last_timestamp),
				summary = COALESCE(excluded.summary, summary)
		`);

		this.stmt_insert_message = this.db.prepare(`
			INSERT OR IGNORE INTO messages (
				uuid, session_id, parent_uuid, type, model,
				content_text, content_json, thinking, timestamp,
				input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		this.stmt_get_sync_state = this.db.prepare(
			'SELECT last_modified, last_byte_offset FROM sync_state WHERE file_path = ?',
		);

		this.stmt_set_sync_state = this.db.prepare(`
			INSERT INTO sync_state (file_path, last_modified, last_byte_offset)
			VALUES (?, ?, ?)
			ON CONFLICT(file_path) DO UPDATE SET
				last_modified = excluded.last_modified,
				last_byte_offset = excluded.last_byte_offset
		`);
	}

	begin() {
		this.db.run('BEGIN TRANSACTION');
	}

	commit() {
		this.db.run('COMMIT');
	}

	upsert_session(session: {
		id: string;
		project_path: string;
		git_branch?: string;
		cwd?: string;
		timestamp: number;
		summary?: string;
	}) {
		this.stmt_upsert_session.run(
			session.id,
			session.project_path,
			session.git_branch ?? null,
			session.cwd ?? null,
			session.timestamp,
			session.timestamp,
			session.summary ?? null,
		);
	}

	insert_message(msg: {
		uuid: string;
		session_id: string;
		parent_uuid?: string;
		type: string;
		model?: string;
		content_text?: string;
		content_json?: string;
		thinking?: string;
		timestamp: number;
		input_tokens?: number;
		output_tokens?: number;
		cache_read_tokens?: number;
		cache_creation_tokens?: number;
	}) {
		this.stmt_insert_message.run(
			msg.uuid,
			msg.session_id,
			msg.parent_uuid ?? null,
			msg.type,
			msg.model ?? null,
			msg.content_text ?? null,
			msg.content_json ?? null,
			msg.thinking ?? null,
			msg.timestamp,
			msg.input_tokens ?? 0,
			msg.output_tokens ?? 0,
			msg.cache_read_tokens ?? 0,
			msg.cache_creation_tokens ?? 0,
		);
	}

	get_sync_state(
		file_path: string,
	): { last_modified: number; last_byte_offset: number } | undefined {
		return this.stmt_get_sync_state.get(file_path) as
			| { last_modified: number; last_byte_offset: number }
			| undefined;
	}

	set_sync_state(
		file_path: string,
		last_modified: number,
		last_byte_offset: number,
	) {
		this.stmt_set_sync_state.run(
			file_path,
			last_modified,
			last_byte_offset,
		);
	}

	get_stats() {
		const sessions = this.db
			.prepare('SELECT COUNT(*) as count FROM sessions')
			.get() as { count: number };
		const messages = this.db
			.prepare('SELECT COUNT(*) as count FROM messages')
			.get() as { count: number };
		const tokens = this.db
			.prepare(
				`
			SELECT
				SUM(input_tokens) as input,
				SUM(output_tokens) as output,
				SUM(cache_read_tokens) as cache_read,
				SUM(cache_creation_tokens) as cache_creation
			FROM messages
		`,
			)
			.get() as {
			input: number;
			output: number;
			cache_read: number;
			cache_creation: number;
		};

		return {
			sessions: sessions.count,
			messages: messages.count,
			tokens,
		};
	}

	close() {
		this.db.close();
	}
}
