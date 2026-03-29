import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import type { LauncherPreset, TerminalOutputPayload } from '../types/schema';
import { addSession, terminateSession, addWorkspace, addBrowserSession, updateSessionPid } from '../store/sessionStore';

/**
 * Hardcoded Launcher Presets
 */
export const PRESETS: Record<string, LauncherPreset> = {
  Gemini: {
    id: 'gemini-cli',
    name: 'Gemini',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', '& gemini'],
    },
    runtime: 'native',
    context: 'Native',
  },
  Claude: {
    id: 'claude-code',
    name: 'Claude',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', '& claude'],
    },
    runtime: 'native',
    context: 'Native',
  },
  WSL: {
    id: 'wsl-bash',
    name: 'WSL',
    command: {
      executable: 'wsl.exe',
      args: [],
    },
    runtime: 'wsl',
    context: 'Native',
  },
  Debug: {
    id: 'debug-shell',
    name: 'Debug',
    command: {
      executable: 'powershell.exe',
      args: [],
    },
    runtime: 'native',
    context: 'Native',
  },
  "Ping-Test": {
    id: 'ping-test',
    name: 'Ping-Test',
    command: {
      executable: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/C', 'ping', 'google.com', '-t'],
    },
    runtime: 'native',
    context: 'Native',
  },
  Codex: {
    id: 'codex-cli',
    name: 'Codex',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', '& codex'],
    },
    runtime: 'native',
    context: 'Native',
  },
  OpenCode: {
    id: 'opencode-cli',
    name: 'OpenCode',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', '& opencode'],
    },
    runtime: 'native',
    context: 'Native',
  },
};

export type WorkspaceLaunchItem = keyof typeof PRESETS | 'Browser';

export async function spawnProcess(preset: LauncherPreset): Promise<number> {
  console.log(`[LAUNCHER] Attempting to spawn process for ${preset.id}...`);
  
  // Keep a guard timeout, but allow slower shells (especially WSL) enough time.
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Spawn timeout for ${preset.id} after 30s`)), 30000);
  });

  try {
    const invokePromise = invoke<number>('spawn_process', {
      payload: {
        id: preset.id,
        command: preset.command,
        context: preset.context,
        cwd: preset.cwd
      }
    });

    const pid = await Promise.race([invokePromise, timeoutPromise]) as number;
    console.log(`[LAUNCHER] Successfully spawned ${preset.id} with PID ${pid}`);
    return pid;
  } catch (error) {
    console.error(`[LAUNCHER] Spawn failed for ${preset.id}:`, error);
    throw error;
  }
}

/**
 * Batch launches a named workspace with multiple agents.
 * Can adopt pre-launched sessions via preLaunchedIds map.
 */
export async function launchWorkspace(
  name: string,
  cwd: string,
  items: WorkspaceLaunchItem[],
  browserUrl = 'http://localhost:3000',
  preLaunchedIds: Record<string, string[]> = {}
) {
  console.log(`[LAUNCHER] Starting workspace launch for "${name}" in ${cwd}`);
  const workspaceId = `ws-${Date.now()}`;
  
  // Create mutable queues for each type from the preLaunchedIds map
  const preLaunchedQueues: Record<string, string[]> = {};
  Object.entries(preLaunchedIds).forEach(([type, ids]) => {
    preLaunchedQueues[type] = [...ids];
  });

  const launchPromises = items.map(async (item, index) => {
    // If it's a browser, or no pre-launched items of this type exist, create new ID
    const queue = preLaunchedQueues[item] || [];
    const usePreLaunched = item !== 'Browser' && queue.length > 0;
    const sessionId = usePreLaunched ? queue.shift()! : `${workspaceId}-${index}`;

    if (item === 'Browser') {
      addBrowserSession(sessionId, browserUrl, 'Browser');
      console.log(`[LAUNCHER] Added browser session: ${sessionId}`);
      return sessionId;
    }

    // If it was already in the store (pre-launched), just return ID
    if (usePreLaunched) {
      console.log(`[LAUNCHER] Adopting pre-launched session (${item}) in ${cwd}: ${sessionId}`);
      return sessionId;
    }

    const basePreset = PRESETS[item as keyof typeof PRESETS];
    if (!basePreset) {
      console.warn(`[LAUNCHER] Unknown item type: ${item}`);
      return null;
    }

    const preset = { ...basePreset, id: sessionId, cwd };
    addSession(sessionId, 0, preset);

    try {
      const pid = await spawnProcess(preset);
      updateSessionPid(sessionId, pid);
      return sessionId;
    } catch (error) {
      console.error(`[LAUNCHER] Failed to spawn agent ${item}:`, error);
      terminateSession(sessionId, 1);
      return null;
    }
  });

  console.log(`[LAUNCHER] Waiting for ${items.length} agents to initialize...`);
  const results = await Promise.all(launchPromises);
  const activeIds = results.filter((id): id is string => id !== null);

  console.log(`[LAUNCHER] Launch sequence complete. Active agents: ${activeIds.length}`);
  if (items.length > 0 && activeIds.length === 0) {
    throw new Error("Workspace launch failed: no sessions were started.");
  }
  addWorkspace(workspaceId, name || "Untitled Workspace", activeIds, cwd);
  return workspaceId;
}

export async function writeToStdin(id: string, data: number[]): Promise<void> {
  await invoke<void>('write_to_stdin', { id, data });
}

export async function killProcess(id: string): Promise<void> {
  await invoke<void>('kill_process', { id });
}

export async function resizeTerminal(id: string, rows: number, cols: number): Promise<void> {
  await invoke<void>('resize_terminal', { id, rows, cols });
}

export async function listenToTerminalOutput(
  callback: (payload: TerminalOutputPayload) => void
): Promise<UnlistenFn> {
  return await listen<TerminalOutputPayload>('terminal-output', (event: Event<TerminalOutputPayload>) => {
    callback(event.payload);
  });
}

export async function listenToProcessExit(
  callback: (payload: { id: string, exit_code: number | null }) => void
): Promise<UnlistenFn> {
  return await listen<{ id: string, exit_code: number | null }>('process-exit', (event) => {
    callback(event.payload);
  });
}

// GIT COMMANDS
export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitInfo {
  is_repo: boolean;
  branch: string;
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export async function getGitInfo(cwd: string) {
  return await invoke<GitInfo>('get_git_info', { cwd });
}

export async function gitStatus(cwd: string) {
  return await invoke<GitFileStatus[]>('git_status', { cwd });
}

export async function gitAdd(cwd: string, path: string) {
  return await invoke<void>('git_add', { cwd, path });
}

export async function gitAddAll(cwd: string) {
  return await invoke<void>('git_add_all', { cwd });
}

export async function gitUnstage(cwd: string, path: string) {
  return await invoke<void>('git_unstage', { cwd, path });
}

export async function gitCommit(cwd: string, message: string) {
  return await invoke<void>('git_commit', { cwd, message });
}

export async function gitPush(cwd: string) {
  return await invoke<void>('git_push', { cwd });
}

export async function gitInit(cwd: string) {
  return await invoke<void>('git_init', { cwd });
}

export async function getGitLog(cwd: string) {
  return await invoke<GitCommit[]>('get_git_log', { cwd });
}
