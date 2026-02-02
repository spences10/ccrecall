import { Database as BunDB, Statement } from 'bun:sqlite';
import { existsSync, renameSync } from 'fs';
import { join } from 'path';

const DEFAULT_DB_PATH = join(Bun.env.HOME!, '.claude', 'ccrecall.db');
const LEGACY_DB_PATH = join(Bun.env.HOME!, '.claude', 'cclog.db');

function migrate_legacy_db(target_path: string) {
	if (target_path !== DEFAULT_DB_PATH) return;
	if (existsSync(target_path)) return;
	if (!existsSync(LEGACY_DB_PATH)) return;

	renameSync(LEGACY_DB_PATH, target_path);
	console.log('Migrated database: cclog.db → ccrecall.db');
}
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

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  message_uuid TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (message_uuid) REFERENCES messages(uuid),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS tool_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_call_id TEXT NOT NULL,
  message_uuid TEXT NOT NULL,
  session_id TEXT NOT NULL,
  content TEXT,
  is_error INTEGER DEFAULT 0,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (tool_call_id) REFERENCES tool_calls(id),
  FOREIGN KEY (message_uuid) REFERENCES messages(uuid),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_results_session ON tool_results(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_results_call ON tool_results(tool_call_id);

-- Team/Swarm tracking tables
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  lead_session_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (lead_session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  agent_type TEXT,
  model TEXT,
  prompt TEXT,
  color TEXT,
  cwd TEXT,
  joined_at INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS team_tasks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  owner_name TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_teams_lead_session ON teams(lead_session_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_team ON team_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_status ON team_tasks(status);
`;

export class Database {
	private db: BunDB;
	private stmt_upsert_session: Statement;
	private stmt_insert_message: Statement;
	private stmt_insert_tool_call: Statement;
	private stmt_insert_tool_result: Statement;
	private stmt_get_sync_state: Statement;
	private stmt_set_sync_state: Statement;
	private stmt_upsert_team: Statement;
	private stmt_upsert_team_member: Statement;
	private stmt_upsert_team_task: Statement;

	constructor(db_path = DEFAULT_DB_PATH) {
		migrate_legacy_db(db_path);
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

		this.stmt_insert_tool_call = this.db.prepare(`
			INSERT OR IGNORE INTO tool_calls (id, message_uuid, session_id, tool_name, tool_input, timestamp)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		this.stmt_insert_tool_result = this.db.prepare(`
			INSERT OR IGNORE INTO tool_results (tool_call_id, message_uuid, session_id, content, is_error, timestamp)
			VALUES (?, ?, ?, ?, ?, ?)
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

		this.stmt_upsert_team = this.db.prepare(`
			INSERT INTO teams (id, name, description, lead_session_id, created_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				description = COALESCE(excluded.description, description),
				lead_session_id = COALESCE(excluded.lead_session_id, lead_session_id)
		`);

		this.stmt_upsert_team_member = this.db.prepare(`
			INSERT INTO team_members (id, team_id, name, agent_type, model, prompt, color, cwd, joined_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				prompt = COALESCE(excluded.prompt, prompt),
				model = COALESCE(excluded.model, model)
		`);

		this.stmt_upsert_team_task = this.db.prepare(`
			INSERT INTO team_tasks (id, team_id, owner_name, subject, description, status, created_at, completed_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				status = excluded.status,
				owner_name = COALESCE(excluded.owner_name, owner_name),
				completed_at = COALESCE(excluded.completed_at, completed_at)
		`);
	}

	begin() {
		this.db.run('BEGIN TRANSACTION');
	}

	commit() {
		this.db.run('COMMIT');
	}

	disable_foreign_keys() {
		this.db.run('PRAGMA foreign_keys = OFF');
	}

	enable_foreign_keys() {
		this.db.run('PRAGMA foreign_keys = ON');
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

	insert_tool_call(call: {
		id: string;
		message_uuid: string;
		session_id: string;
		tool_name: string;
		tool_input: string;
		timestamp: number;
	}) {
		this.stmt_insert_tool_call.run(
			call.id,
			call.message_uuid,
			call.session_id,
			call.tool_name,
			call.tool_input,
			call.timestamp,
		);
	}

	insert_tool_result(result: {
		tool_call_id: string;
		message_uuid: string;
		session_id: string;
		content: string;
		is_error: boolean;
		timestamp: number;
	}) {
		this.stmt_insert_tool_result.run(
			result.tool_call_id,
			result.message_uuid,
			result.session_id,
			result.content,
			result.is_error ? 1 : 0,
			result.timestamp,
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

	upsert_team(team: {
		id: string;
		name: string;
		description?: string;
		lead_session_id?: string;
		created_at: number;
	}) {
		this.stmt_upsert_team.run(
			team.id,
			team.name,
			team.description ?? null,
			team.lead_session_id ?? null,
			team.created_at,
		);
	}

	upsert_team_member(member: {
		id: string;
		team_id: string;
		name: string;
		agent_type?: string;
		model?: string;
		prompt?: string;
		color?: string;
		cwd?: string;
		joined_at: number;
	}) {
		this.stmt_upsert_team_member.run(
			member.id,
			member.team_id,
			member.name,
			member.agent_type ?? null,
			member.model ?? null,
			member.prompt ?? null,
			member.color ?? null,
			member.cwd ?? null,
			member.joined_at,
		);
	}

	upsert_team_task(task: {
		id: string;
		team_id: string;
		owner_name?: string;
		subject: string;
		description?: string;
		status?: string;
		created_at?: number;
		completed_at?: number;
	}) {
		this.stmt_upsert_team_task.run(
			task.id,
			task.team_id,
			task.owner_name ?? null,
			task.subject,
			task.description ?? null,
			task.status ?? 'pending',
			task.created_at ?? null,
			task.completed_at ?? null,
		);
	}

	get_stats() {
		const sessions = this.db
			.prepare('SELECT COUNT(*) as count FROM sessions')
			.get() as { count: number };
		const messages = this.db
			.prepare('SELECT COUNT(*) as count FROM messages')
			.get() as { count: number };
		const tool_calls = this.db
			.prepare('SELECT COUNT(*) as count FROM tool_calls')
			.get() as { count: number };
		const tool_results = this.db
			.prepare('SELECT COUNT(*) as count FROM tool_results')
			.get() as { count: number };
		const teams = this.db
			.prepare('SELECT COUNT(*) as count FROM teams')
			.get() as { count: number };
		const team_members = this.db
			.prepare('SELECT COUNT(*) as count FROM team_members')
			.get() as { count: number };
		const team_tasks = this.db
			.prepare('SELECT COUNT(*) as count FROM team_tasks')
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
			tool_calls: tool_calls.count,
			tool_results: tool_results.count,
			teams: teams.count,
			team_members: team_members.count,
			team_tasks: team_tasks.count,
			tokens,
		};
	}

	reset_sync_state() {
		this.db.run('DELETE FROM sync_state');
	}

	close() {
		this.db.close();
	}
}
