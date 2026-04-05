import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from './db.ts';

// Team directories to scan
// Primary: standard Claude Code location
// Sneakpeek: temporary parallel build - can be removed when merged upstream
const TEAMS_DIRS = [
	join(process.env.HOME!, '.claude', 'teams'),
	join(
		process.env.HOME!,
		'.claude-sneakpeek',
		'claudesp',
		'config',
		'teams',
	),
];

const TASKS_DIRS = [
	join(process.env.HOME!, '.claude', 'tasks'),
	join(
		process.env.HOME!,
		'.claude-sneakpeek',
		'claudesp',
		'config',
		'tasks',
	),
];

interface TeamConfig {
	name: string;
	description?: string;
	createdAt: number;
	leadAgentId?: string;
	leadSessionId?: string;
	members?: Array<{
		agentId: string;
		name: string;
		agentType?: string;
		model?: string;
		prompt?: string;
		color?: string;
		cwd?: string;
		joinedAt?: number;
	}>;
}

interface TaskFile {
	id: string;
	subject: string;
	description?: string;
	status?: string;
	owner?: string;
}

export interface TeamSyncResult {
	teams_synced: number;
	members_synced: number;
	tasks_synced: number;
}

export async function sync_teams(
	db: Database,
	verbose = false,
): Promise<TeamSyncResult> {
	const result: TeamSyncResult = {
		teams_synced: 0,
		members_synced: 0,
		tasks_synced: 0,
	};

	// Sync teams and members
	for (const teams_dir of TEAMS_DIRS) {
		if (!existsSync(teams_dir)) continue;

		const team_dirs = readdirSync(teams_dir, {
			withFileTypes: true,
		})
			.filter((d) => d.isDirectory())
			.map((d) => d.name);

		for (const team_dir of team_dirs) {
			const config_path = join(teams_dir, team_dir, 'config.json');
			if (!existsSync(config_path)) continue;

			try {
				const config: TeamConfig = JSON.parse(
					readFileSync(config_path, 'utf-8'),
				);

				if (verbose) {
					console.log(`  Team: ${config.name}`);
				}

				// Use directory name as ID (handles both named and UUID dirs)
				const team_id = team_dir;

				db.upsert_team({
					id: team_id,
					name: config.name,
					description: config.description,
					lead_session_id: config.leadSessionId,
					created_at: config.createdAt,
				});
				result.teams_synced++;

				// Sync members
				if (config.members) {
					for (const member of config.members) {
						db.upsert_team_member({
							id: member.agentId,
							team_id: team_id,
							name: member.name,
							agent_type: member.agentType,
							model: member.model,
							prompt: member.prompt,
							color: member.color,
							cwd: member.cwd,
							joined_at: member.joinedAt ?? config.createdAt,
						});
						result.members_synced++;
					}
				}
			} catch (err) {
				if (verbose) {
					console.error(`  Error parsing ${config_path}: ${err}`);
				}
			}
		}
	}

	// Sync tasks
	for (const tasks_dir of TASKS_DIRS) {
		if (!existsSync(tasks_dir)) continue;

		const task_team_dirs = readdirSync(tasks_dir, {
			withFileTypes: true,
		})
			.filter((d) => d.isDirectory())
			.map((d) => d.name);

		for (const team_dir of task_team_dirs) {
			const team_tasks_dir = join(tasks_dir, team_dir);
			const task_files = readdirSync(team_tasks_dir).filter(
				(f) => f.endsWith('.json') && f !== '.lock',
			);

			for (const task_file of task_files) {
				const task_path = join(team_tasks_dir, task_file);
				try {
					const task: TaskFile = JSON.parse(
						readFileSync(task_path, 'utf-8'),
					);

					db.upsert_team_task({
						id: `${team_dir}:${task.id}`,
						team_id: team_dir,
						owner_name: task.owner,
						subject: task.subject,
						description: task.description,
						status: task.status,
					});
					result.tasks_synced++;
				} catch (err) {
					if (verbose) {
						console.error(`  Error parsing ${task_path}: ${err}`);
					}
				}
			}
		}
	}

	return result;
}
