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

export const query = defineCommand({
	meta: {
		name: 'query',
		description: 'Execute raw SQL against the database',
	},
	args: {
		...sharedArgs,
		sql: {
			type: 'positional' as const,
			description: 'SQL query to execute',
			required: true,
		},
		format: {
			type: 'string',
			alias: 'f',
			description: 'Output format: table, json, csv (default: table)',
		},
		limit: {
			type: 'string',
			alias: 'l',
			description: 'Limit rows (appends LIMIT clause if not present)',
		},
	},
	async run({ args }) {
		const { Database: BunDB } = await import('bun:sqlite');
		const { existsSync } = await import('fs');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		if (!existsSync(db_path)) {
			console.error(`Database not found: ${db_path}`);
			process.exit(1);
		}

		const db = new BunDB(db_path, { readonly: true });

		try {
			let sql = args.sql;
			const format = args.format ?? 'table';

			// Add LIMIT if specified and not already present
			if (args.limit && !/\bLIMIT\b/i.test(sql)) {
				sql = `${sql.replace(/;?\s*$/, '')} LIMIT ${parseInt(args.limit, 10)}`;
			}

			const rows = db.prepare(sql).all() as Record<string, unknown>[];

			if (rows.length === 0) {
				console.log('No results.');
				return;
			}

			const columns = Object.keys(rows[0]);

			if (format === 'json') {
				console.log(JSON.stringify(rows, null, 2));
			} else if (format === 'csv') {
				console.log(columns.join(','));
				for (const row of rows) {
					const values = columns.map((c) => {
						const v = row[c];
						if (v === null) return '';
						const s = String(v);
						return s.includes(',') ||
							s.includes('"') ||
							s.includes('\n')
							? `"${s.replace(/"/g, '""')}"`
							: s;
					});
					console.log(values.join(','));
				}
			} else {
				// table format
				const widths = columns.map((c) =>
					Math.max(
						c.length,
						...rows.map(
							(r) => String(r[c] ?? '').slice(0, 50).length,
						),
					),
				);

				const header = columns
					.map((c, i) => c.padEnd(widths[i]))
					.join(' | ');
				const sep = widths.map((w) => '-'.repeat(w)).join('-+-');

				console.log(header);
				console.log(sep);
				for (const row of rows) {
					const line = columns
						.map((c, i) =>
							String(row[c] ?? '')
								.slice(0, 50)
								.padEnd(widths[i]),
						)
						.join(' | ');
					console.log(line);
				}
				console.log(`\n${rows.length} row(s)`);
			}
		} catch (err) {
			console.error('SQL error:', (err as Error).message);
			process.exit(1);
		} finally {
			db.close();
		}
	},
});

export const tools = defineCommand({
	meta: {
		name: 'tools',
		description: 'Show most-used tools',
	},
	args: {
		...sharedArgs,
		top: {
			type: 'string',
			alias: 't',
			description: 'Number of tools to show (default: 10)',
		},
		project: {
			type: 'string',
			alias: 'p',
			description: 'Filter by project path',
		},
		format: {
			type: 'string',
			alias: 'f',
			description: 'Output format: table, json (default: table)',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			const results = db.get_tool_stats({
				limit: args.top ? parseInt(args.top, 10) : undefined,
				project: args.project,
			});

			if (results.length === 0) {
				console.log('No tool usage data found.');
				return;
			}

			if (args.format === 'json') {
				console.log(JSON.stringify(results, null, 2));
				return;
			}

			const maxNameLen = Math.max(
				4,
				...results.map((r) => r.tool_name.length),
			);
			const maxCountLen = Math.max(
				5,
				...results.map((r) => r.count.toString().length),
			);

			console.log(
				`${'Tool'.padEnd(maxNameLen)}  ${'Count'.padStart(maxCountLen)}  %`,
			);
			console.log(`${'-'.repeat(maxNameLen)}  ${'-'.repeat(maxCountLen)}  ------`);

			for (const r of results) {
				console.log(
					`${r.tool_name.padEnd(maxNameLen)}  ${r.count.toString().padStart(maxCountLen)}  ${r.percentage.toFixed(1).padStart(5)}%`,
				);
			}
		} finally {
			db.close();
		}
	},
});

export const search = defineCommand({
	meta: {
		name: 'search',
		description: 'Full-text search across messages',
	},
	args: {
		...sharedArgs,
		term: {
			type: 'positional' as const,
			description:
				'Search term (supports FTS5 syntax: AND, OR, NOT, "phrase", prefix*)',
			required: true,
		},
		limit: {
			type: 'string',
			alias: 'l',
			description: 'Maximum results (default: 20)',
		},
		project: {
			type: 'string',
			alias: 'p',
			description: 'Filter by project path',
		},
		rebuild: {
			type: 'boolean',
			description: 'Rebuild FTS index before searching',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			if (args.rebuild) {
				console.log('Rebuilding FTS index...');
				db.rebuild_fts();
			}

			const results = db.search(args.term, {
				limit: args.limit ? parseInt(args.limit, 10) : undefined,
				project: args.project,
			});

			if (results.length === 0) {
				console.log('No matches found.');
				return;
			}

			console.log(`Found ${results.length} matches:\n`);

			for (const r of results) {
				const date = new Date(r.timestamp)
					.toISOString()
					.split('T')[0];
				const project = r.project_path.split('/').slice(-2).join('/');
				console.log(`[${date}] ${project}`);
				console.log(`  ${r.snippet.replace(/\n/g, ' ')}`);
				console.log(`  session: ${r.session_id.slice(0, 8)}...\n`);
			}
		} finally {
			db.close();
		}
	},
});

export const sessions = defineCommand({
	meta: {
		name: 'sessions',
		description: 'List recent sessions',
	},
	args: {
		...sharedArgs,
		limit: {
			type: 'string',
			alias: 'l',
			description: 'Maximum sessions to show (default: 10)',
		},
		project: {
			type: 'string',
			alias: 'p',
			description: 'Filter by project path',
		},
		format: {
			type: 'string',
			alias: 'f',
			description: 'Output format: table or json (default: table)',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			const results = db.get_sessions({
				limit: args.limit ? parseInt(args.limit, 10) : undefined,
				project: args.project,
			});

			if (results.length === 0) {
				console.log('No sessions found.');
				return;
			}

			if (args.format === 'json') {
				console.log(JSON.stringify(results, null, 2));
				return;
			}

			// Table format
			console.log(
				'Date       | Project                          | Msgs | Tokens    | Duration',
			);
			console.log(
				'-----------|----------------------------------|------|-----------|----------',
			);

			for (const s of results) {
				const date = new Date(s.first_timestamp)
					.toISOString()
					.split('T')[0];
				const project = s.project_path
					.split('/')
					.slice(-2)
					.join('/')
					.padEnd(32)
					.slice(0, 32);
				const msgs = String(s.message_count).padStart(4);
				const tokens = s.total_tokens.toLocaleString().padStart(9);
				const duration =
					s.duration_mins > 0 ? `${s.duration_mins}m` : '<1m';
				console.log(
					`${date} | ${project} | ${msgs} | ${tokens} | ${duration.padStart(8)}`,
				);
			}
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
		search,
		sessions,
		query,
		tools,
	},
});
