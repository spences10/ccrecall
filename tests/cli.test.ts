import { describe, expect, test } from 'bun:test';
import { main, stats, sync } from '../src/cli.ts';

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
});
