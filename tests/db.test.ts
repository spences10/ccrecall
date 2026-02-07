import {
	describe,
	expect,
	test,
	beforeEach,
	afterEach,
} from 'bun:test';
import { Database } from '../src/db.ts';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_DB_PATH = join(import.meta.dir, 'test.db');

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
			const results = db.search('authentication', { limit: 1 });
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

		test('rebuild_fts does not throw', () => {
			expect(() => db.rebuild_fts()).not.toThrow();
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
			const results = db.get_sessions({ project: 'project-alpha' });
			expect(results.length).toBe(1);
			expect(results[0].id).toBe('session-1');
		});

		test('returns empty array when no sessions', () => {
			const emptyDb = new Database(join(import.meta.dir, 'empty.db'));
			const results = emptyDb.get_sessions();
			expect(results).toEqual([]);
			emptyDb.close();
			unlinkSync(join(import.meta.dir, 'empty.db'));
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
			const stats = db.get_tool_stats({ project: 'project-alpha' });
			expect(stats.length).toBe(2);
			expect(
				stats.find((s) => s.tool_name === 'Edit'),
			).toBeUndefined();
		});

		test('returns empty array when no tool calls', () => {
			const freshDb = new Database(join(import.meta.dir, 'empty.db'));
			const stats = freshDb.get_tool_stats();
			expect(stats).toEqual([]);
			freshDb.close();
			unlinkSync(join(import.meta.dir, 'empty.db'));
		});
	});
});
