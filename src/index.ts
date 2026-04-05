#!/usr/bin/env node
/* eslint-disable no-process-env */
process.removeAllListeners('warning');
process.on('warning', (warning) => {
	if (warning.name !== 'ExperimentalWarning') {
		console.warn(warning);
	}
});

import { runMain } from 'citty';
import { main } from './cli.ts';

runMain(main);
