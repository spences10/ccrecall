import { existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from 'vitest';
import { Database } from './db.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = join(__dirname, 'test.db');

describe('Database', () => {
	let db: Database;

	beforeEach(() => {
		if (existsSync(TEST_DB_PATH)) {
			unlinkSync(TEST_DB_PATH);
		}
		db = new Database(TEST_DB_PATH);
	});

	afterEach(() => {
		db.close();
		if (existsSync(TEST_DB_PATH)) {
			unlinkSync(TEST_DB_PATH);
		}
	});

	test('can create database', () => {
		expect(db).toBeDefined();
		expect(existsSync(TEST_DB_PATH)).toBe(true);
	});

	test('can insert and retrieve session', () => {
		db.upsert_session({
			id: 'test-session-1',
			project_path: '/test/project',
			timestamp: Date.now(),
		});

		const stats = db.get_stats();
		expect(stats.sessions).toBe(1);
	});

	test('can insert message', () => {
		db.upsert_session({
			id: 'test-session-1',
			project_path: '/test/project',
			timestamp: Date.now(),
		});

		db.insert_message({
			uuid: 'msg-1',
			session_id: 'test-session-1',
			type: 'human',
			content_text: 'Hello world',
			timestamp: Date.now(),
		});

		const stats = db.get_stats();
		expect(stats.messages).toBe(1);
	});

	describe('FTS5 Search', () => {
		beforeEach(() => {
			db.upsert_session({
				id: 'session-1',
				project_path: '/home/user/project-alpha',
				timestamp: Date.now(),
			});

			db.upsert_session({
				id: 'session-2',
				project_path: '/home/user/project-beta',
				timestamp: Date.now(),
			});

			db.insert_message({
				uuid: 'msg-1',
				session_id: 'session-1',
				type: 'human',
				content_text: 'Fix the authentication bug in the login flow',
				timestamp: Date.now() - 3000,
			});

			db.insert_message({
				uuid: 'msg-2',
				session_id: 'session-1',
				type: 'assistant',
				content_text:
					'I will investigate the authentication issue and fix the login',
				timestamp: Date.now() - 2000,
			});

			db.insert_message({
				uuid: 'msg-3',
				session_id: 'session-2',
				type: 'human',
				content_text: 'Add a new feature for user profiles',
				timestamp: Date.now() - 1000,
			});

			db.insert_message({
				uuid: 'msg-4',
				session_id: 'session-1',
				type: 'human',
				content_text:
					'Check the file Downloads/transcripts/meeting-notes.txt',
				timestamp: Date.now() - 500,
			});

			db.insert_message({
				uuid: 'msg-5',
				session_id: 'session-1',
				type: 'human',
				content_text: "don't use agents for simple tasks",
				timestamp: Date.now() - 400,
			});
		});

		test('can search for term', () => {
			const results = db.search('authentication');
			expect(results.length).toBe(2);
		});

		test('search returns snippets with highlights', () => {
			const results = db.search('authentication');
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].snippet).toContain('>>>');
			expect(results[0].snippet).toContain('<<<');
		});

		test('search returns relevance scores', () => {
			const results = db.search('authentication');
			expect(results.length).toBeGreaterThan(0);
			for (const r of results) {
				expect(typeof r.relevance).toBe('number');
				// BM25 returns negative values, lower = more relevant
				expect(r.relevance).toBeLessThanOrEqual(0);
			}
		});

		test('can filter by project', () => {
			const results = db.search('authentication', {
				project: 'project-alpha',
			});
			expect(results.length).toBe(2);

			const betaResults = db.search('feature', {
				project: 'project-beta',
			});
			expect(betaResults.length).toBe(1);
		});

		test('can limit results', () => {
			const results = db.search('authentication', {
				limit: 1,
			});
			expect(results.length).toBe(1);
		});

		test('returns empty array for no matches', () => {
			const results = db.search('nonexistentterm12345');
			expect(results).toEqual([]);
		});

		test('supports prefix search', () => {
			const results = db.search('auth*');
			expect(results.length).toBe(2);
		});

		test('supports phrase search', () => {
			const results = db.search('"authentication bug"');
			expect(results.length).toBe(1);
		});

		test('handles slash in search term', () => {
			const results = db.search('Downloads/transcripts');
			expect(results.length).toBe(1);
			expect(results[0].content_text).toContain(
				'Downloads/transcripts',
			);
		});

		test('handles hyphen in search term', () => {
			const results = db.search('meeting-notes');
			expect(results.length).toBe(1);
		});

		test('handles special chars with prefix search', () => {
			const results = db.search('Downloads/*');
			expect(results.length).toBe(1);
		});

		test('handles period in search term', () => {
			const results = db.search('meeting-notes.txt');
			expect(results.length).toBe(1);
		});

		test('handles apostrophe in search term', () => {
			const results = db.search("don't");
			expect(results.length).toBe(1);
			expect(results[0].content_text).toContain("don't");
		});

		test('can search thinking content', () => {
			db.insert_message({
				uuid: 'msg-thinking',
				session_id: 'session-1',
				type: 'assistant',
				content_text: 'Here is the solution',
				thinking:
					'The user needs help with the fibonacci sequence algorithm',
				timestamp: Date.now() - 300,
			});

			const results = db.search('fibonacci');
			expect(results.length).toBe(1);
			expect(results[0].uuid).toBe('msg-thinking');
		});

		test('content_text weighted higher than thinking', () => {
			db.insert_message({
				uuid: 'msg-content-match',
				session_id: 'session-1',
				type: 'assistant',
				content_text: 'Sorting algorithm performance comparison',
				timestamp: Date.now() - 200,
			});

			db.insert_message({
				uuid: 'msg-thinking-match',
				session_id: 'session-1',
				type: 'assistant',
				content_text: 'Here is my answer',
				thinking: 'Sorting algorithm analysis',
				timestamp: Date.now() - 100,
			});

			const results = db.search('sorting algorithm');
			expect(results.length).toBe(2);
			// Content match should rank higher (more negative BM25 score)
			expect(results[0].uuid).toBe('msg-content-match');
		});

		test('sort by time descending', () => {
			const results = db.search('authentication', {
				sort: 'time',
			});
			expect(results.length).toBe(2);
			expect(results[0].timestamp).toBeGreaterThanOrEqual(
				results[1].timestamp,
			);
		});

		test('sort by time ascending', () => {
			const results = db.search('authentication', {
				sort: 'time-asc',
			});
			expect(results.length).toBe(2);
			expect(results[0].timestamp).toBeLessThanOrEqual(
				results[1].timestamp,
			);
		});

		test('sort by relevance is default', () => {
			const default_results = db.search('authentication');
			const explicit_results = db.search('authentication', {
				sort: 'relevance',
			});
			expect(default_results.map((r) => r.uuid)).toEqual(
				explicit_results.map((r) => r.uuid),
			);
		});

		test('rebuild_fts does not throw', () => {
			expect(() => db.rebuild_fts()).not.toThrow();
		});
	});

	describe('get_messages_around', () => {
		const now = Date.now();

		beforeEach(() => {
			db.upsert_session({
				id: 'session-ctx',
				project_path: '/test/project',
				timestamp: now - 5000,
			});

			// Insert 5 messages with sequential timestamps
			for (let i = 0; i < 5; i++) {
				db.insert_message({
					uuid: `ctx-msg-${i}`,
					session_id: 'session-ctx',
					type: i % 2 === 0 ? 'human' : 'assistant',
					content_text: `Message number ${i}`,
					timestamp: now - (4 - i) * 1000, // oldest first
				});
			}

			// Another session to ensure isolation
			db.upsert_session({
				id: 'session-other',
				project_path: '/test/other',
				timestamp: now,
			});
			db.insert_message({
				uuid: 'other-msg',
				session_id: 'session-other',
				type: 'human',
				content_text: 'Other session message',
				timestamp: now - 2000,
			});
		});

		test('returns messages before and after timestamp', () => {
			// Target the middle message (index 2, timestamp = now - 2000)
			const target_ts = now - 2000;
			const ctx = db.get_messages_around('session-ctx', target_ts, 2);
			expect(ctx.before.length).toBe(2);
			expect(ctx.after.length).toBe(2);
		});

		test('before messages are in chronological order', () => {
			const target_ts = now - 2000;
			const ctx = db.get_messages_around('session-ctx', target_ts, 2);
			expect(ctx.before[0].timestamp).toBeLessThan(
				ctx.before[1].timestamp,
			);
		});

		test('after messages are in chronological order', () => {
			const target_ts = now - 2000;
			const ctx = db.get_messages_around('session-ctx', target_ts, 2);
			expect(ctx.after[0].timestamp).toBeLessThan(
				ctx.after[1].timestamp,
			);
		});

		test('respects count limit', () => {
			const target_ts = now - 2000;
			const ctx = db.get_messages_around('session-ctx', target_ts, 1);
			expect(ctx.before.length).toBe(1);
			expect(ctx.after.length).toBe(1);
		});

		test('does not include messages from other sessions', () => {
			const target_ts = now - 2000;
			const ctx = db.get_messages_around(
				'session-ctx',
				target_ts,
				10,
			);
			const all_uuids = [
				...ctx.before.map((m) => m.uuid),
				...ctx.after.map((m) => m.uuid),
			];
			expect(all_uuids).not.toContain('other-msg');
		});

		test('returns empty arrays when no context available', () => {
			const ctx = db.get_messages_around(
				'session-ctx',
				now + 9999,
				5,
			);
			expect(ctx.before.length).toBe(5); // all messages are before
			expect(ctx.after.length).toBe(0);
		});

		test('handles nonexistent session', () => {
			const ctx = db.get_messages_around('nonexistent', now, 5);
			expect(ctx.before).toEqual([]);
			expect(ctx.after).toEqual([]);
		});
	});

	describe('get_sessions', () => {
		beforeEach(() => {
			const now = Date.now();
			db.upsert_session({
				id: 'session-1',
				project_path: '/home/user/project-alpha',
				timestamp: now - 60000,
			});

			db.upsert_session({
				id: 'session-2',
				project_path: '/home/user/project-beta',
				timestamp: now,
			});

			db.insert_message({
				uuid: 'msg-1',
				session_id: 'session-1',
				type: 'human',
				content_text: 'Hello',
				timestamp: now - 60000,
				input_tokens: 100,
				output_tokens: 200,
			});

			db.insert_message({
				uuid: 'msg-2',
				session_id: 'session-1',
				type: 'assistant',
				content_text: 'Hi there',
				timestamp: now - 30000,
				input_tokens: 150,
				output_tokens: 300,
			});

			db.insert_message({
				uuid: 'msg-3',
				session_id: 'session-2',
				type: 'human',
				content_text: 'Test',
				timestamp: now,
				input_tokens: 50,
				output_tokens: 100,
			});
		});

		test('returns sessions ordered by last_timestamp desc', () => {
			const results = db.get_sessions();
			expect(results.length).toBe(2);
			expect(results[0].id).toBe('session-2');
			expect(results[1].id).toBe('session-1');
		});

		test('includes message count', () => {
			const results = db.get_sessions();
			const session1 = results.find((s) => s.id === 'session-1');
			const session2 = results.find((s) => s.id === 'session-2');
			expect(session1?.message_count).toBe(2);
			expect(session2?.message_count).toBe(1);
		});

		test('includes total tokens', () => {
			const results = db.get_sessions();
			const session1 = results.find((s) => s.id === 'session-1');
			expect(session1?.total_tokens).toBe(750); // 100+200+150+300
		});

		test('can limit results', () => {
			const results = db.get_sessions({ limit: 1 });
			expect(results.length).toBe(1);
		});

		test('can filter by project', () => {
			const results = db.get_sessions({
				project: 'project-alpha',
			});
			expect(results.length).toBe(1);
			expect(results[0].id).toBe('session-1');
		});

		test('returns empty array when no sessions', () => {
			const emptyDb = new Database(join(__dirname, 'empty.db'));
			const results = emptyDb.get_sessions();
			expect(results).toEqual([]);
			emptyDb.close();
			unlinkSync(join(__dirname, 'empty.db'));
		});
	});

	describe('get_schema', () => {
		test('returns all tables', () => {
			const result = db.get_schema();
			expect(result.tables.length).toBeGreaterThan(0);
			const names = result.tables.map((t) => t.name);
			expect(names).toContain('sessions');
			expect(names).toContain('messages');
			expect(names).toContain('tool_calls');
		});

		test('returns row counts', () => {
			db.upsert_session({
				id: 'session-1',
				project_path: '/test',
				timestamp: Date.now(),
			});
			const result = db.get_schema('sessions');
			expect(result.tables.length).toBe(1);
			expect(result.tables[0].row_count).toBe(1);
		});

		test('returns columns with types', () => {
			const result = db.get_schema('sessions');
			const cols = result.tables[0].columns;
			const id_col = cols.find((c) => c.name === 'id');
			expect(id_col).toBeDefined();
			expect(id_col?.type).toBe('TEXT');
			expect(id_col?.pk).toBe(true);
		});

		test('returns foreign keys', () => {
			const result = db.get_schema('messages');
			expect(result.tables[0].foreign_keys.length).toBeGreaterThan(0);
			const fk = result.tables[0].foreign_keys.find(
				(f) => f.from === 'session_id',
			);
			expect(fk).toBeDefined();
			expect(fk?.table).toBe('sessions');
			expect(fk?.to).toBe('id');
		});

		test('returns indexes', () => {
			const result = db.get_schema('messages');
			expect(result.tables[0].indexes.length).toBeGreaterThan(0);
		});

		test('returns empty tables array for unknown table', () => {
			const result = db.get_schema('nonexistent_table');
			expect(result.tables).toEqual([]);
		});

		test('single table filter returns only that table', () => {
			const result = db.get_schema('sessions');
			expect(result.tables.length).toBe(1);
			expect(result.tables[0].name).toBe('sessions');
		});
	});

	describe('Tool Stats', () => {
		beforeEach(() => {
			db.upsert_session({
				id: 'session-1',
				project_path: '/home/user/project-alpha',
				timestamp: Date.now(),
			});

			db.upsert_session({
				id: 'session-2',
				project_path: '/home/user/project-beta',
				timestamp: Date.now(),
			});

			db.insert_message({
				uuid: 'msg-1',
				session_id: 'session-1',
				type: 'assistant',
				timestamp: Date.now(),
			});

			db.insert_tool_call({
				id: 'tc-1',
				message_uuid: 'msg-1',
				session_id: 'session-1',
				tool_name: 'Read',
				tool_input: '{}',
				timestamp: Date.now(),
			});

			db.insert_tool_call({
				id: 'tc-2',
				message_uuid: 'msg-1',
				session_id: 'session-1',
				tool_name: 'Read',
				tool_input: '{}',
				timestamp: Date.now(),
			});

			db.insert_tool_call({
				id: 'tc-3',
				message_uuid: 'msg-1',
				session_id: 'session-1',
				tool_name: 'Bash',
				tool_input: '{}',
				timestamp: Date.now(),
			});

			db.insert_message({
				uuid: 'msg-2',
				session_id: 'session-2',
				type: 'assistant',
				timestamp: Date.now(),
			});

			db.insert_tool_call({
				id: 'tc-4',
				message_uuid: 'msg-2',
				session_id: 'session-2',
				tool_name: 'Edit',
				tool_input: '{}',
				timestamp: Date.now(),
			});
		});

		test('returns tool usage counts', () => {
			const stats = db.get_tool_stats();
			expect(stats.length).toBe(3);
			expect(stats[0].tool_name).toBe('Read');
			expect(stats[0].count).toBe(2);
		});

		test('calculates percentages', () => {
			const stats = db.get_tool_stats();
			expect(stats[0].percentage).toBe(50); // 2/4 = 50%
			expect(stats[1].percentage).toBe(25); // 1/4 = 25%
		});

		test('respects limit', () => {
			const stats = db.get_tool_stats({ limit: 2 });
			expect(stats.length).toBe(2);
		});

		test('filters by project', () => {
			const stats = db.get_tool_stats({
				project: 'project-alpha',
			});
			expect(stats.length).toBe(2);
			expect(
				stats.find((s) => s.tool_name === 'Edit'),
			).toBeUndefined();
		});

		test('returns empty array when no tool calls', () => {
			const freshDb = new Database(join(__dirname, 'empty.db'));
			const stats = freshDb.get_tool_stats();
			expect(stats).toEqual([]);
			freshDb.close();
			unlinkSync(join(__dirname, 'empty.db'));
		});
	});

	describe('node:sqlite edge cases', () => {
		test('foreign key PRAGMA toggle works during bulk insert', () => {
			db.disable_foreign_keys();
			db.begin();

			// Insert message without a matching session — should NOT throw
			// because foreign keys are disabled
			db.insert_message({
				uuid: 'orphan-msg',
				session_id: 'nonexistent-session',
				type: 'human',
				content_text: 'orphan',
				timestamp: Date.now(),
			});

			db.commit();
			db.enable_foreign_keys();

			// Verify the message was inserted
			const stats = db.get_stats();
			expect(stats.messages).toBe(1);
		});

		test('FTS5 rebuild works (defensive mode compatibility)', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});
			db.insert_message({
				uuid: 'm1',
				session_id: 's1',
				type: 'human',
				content_text: 'rebuild test content',
				timestamp: Date.now(),
			});

			// rebuild writes to FTS shadow tables — defensive mode could block this
			expect(() => db.rebuild_fts()).not.toThrow();

			// Verify search still works after rebuild
			const results = db.search('rebuild');
			expect(results.length).toBe(1);
		});

		test('null vs undefined parameter handling', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});

			// All optional fields as undefined (should be coerced to null)
			expect(() =>
				db.insert_message({
					uuid: 'null-test',
					session_id: 's1',
					type: 'human',
					timestamp: Date.now(),
					// content_text, content_json, thinking, model all undefined
				}),
			).not.toThrow();

			const stats = db.get_stats();
			expect(stats.messages).toBe(1);
		});

		test('large integer token values do not overflow', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});

			// Insert messages with large but safe token values
			const large_tokens = 2_000_000_000; // 2 billion, under MAX_SAFE_INTEGER
			db.insert_message({
				uuid: 'm1',
				session_id: 's1',
				type: 'assistant',
				timestamp: Date.now(),
				input_tokens: large_tokens,
				output_tokens: large_tokens,
			});
			db.insert_message({
				uuid: 'm2',
				session_id: 's1',
				type: 'assistant',
				timestamp: Date.now(),
				input_tokens: large_tokens,
				output_tokens: large_tokens,
			});

			// SUM of 4 billion should still be safe
			const stats = db.get_stats();
			expect(stats.tokens.input).toBe(large_tokens * 2);
			expect(stats.tokens.output).toBe(large_tokens * 2);
		});

		test('multi-statement exec works for schema creation', () => {
			// Fresh DB should have all tables from SCHEMA exec
			const schema = db.get_schema();
			const names = schema.tables.map((t) => t.name);
			expect(names).toContain('sessions');
			expect(names).toContain('messages');
			expect(names).toContain('tool_calls');
			expect(names).toContain('tool_results');
			expect(names).toContain('teams');
			expect(names).toContain('team_members');
			expect(names).toContain('team_tasks');
			expect(names).toContain('sync_state');
			expect(names).toContain('messages_fts');
		});
	});

	describe('Security', () => {
		test('SQL injection via search term is escaped', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});
			db.insert_message({
				uuid: 'm1',
				session_id: 's1',
				type: 'human',
				content_text: 'normal message',
				timestamp: Date.now(),
			});

			// FTS5 injection attempts — should not throw or return unexpected results
			const injection_terms = [
				"'; DROP TABLE messages; --",
				'" OR 1=1 --',
				'UNION SELECT * FROM sessions',
				"Robert'); DROP TABLE messages;--",
				'*:*',
				'{content_text}: test',
			];

			for (const term of injection_terms) {
				expect(() => db.search(term)).not.toThrow();
			}
		});

		test('malformed FTS5 syntax does not crash', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});

			// These are FTS5 syntax errors that escape_fts5_query should handle
			const bad_terms = [
				'(unclosed paren',
				'NOT',
				'AND OR',
				'""',
				'***',
				'^',
				'+',
			];

			for (const term of bad_terms) {
				// Should either return results or throw gracefully, never crash
				try {
					db.search(term);
				} catch (e) {
					// FTS5 syntax errors are acceptable — just don't crash the process
					expect((e as Error).message).toBeDefined();
				}
			}
		});

		test('oversized content does not crash insertion', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});

			// 10MB string
			const huge_content = 'x'.repeat(10 * 1024 * 1024);
			expect(() =>
				db.insert_message({
					uuid: 'big-msg',
					session_id: 's1',
					type: 'human',
					content_text: huge_content,
					timestamp: Date.now(),
				}),
			).not.toThrow();

			const stats = db.get_stats();
			expect(stats.messages).toBe(1);
		});

		test('path traversal in project filter is harmless', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/home/user/project',
				timestamp: Date.now(),
			});
			db.insert_message({
				uuid: 'm1',
				session_id: 's1',
				type: 'human',
				content_text: 'test message',
				timestamp: Date.now(),
			});

			// Path traversal in project filter — just a LIKE query, harmless
			const results = db.search('test', {
				project: '../../../etc/passwd',
			});
			expect(results).toEqual([]);
		});

		test('null bytes in content are handled', () => {
			db.upsert_session({
				id: 's1',
				project_path: '/test',
				timestamp: Date.now(),
			});

			expect(() =>
				db.insert_message({
					uuid: 'null-byte-msg',
					session_id: 's1',
					type: 'human',
					content_text: 'before\x00after',
					timestamp: Date.now(),
				}),
			).not.toThrow();
		});
	});

	describe('compact', () => {
		const OLD_TS = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago

		function setup_tool_data(
			db: Database,
			tool_name: string,
			tool_input: string,
			result_content: string,
			timestamp = OLD_TS,
		) {
			db.upsert_session({
				id: 'compact-session',
				project_path: '/test/project',
				timestamp,
			});
			db.insert_message({
				uuid: `msg-${tool_name}-${timestamp}`,
				session_id: 'compact-session',
				type: 'assistant',
				timestamp,
			});
			db.insert_tool_call({
				id: `tc-${tool_name}-${timestamp}`,
				message_uuid: `msg-${tool_name}-${timestamp}`,
				session_id: 'compact-session',
				tool_name,
				tool_input,
				timestamp,
			});
			db.insert_tool_result({
				tool_call_id: `tc-${tool_name}-${timestamp}`,
				message_uuid: `msg-${tool_name}-${timestamp}`,
				session_id: 'compact-session',
				content: result_content,
				is_error: false,
				timestamp,
			});
		}

		test('compacts Read tool results with file path', () => {
			const content = 'x'.repeat(500);
			setup_tool_data(
				db,
				'Read',
				'{"file_path":"/src/foo.ts"}',
				content,
			);

			const result = db.compact({
				older_than_days: 0,
				dry_run: false,
			});

			expect(result.tool_results_compacted.read).toBe(1);
			expect(result.dry_run).toBe(false);

			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Read-${OLD_TS}`) as { content: string };
			expect(row.content).toContain('[compacted:');
			expect(row.content).toContain('/src/foo.ts');
			expect(row.content).toContain('recoverable from git');
		});

		test('compacts Bash tool results by truncating', () => {
			const content = 'line1\nline2\n' + 'output '.repeat(100);
			setup_tool_data(db, 'Bash', '{"command":"ls -la"}', content);

			db.compact({ older_than_days: 0, dry_run: false });

			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Bash-${OLD_TS}`) as { content: string };
			expect(row.content).toContain('line1');
			expect(row.content).toContain('[compacted: truncated from');
			expect(row.content.length).toBeLessThan(content.length);
		});

		test('compacts Grep/Glob to size marker', () => {
			const content = '/path/a.ts\n/path/b.ts\n' + 'x'.repeat(200);
			setup_tool_data(db, 'Grep', '{"pattern":"foo"}', content);

			db.compact({ older_than_days: 0, dry_run: false });

			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Grep-${OLD_TS}`) as { content: string };
			expect(row.content).toMatch(/^\[compacted: \d+B\]$/);
		});

		test('compacts Edit/Write results but preserves tool_input', () => {
			const input =
				'{"file_path":"/src/foo.ts","old_string":"a","new_string":"b"}';
			setup_tool_data(db, 'Edit', input, 'x'.repeat(200));

			db.compact({ older_than_days: 0, dry_run: false });

			const tc_row = db['db']
				.prepare(`SELECT tool_input FROM tool_calls WHERE id = ?`)
				.get(`tc-Edit-${OLD_TS}`) as { tool_input: string };
			expect(tc_row.tool_input).toBe(input);

			const tr_row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Edit-${OLD_TS}`) as { content: string };
			expect(tr_row.content).toMatch(/^\[compacted: \d+B\]$/);
		});

		test('skips recent data', () => {
			const recent_ts = Date.now();
			setup_tool_data(
				db,
				'Read',
				'{"file_path":"/src/bar.ts"}',
				'x'.repeat(500),
				recent_ts,
			);

			const result = db.compact({
				older_than_days: 30,
				dry_run: false,
			});

			expect(result.tool_results_compacted.read).toBe(0);

			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Read-${recent_ts}`) as { content: string };
			expect(row.content).toBe('x'.repeat(500));
		});

		test('does not double-compact', () => {
			setup_tool_data(
				db,
				'Read',
				'{"file_path":"/src/foo.ts"}',
				'x'.repeat(500),
			);

			db.compact({ older_than_days: 0, dry_run: false });
			const result = db.compact({
				older_than_days: 0,
				dry_run: false,
			});

			expect(result.tool_results_compacted.read).toBe(0);
		});

		test('deletes progress messages', () => {
			db.upsert_session({
				id: 'compact-session',
				project_path: '/test/project',
				timestamp: OLD_TS,
			});
			db.insert_message({
				uuid: 'progress-1',
				session_id: 'compact-session',
				type: 'progress',
				timestamp: OLD_TS,
			});
			db.insert_message({
				uuid: 'progress-2',
				session_id: 'compact-session',
				type: 'progress',
				timestamp: OLD_TS + 1,
			});

			const result = db.compact({
				older_than_days: 0,
				dry_run: false,
			});

			expect(result.progress_messages_deleted).toBe(2);
		});

		test('preserves human/assistant messages', () => {
			db.upsert_session({
				id: 'compact-session',
				project_path: '/test/project',
				timestamp: OLD_TS,
			});
			db.insert_message({
				uuid: 'human-1',
				session_id: 'compact-session',
				type: 'human',
				content_text: 'Hello',
				timestamp: OLD_TS,
			});
			db.insert_message({
				uuid: 'assistant-1',
				session_id: 'compact-session',
				type: 'assistant',
				content_text: 'Hi there',
				timestamp: OLD_TS + 1,
			});

			db.compact({ older_than_days: 0, dry_run: false });

			const stats = db.get_stats();
			expect(stats.messages).toBe(2);
		});

		test('dry run does not mutate', () => {
			setup_tool_data(
				db,
				'Read',
				'{"file_path":"/src/foo.ts"}',
				'x'.repeat(500),
			);

			const result = db.compact({
				older_than_days: 0,
				dry_run: true,
			});

			expect(result.dry_run).toBe(true);
			expect(result.tool_results_compacted.read).toBe(1);

			// Data unchanged
			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Read-${OLD_TS}`) as { content: string };
			expect(row.content).toBe('x'.repeat(500));
		});

		test('handles missing file_path gracefully', () => {
			setup_tool_data(db, 'Read', '{}', 'x'.repeat(500));

			db.compact({ older_than_days: 0, dry_run: false });

			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Read-${OLD_TS}`) as { content: string };
			expect(row.content).toContain('unknown');
			expect(row.content).toContain('[compacted:');
		});

		test('skips small content', () => {
			setup_tool_data(
				db,
				'Read',
				'{"file_path":"/src/tiny.ts"}',
				'small',
			);

			const result = db.compact({
				older_than_days: 0,
				dry_run: false,
			});

			expect(result.tool_results_compacted.read).toBe(0);

			const row = db['db']
				.prepare(
					`SELECT content FROM tool_results WHERE tool_call_id = ?`,
				)
				.get(`tc-Read-${OLD_TS}`) as { content: string };
			expect(row.content).toBe('small');
		});
	});
});
