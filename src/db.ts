import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_DB_PATH = join(homedir(), '.claude', 'cclog.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  git_branch TEXT,
  cwd TEXT,
  first_timestamp INTEGER,
  last_timestamp INTEGER,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_uuid TEXT,
  type TEXT NOT NULL,
  model TEXT,
  content_text TEXT,
  content_json TEXT,
  thinking TEXT,
  timestamp INTEGER NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  file_path TEXT PRIMARY KEY,
  last_modified INTEGER NOT NULL,
  last_byte_offset INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
`;

export class Database {
	private db: DatabaseSync;

	constructor(db_path = DEFAULT_DB_PATH) {
		this.db = new DatabaseSync(db_path, {
			enableForeignKeyConstraints: true,
		});
		this.db.exec(SCHEMA);
	}

	upsert_session(session: {
		id: string;
		project_path: string;
		git_branch?: string;
		cwd?: string;
		timestamp: number;
		summary?: string;
	}) {
		const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_path, git_branch, cwd, first_timestamp, last_timestamp, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_timestamp = MAX(last_timestamp, excluded.last_timestamp),
        summary = COALESCE(excluded.summary, summary)
    `);
		stmt.run(
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
		const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        uuid, session_id, parent_uuid, type, model,
        content_text, content_json, thinking, timestamp,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
		stmt.run(
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
		const stmt = this.db.prepare(
			'SELECT last_modified, last_byte_offset FROM sync_state WHERE file_path = ?',
		);
		return stmt.get(file_path) as
			| { last_modified: number; last_byte_offset: number }
			| undefined;
	}

	set_sync_state(
		file_path: string,
		last_modified: number,
		last_byte_offset: number,
	) {
		const stmt = this.db.prepare(`
      INSERT INTO sync_state (file_path, last_modified, last_byte_offset)
      VALUES (?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        last_modified = excluded.last_modified,
        last_byte_offset = excluded.last_byte_offset
    `);
		stmt.run(file_path, last_modified, last_byte_offset);
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
