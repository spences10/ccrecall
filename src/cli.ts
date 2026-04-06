import { defineCommand } from 'citty';
import { join } from 'node:path';

const DEFAULT_DB_PATH = join(
	process.env.HOME!,
	'.claude',
	'ccrecall.db',
);

/** Convert unix ms timestamp to ISO string */
function iso(ts: number): string {
	return new Date(ts).toISOString();
}

const sharedArgs = {
	db: {
		type: 'string' as const,
		alias: 'd',
		description: `Database path (default: ${DEFAULT_DB_PATH})`,
	},
	json: {
		type: 'boolean' as const,
		description: 'Output as JSON (for LLM/programmatic use)',
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
			if (!args.json) console.log('Syncing transcripts...');
			const result = await syncTranscripts(db, args.verbose);
			if (!args.json) console.log('Syncing teams...');
			const team_result = await sync_teams(db, args.verbose);

			if (args.json) {
				console.log(JSON.stringify({ ...result, ...team_result }));
				return;
			}

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

			if (args.json) {
				console.log(JSON.stringify({ db_path, ...s }));
				return;
			}

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
		wide: {
			type: 'boolean',
			alias: 'w',
			description: 'Disable column truncation',
		},
	},
	async run({ args }) {
		const { DatabaseSync } = await import('node:sqlite');
		const { existsSync } = await import('node:fs');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		if (!existsSync(db_path)) {
			console.error(`Database not found: ${db_path}`);
			process.exit(1);
		}

		const db = new DatabaseSync(db_path, { readOnly: true });

		try {
			let sql = args.sql;
			const format = args.json ? 'json' : (args.format ?? 'table');

			// Add LIMIT if specified and not already present
			if (args.limit && !/\bLIMIT\b/i.test(sql)) {
				sql = `${sql.replace(/;?\s*$/, '')} LIMIT ${parseInt(args.limit, 10)}`;
			}

			const rows = db.prepare(sql).all() as Record<string, unknown>[];

			if (rows.length === 0) {
				if (args.json) {
					console.log('[]');
				} else {
					console.log('No results.');
				}
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
						const s =
							typeof v === 'object'
								? JSON.stringify(v)
								: String(v as string | number | boolean);
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
				const termWidth = process.stdout.columns || 120;
				const maxColWidth = args.wide
					? Infinity
					: Math.max(
							50,
							Math.floor(termWidth / Math.max(columns.length, 1)),
						);

				const widths = columns.map((c) =>
					Math.min(
						maxColWidth,
						Math.max(
							c.length,
							...rows.map(
								(r) =>
									String((r[c] as string | number | null) ?? '')
										.length,
							),
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
							String((row[c] as string | number | null) ?? '')
								.slice(0, maxColWidth)
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
				if (args.json) {
					console.log('[]');
				} else {
					console.log('No tool usage data found.');
				}
				return;
			}

			if (args.json || args.format === 'json') {
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
			console.log(
				`${'-'.repeat(maxNameLen)}  ${'-'.repeat(maxCountLen)}  ------`,
			);

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
		_: {
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
		context: {
			type: 'string',
			alias: 'c',
			description:
				'Show N messages before/after each match (default: 0)',
		},
		rebuild: {
			type: 'boolean',
			description: 'Rebuild FTS index before searching',
		},
		sort: {
			type: 'string',
			alias: 's',
			description: 'Sort order: relevance (default), time, time-asc',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			if (args.rebuild) {
				if (!args.json) console.log('Rebuilding FTS index...');
				db.rebuild_fts();
			}

			const raw_term = args._ as string | string[];
			const term = Array.isArray(raw_term)
				? raw_term.join(' ')
				: raw_term;
			if (!term) {
				if (args.json) {
					console.log('[]');
				} else {
					console.log('No search term provided.');
				}
				return;
			}

			const sort_val = args.sort as
				| 'relevance'
				| 'time'
				| 'time-asc'
				| undefined;
			const results = db.search(term, {
				limit: args.limit ? parseInt(args.limit, 10) : undefined,
				project: args.project,
				sort: sort_val,
			});

			if (results.length === 0) {
				if (args.json) {
					console.log('[]');
				} else {
					console.log('No matches found.');
				}
				return;
			}

			const context_count = args.context
				? parseInt(args.context, 10)
				: 0;

			// JSON output
			if (args.json) {
				const json_results = results.map((r) => {
					const base = {
						uuid: r.uuid,
						session_id: r.session_id,
						project_path: r.project_path,
						content_text: r.content_text,
						timestamp: r.timestamp,
						date: iso(r.timestamp),
						relevance: r.relevance,
					};
					if (context_count > 0) {
						const ctx = db.get_context_around(
							r.session_id,
							r.timestamp,
							context_count,
						);
						return {
							...base,
							context: {
								before: ctx.before.map((m) => ({
									type: m.type,
									content_text: m.content_text,
									date: iso(m.timestamp),
								})),
								after: ctx.after.map((m) => ({
									type: m.type,
									content_text: m.content_text,
									date: iso(m.timestamp),
								})),
							},
						};
					}
					return base;
				});
				console.log(JSON.stringify(json_results, null, 2));
				return;
			}

			// Human output
			// Group results by session
			const grouped = new Map<
				string,
				{
					project_path: string;
					first_timestamp: number;
					matches: typeof results;
				}
			>();

			for (const r of results) {
				let group = grouped.get(r.session_id);
				if (!group) {
					group = {
						project_path: r.project_path,
						first_timestamp: r.timestamp,
						matches: [],
					};
					grouped.set(r.session_id, group);
				}
				group.matches.push(r);
				if (r.timestamp < group.first_timestamp) {
					group.first_timestamp = r.timestamp;
				}
			}

			console.log(
				`Found ${results.length} matches across ${grouped.size} session(s):\n`,
			);

			for (const [session_id, group] of grouped) {
				const date = new Date(group.first_timestamp)
					.toISOString()
					.split('T')[0];
				const project = group.project_path
					.split('/')
					.slice(-2)
					.join('/');
				console.log(
					`--- ${session_id.slice(0, 8)} | ${date} | ${project} (${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}) ---`,
				);

				for (const r of group.matches) {
					const score = r.relevance.toFixed(2);
					const snippet = (r.snippet ?? '').replace(/\n/g, ' ');
					console.log(`  [${score}] ${snippet}`);

					if (context_count > 0) {
						const ctx = db.get_messages_around(
							r.session_id,
							r.timestamp,
							context_count,
						);

						for (const m of ctx.before) {
							const preview = (m.content_text ?? '')
								.replace(/\n/g, ' ')
								.slice(0, 80);
							console.log(
								`    [${m.type}] ${preview}${preview.length >= 80 ? '...' : ''}`,
							);
						}

						console.log(`    >>> match <<<`);

						for (const m of ctx.after) {
							const preview = (m.content_text ?? '')
								.replace(/\n/g, ' ')
								.slice(0, 80);
							console.log(
								`    [${m.type}] ${preview}${preview.length >= 80 ? '...' : ''}`,
							);
						}
					}
				}
				console.log();
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
				if (args.json) {
					console.log('[]');
				} else {
					console.log('No sessions found.');
				}
				return;
			}

			if (args.json || args.format === 'json') {
				const enriched = results.map((s) => ({
					...s,
					first_date: iso(s.first_timestamp),
					last_date: iso(s.last_timestamp),
				}));
				console.log(JSON.stringify(enriched, null, 2));
				return;
			}

			// Table format
			console.log(
				'ID       | Date       | Project                          | Msgs | Tokens    | Duration',
			);
			console.log(
				'---------|------------|----------------------------------|------|-----------|----------',
			);

			for (const s of results) {
				const id = s.id.slice(0, 8);
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
					`${id} | ${date} | ${project} | ${msgs} | ${tokens} | ${duration.padStart(8)}`,
				);
			}
		} finally {
			db.close();
		}
	},
});

export const recall = defineCommand({
	meta: {
		name: 'recall',
		description:
			'Recall context from past sessions (LLM-optimised, always JSON)',
	},
	args: {
		...sharedArgs,
		_: {
			type: 'positional' as const,
			description: 'Search term',
			required: true,
		},
		limit: {
			type: 'string',
			alias: 'l',
			description: 'Maximum matches (default: 5)',
		},
		context: {
			type: 'string',
			alias: 'c',
			description: 'Messages before/after each match (default: 2)',
		},
		project: {
			type: 'string',
			alias: 'p',
			description: 'Filter by project path',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			const raw_term = args._ as string | string[];
			const term = Array.isArray(raw_term)
				? raw_term.join(' ')
				: raw_term;
			if (!term) {
				console.log(JSON.stringify({ matches: [], term: '' }));
				return;
			}

			const limit = args.limit ? parseInt(args.limit, 10) : 5;
			const context_count = args.context
				? parseInt(args.context, 10)
				: 2;

			const results = db.search(term, {
				limit,
				project: args.project,
			});

			const matches = results.map((r) => {
				const ctx = db.get_context_around(
					r.session_id,
					r.timestamp,
					context_count,
				);

				return {
					session_id: r.session_id,
					project_path: r.project_path,
					date: iso(r.timestamp),
					relevance: r.relevance,
					match: {
						uuid: r.uuid,
						content_text: r.content_text,
						timestamp: r.timestamp,
					},
					before: ctx.before.map((m) => ({
						type: m.type,
						content_text: m.content_text,
						date: iso(m.timestamp),
					})),
					after: ctx.after.map((m) => ({
						type: m.type,
						content_text: m.content_text,
						date: iso(m.timestamp),
					})),
				};
			});

			console.log(
				JSON.stringify(
					{ term, total: matches.length, matches },
					null,
					2,
				),
			);
		} finally {
			db.close();
		}
	},
});

export const compact = defineCommand({
	meta: {
		name: 'compact',
		description:
			'Compact old tool results and progress messages to save space',
	},
	args: {
		...sharedArgs,
		'older-than': {
			type: 'string' as const,
			description:
				'Only compact data older than N days (default: 30)',
		},
		'dry-run': {
			type: 'boolean' as const,
			description:
				'Show what would be compacted without changing anything',
		},
	},
	async run({ args }) {
		const { Database } = await import('./db.ts');

		const db_path = args.db ?? DEFAULT_DB_PATH;
		const db = new Database(db_path);

		try {
			const older_than_days = args['older-than']
				? parseInt(args['older-than'] as string, 10)
				: 30;
			const dry_run = (args['dry-run'] as boolean) ?? false;

			if (!args.json && !dry_run) {
				console.log(
					`Compacting data older than ${older_than_days} days...`,
				);
			}

			const result = db.compact({ older_than_days, dry_run });

			if (args.json) {
				console.log(JSON.stringify(result, null, 2));
				return;
			}

			const total_compacted =
				result.tool_results_compacted.read +
				result.tool_results_compacted.bash +
				result.tool_results_compacted.grep_glob +
				result.tool_results_compacted.edit_write;

			const fmt_bytes = (b: number) => {
				if (b >= 1073741824)
					return `${(b / 1073741824).toFixed(1)} GB`;
				if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
				if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
				return `${b} B`;
			};

			const saved = result.bytes_before - result.bytes_after;

			console.log(`
${result.dry_run ? '[DRY RUN] ' : ''}Compact results (cutoff: ${result.cutoff_date}):
  Tool results compacted: ${total_compacted}
    Read:       ${result.tool_results_compacted.read}
    Bash:       ${result.tool_results_compacted.bash}
    Grep/Glob:  ${result.tool_results_compacted.grep_glob}
    Edit/Write: ${result.tool_results_compacted.edit_write}
  Progress messages deleted: ${result.progress_messages_deleted}
  Database size: ${fmt_bytes(result.bytes_before)} → ${fmt_bytes(result.bytes_after)} (saved ${fmt_bytes(saved)})
`);
		} finally {
			db.close();
		}
	},
});

export const schema = defineCommand({
	meta: {
		name: 'schema',
		description: 'Show database table structure',
	},
	args: {
		...sharedArgs,
		table: {
			type: 'positional' as const,
			description: 'Table name (omit to list all tables)',
			required: false,
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
			const result = db.get_schema(args.table as string | undefined);

			if (result.tables.length === 0) {
				if (args.json) {
					console.log('{"tables":[]}');
				} else if (args.table) {
					console.log(`Table not found: ${args.table}`);
				} else {
					console.log('No tables found.');
				}
				return;
			}

			if (args.json || args.format === 'json') {
				console.log(JSON.stringify(result.tables, null, 2));
				return;
			}

			if (!args.table) {
				// List all tables
				const maxNameLen = Math.max(
					5,
					...result.tables.map((t) => t.name.length),
				);
				const maxTypeLen = Math.max(
					4,
					...result.tables.map((t) => t.type.length),
				);

				console.log(
					`${'Table'.padEnd(maxNameLen)}  ${'Type'.padEnd(maxTypeLen)}  Rows`,
				);
				console.log(
					`${'-'.repeat(maxNameLen)}  ${'-'.repeat(maxTypeLen)}  --------`,
				);

				for (const t of result.tables) {
					console.log(
						`${t.name.padEnd(maxNameLen)}  ${t.type.padEnd(maxTypeLen)}  ${t.row_count.toLocaleString().padStart(8)}`,
					);
				}
				return;
			}

			// Detailed single-table view
			const t = result.tables[0];
			console.log(
				`\nTable: ${t.name} (${t.row_count.toLocaleString()} rows)\n`,
			);

			// Columns
			const maxColLen = Math.max(
				6,
				...t.columns.map((c) => c.name.length),
			);
			const maxTypeLen = Math.max(
				4,
				...t.columns.map((c) => c.type.length),
			);

			console.log(
				`${'Column'.padEnd(maxColLen)}  ${'Type'.padEnd(maxTypeLen)}  Null  PK  Default`,
			);
			console.log(
				`${'-'.repeat(maxColLen)}  ${'-'.repeat(maxTypeLen)}  ----  --  -------`,
			);

			for (const c of t.columns) {
				const nullable = c.notnull ? 'NO' : 'YES';
				const pk = c.pk ? '*' : '';
				const def =
					c.default_value !== null
						? String(c.default_value as string | number)
						: '';
				console.log(
					`${c.name.padEnd(maxColLen)}  ${c.type.padEnd(maxTypeLen)}  ${nullable.padEnd(4)}  ${pk.padEnd(2)}  ${def}`,
				);
			}

			// Foreign keys
			if (t.foreign_keys.length > 0) {
				console.log(`\nForeign Keys:`);
				for (const fk of t.foreign_keys) {
					console.log(`  ${fk.from} → ${fk.table}(${fk.to})`);
				}
			}

			// Indexes
			if (t.indexes.length > 0) {
				console.log(`\nIndexes:`);
				for (const idx of t.indexes) {
					console.log(`  ${idx.name}`);
				}
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
		json: {
			type: 'boolean',
			description: 'Output as JSON (for LLM/programmatic use)',
		},
	},
	subCommands: {
		sync,
		stats,
		search,
		sessions,
		query,
		tools,
		recall,
		schema,
		compact,
	},
});
