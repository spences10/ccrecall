#!/usr/bin/env node
/* eslint-disable no-process-env */
// Strip ANSI colors when stdout is not a TTY (piped to LLM, script, etc.)
if (!process.stdout.isTTY) {
	process.env.NO_COLOR = '1';
}

// Suppress node:sqlite ExperimentalWarning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
	if (warning.name !== 'ExperimentalWarning') {
		console.warn(warning);
	}
});

// Dynamic import so NO_COLOR is set before citty reads it
const { runMain } = await import('citty');
const { main } = await import('./cli.ts');

runMain(main);
