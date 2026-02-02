import { defineCommand } from 'citty';
import { join } from 'path';

const DEFAULT_DB_PATH = join(Bun.env.HOME!, '.claude', 'ccrecall.db');

const sharedArgs = {
	db: {
		type: 'string' as const,
		alias: 'd',
		description: `Database path (default: ${DEFAULT_DB_PATH})`,
	},
};

export const sync = defineCommand({
	meta: {
		name: 'sync',
		description: 'Sync Claude Code transcripts to database',
	},
	args: {
		...sharedArgs,
		verbose: {
			type: 'boolean',
			alias: 'v',
			description: 'Show detailed output',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');
		const { sync: syncTranscripts } = await import('./sync.ts');
		const { sync_teams } = await import('./sync-teams.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			console.log('Syncing transcripts...');
			const result = await syncTranscripts(db, args.verbose);
			console.log('Syncing teams...');
			const team_result = await sync_teams(db, args.verbose);
			console.log(`
Done!
  Files scanned:    ${result.files_scanned}
  Files processed:  ${result.files_processed}
  Messages added:   ${result.messages_added}
  Sessions found:   ${result.sessions_added}
  Tool calls:       ${result.tool_calls_added}
  Tool results:     ${result.tool_results_added}
  Teams synced:     ${team_result.teams_synced}
  Team members:     ${team_result.members_synced}
  Team tasks:       ${team_result.tasks_synced}
`);
		} finally {
			db.close();
		}
	},
});

export const stats = defineCommand({
	meta: {
		name: 'stats',
		description: 'Show database statistics',
	},
	args: {
		...sharedArgs,
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			const s = db.get_stats();
			console.log(`
Database: ${db_path}
  Sessions:     ${s.sessions}
  Messages:     ${s.messages}
  Tool calls:   ${s.tool_calls}
  Tool results: ${s.tool_results}
  Teams:        ${s.teams}
  Team members: ${s.team_members}
  Team tasks:   ${s.team_tasks}
  Tokens:
    Input:          ${s.tokens.input?.toLocaleString() ?? 0}
    Output:         ${s.tokens.output?.toLocaleString() ?? 0}
    Cache read:     ${s.tokens.cache_read?.toLocaleString() ?? 0}
    Cache creation: ${s.tokens.cache_creation?.toLocaleString() ?? 0}
`);
		} finally {
			db.close();
		}
	},
});

export const main = defineCommand({
	meta: {
		name: 'ccrecall',
		version: '0.0.3',
		description:
			'Sync Claude Code transcripts to SQLite and recall context from past sessions',
	},
	args: {
		db: {
			type: 'string',
			alias: 'd',
			description: `Database path (default: ${DEFAULT_DB_PATH})`,
		},
	},
	subCommands: {
		sync,
		stats,
	},
});
