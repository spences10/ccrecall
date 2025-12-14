#!/usr/bin/env bun

import { join } from 'path';
import { parseArgs } from 'util';
import { Database } from './db.ts';
import { sync } from './sync.ts';

const DEFAULT_DB_PATH = join(Bun.env.HOME!, '.claude', 'cclog.db');

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		help: { type: 'boolean', short: 'h' },
		verbose: { type: 'boolean', short: 'v' },
		db: { type: 'string', short: 'd' },
	},
});

const command = positionals[0];

if (values.help || !command) {
	console.log(`
cclog - Sync Claude Code transcripts to SQLite

Usage:
  cclog sync [-v] [-d path]    Sync transcripts to database
  cclog stats [-d path]        Show database statistics

Options:
  -v, --verbose    Show detailed output
  -d, --db <path>  Database path (default: ~/.claude/cclog.db)
  -h, --help       Show this help
`);
	process.exit(0);
}

const db_path = values.db ?? DEFAULT_DB_PATH;
const db = new Database(db_path);

try {
	switch (command) {
		case 'sync': {
			console.log('Syncing transcripts...');
			const result = await sync(db, values.verbose);
			console.log(`
Done!
  Files scanned:    ${result.files_scanned}
  Files processed:  ${result.files_processed}
  Messages added:   ${result.messages_added}
  Sessions found:   ${result.sessions_added}
`);
			break;
		}

		case 'stats': {
			const stats = db.get_stats();
			console.log(`
Database: ${db_path}
  Sessions:  ${stats.sessions}
  Messages:  ${stats.messages}
  Tokens:
    Input:          ${stats.tokens.input?.toLocaleString() ?? 0}
    Output:         ${stats.tokens.output?.toLocaleString() ?? 0}
    Cache read:     ${stats.tokens.cache_read?.toLocaleString() ?? 0}
    Cache creation: ${stats.tokens.cache_creation?.toLocaleString() ?? 0}
`);
			break;
		}

		default:
			console.error(`Unknown command: ${command}`);
			process.exit(1);
	}
} finally {
	db.close();
}
