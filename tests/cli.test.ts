import { describe, expect, test } from 'bun:test';
import {
	main,
	stats,
	sync,
	search,
	sessions,
	query,
	tools,
	schema,
} from '../src/cli.ts';

describe('CLI', () => {
	test('main command exists and has subcommands', () => {
		expect(main).toBeDefined();
		expect((main.meta as { name: string })?.name).toBe('ccrecall');
		expect(main.subCommands).toBeDefined();
	});

	test('sync subcommand exists', () => {
		expect(sync).toBeDefined();
		expect((sync.meta as { name: string })?.name).toBe('sync');
	});

	test('stats subcommand exists', () => {
		expect(stats).toBeDefined();
		expect((stats.meta as { name: string })?.name).toBe('stats');
	});

	test('search subcommand exists', () => {
		expect(search).toBeDefined();
		expect((search.meta as { name: string })?.name).toBe('search');
	});

	test('main command has --db option', () => {
		const args = main.args as Record<string, { type: string }>;
		expect(args?.db).toBeDefined();
		expect(args?.db.type).toBe('string');
	});

	test('sync command has --verbose option', () => {
		const args = sync.args as Record<string, { type: string }>;
		expect(args?.verbose).toBeDefined();
		expect(args?.verbose.type).toBe('boolean');
	});

	test('sync command has --db option', () => {
		const args = sync.args as Record<string, { type: string }>;
		expect(args?.db).toBeDefined();
		expect(args?.db.type).toBe('string');
	});

	test('stats command has --db option', () => {
		const args = stats.args as Record<string, { type: string }>;
		expect(args?.db).toBeDefined();
		expect(args?.db.type).toBe('string');
	});

	test('search command has positional term argument', () => {
		const args = search.args as Record<
			string,
			{ type: string; required?: boolean }
		>;
		expect(args?._).toBeDefined();
		expect(args?._.type).toBe('positional');
		expect(args?._.required).toBe(true);
	});

	test('search command has --limit option', () => {
		const args = search.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.limit).toBeDefined();
		expect(args?.limit.type).toBe('string');
		expect(args?.limit.alias).toBe('l');
	});

	test('search command has --project option', () => {
		const args = search.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.project).toBeDefined();
		expect(args?.project.type).toBe('string');
		expect(args?.project.alias).toBe('p');
	});

	test('search command has --rebuild option', () => {
		const args = search.args as Record<string, { type: string }>;
		expect(args?.rebuild).toBeDefined();
		expect(args?.rebuild.type).toBe('boolean');
	});

	test('main command includes search in subcommands', () => {
		const subCommands = main.subCommands as Record<string, unknown>;
		expect(subCommands?.search).toBeDefined();
	});

	test('sessions subcommand exists', () => {
		expect(sessions).toBeDefined();
		expect((sessions.meta as { name: string })?.name).toBe(
			'sessions',
		);
	});

	test('sessions command has --limit option', () => {
		const args = sessions.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.limit).toBeDefined();
		expect(args?.limit.type).toBe('string');
		expect(args?.limit.alias).toBe('l');
	});

	test('sessions command has --project option', () => {
		const args = sessions.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.project).toBeDefined();
		expect(args?.project.type).toBe('string');
		expect(args?.project.alias).toBe('p');
	});

	test('sessions command has --format option', () => {
		const args = sessions.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.format).toBeDefined();
		expect(args?.format.type).toBe('string');
		expect(args?.format.alias).toBe('f');
	});

	test('sessions command has --db option', () => {
		const args = sessions.args as Record<string, { type: string }>;
		expect(args?.db).toBeDefined();
		expect(args?.db.type).toBe('string');
	});

	test('main command includes sessions in subcommands', () => {
		const subCommands = main.subCommands as Record<string, unknown>;
		expect(subCommands?.sessions).toBeDefined();
	});

	test('query subcommand exists', () => {
		expect(query).toBeDefined();
		expect((query.meta as { name: string })?.name).toBe('query');
	});

	test('query command has positional sql argument', () => {
		const args = query.args as Record<
			string,
			{ type: string; required?: boolean }
		>;
		expect(args?.sql).toBeDefined();
		expect(args?.sql.type).toBe('positional');
		expect(args?.sql.required).toBe(true);
	});

	test('query command has --format option', () => {
		const args = query.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.format).toBeDefined();
		expect(args?.format.type).toBe('string');
		expect(args?.format.alias).toBe('f');
	});

	test('query command has --limit option', () => {
		const args = query.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.limit).toBeDefined();
		expect(args?.limit.type).toBe('string');
		expect(args?.limit.alias).toBe('l');
	});

	test('query command has --db option', () => {
		const args = query.args as Record<string, { type: string }>;
		expect(args?.db).toBeDefined();
		expect(args?.db.type).toBe('string');
	});

	test('query command has --wide option', () => {
		const args = query.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.wide).toBeDefined();
		expect(args?.wide.type).toBe('boolean');
		expect(args?.wide.alias).toBe('w');
	});

	test('main command includes query in subcommands', () => {
		const subCommands = main.subCommands as Record<string, unknown>;
		expect(subCommands?.query).toBeDefined();
	});

	test('tools subcommand exists', () => {
		expect(tools).toBeDefined();
		expect((tools.meta as { name: string })?.name).toBe('tools');
	});

	test('tools command has --top option', () => {
		const args = tools.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.top).toBeDefined();
		expect(args?.top.type).toBe('string');
		expect(args?.top.alias).toBe('t');
	});

	test('tools command has --project option', () => {
		const args = tools.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.project).toBeDefined();
		expect(args?.project.type).toBe('string');
		expect(args?.project.alias).toBe('p');
	});

	test('tools command has --format option', () => {
		const args = tools.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.format).toBeDefined();
		expect(args?.format.type).toBe('string');
		expect(args?.format.alias).toBe('f');
	});

	test('main command includes tools in subcommands', () => {
		const subCommands = main.subCommands as Record<string, unknown>;
		expect(subCommands?.tools).toBeDefined();
	});

	test('schema subcommand exists', () => {
		expect(schema).toBeDefined();
		expect((schema.meta as { name: string })?.name).toBe('schema');
	});

	test('schema command has optional positional table argument', () => {
		const args = schema.args as Record<
			string,
			{ type: string; required?: boolean }
		>;
		expect(args?.table).toBeDefined();
		expect(args?.table.type).toBe('positional');
		expect(args?.table.required).toBe(false);
	});

	test('schema command has --format option', () => {
		const args = schema.args as Record<
			string,
			{ type: string; alias?: string }
		>;
		expect(args?.format).toBeDefined();
		expect(args?.format.type).toBe('string');
		expect(args?.format.alias).toBe('f');
	});

	test('schema command has --db option', () => {
		const args = schema.args as Record<string, { type: string }>;
		expect(args?.db).toBeDefined();
		expect(args?.db.type).toBe('string');
	});

	test('main command includes schema in subcommands', () => {
		const subCommands = main.subCommands as Record<string, unknown>;
		expect(subCommands?.schema).toBeDefined();
	});
});
