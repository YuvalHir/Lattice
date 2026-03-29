import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import type { LauncherPreset, TerminalOutputPayload } from '../types/schema';
import { addSession, terminateSession, addWorkspace, addBrowserSession } from '../store/sessionStore';

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
  try {
    const pid = await invoke<number>('spawn_process', {
      payload: {
        id: preset.id,
        command: preset.command,
        context: preset.context,
        cwd: preset.cwd
      }
    });
    return pid;
  } catch (error) {
    console.error("Tauri invoke 'spawn_process' failed:", error);
    throw error;
  }
}

/**
 * Batch launches a named workspace with multiple agents.
 * Can adopt pre-launched sessions via preLaunchedIds.
 */
export async function launchWorkspace(
  name: string,
  cwd: string,
  items: WorkspaceLaunchItem[],
  browserUrl = 'http://localhost:3000',
  preLaunchedIds: string[] = []
) {
  const workspaceId = `ws-${Date.now()}`;
  const preLaunchedQueue = [...preLaunchedIds];

  const launchPromises = items.map(async (item, index) => {
    // If it's a browser, or no pre-launched items of this type exist, create new ID
    const usePreLaunched = item !== 'Browser' && preLaunchedQueue.length > 0;
    const sessionId = usePreLaunched ? preLaunchedQueue.shift()! : `${workspaceId}-${index}`;

    if (item === 'Browser') {
      addBrowserSession(sessionId, browserUrl, 'Browser');
      return sessionId;
    }

    // If it was already in the store (pre-launched), just return ID
    if (usePreLaunched) {
      return sessionId;
    }

    const basePreset = PRESETS[item];
    if (!basePreset) return null;

    const preset = { ...basePreset, id: sessionId, cwd };
    addSession(sessionId, 0, preset);

    try {
      await spawnProcess(preset);
      return sessionId;
    } catch (error) {
      terminateSession(sessionId, 1);
      return null;
    }
  });

  const results = await Promise.all(launchPromises);
  const activeIds = results.filter((id): id is string => id !== null);

  addWorkspace(workspaceId, name || "Untitled Workspace", activeIds);
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
