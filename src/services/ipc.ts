import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import type { LauncherPreset, TerminalOutputPayload } from '../types/schema';
import { addSession, terminateSession } from '../store/sessionStore';

/**
 * Hardcoded Launcher Presets
 */
export const PRESETS: Record<string, LauncherPreset> = {
  Gemini: {
    id: 'gemini-cli',
    name: 'Gemini',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', 'gemini'],
    },
    runtime: 'native',
    context: 'Native',
  },
  Claude: {
    id: 'claude-code',
    name: 'Claude',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', 'npx @anthropic-ai/claude-code'],
    },
    runtime: 'native',
    context: 'Native',
  },
  WSL: {
    id: 'wsl-bash',
    name: 'WSL',
    command: {
      executable: 'wsl.exe',
      args: ['~'],
    },
    runtime: 'wsl',
    context: 'WSL',
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
      args: ['-NoLogo', '-Command', 'codex'],
    },
    runtime: 'native',
    context: 'Native',
  },
  OpenCode: {
    id: 'opencode-cli',
    name: 'OpenCode',
    command: {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-Command', 'opencode'],
    },
    runtime: 'native',
    context: 'Native',
  },
};

/**
 * Lower-level function to spawn a process via Tauri invoke.
 * It maps the frontend's LauncherPreset to the backend's expected schema.
 */
export async function spawnProcess(preset: LauncherPreset): Promise<number> {
  console.log("Invoking Tauri command 'spawn_process' with payload:", JSON.stringify({ payload: preset }, null, 2));
  try {
    // The backend's command function expects an argument named 'payload'
    // The payload itself must match the LauncherPreset struct in Rust
    const pid = await invoke<number>('spawn_process', { 
      payload: {
        id: preset.id,
        command: preset.command,
        context: preset.context
      } 
    });
    console.log("Successfully spawned process. Backend returned PID:", pid);
    return pid;
  } catch (error) {
    console.error("Tauri invoke 'spawn_process' failed:", error);
    throw error;
  }
}

/**
 * High-level function to spawn a process and register it in the UI store.
 */
export async function handleLaunch(presetName: keyof typeof PRESETS) {
  const basePreset = PRESETS[presetName];
  if (!basePreset) return;

  const sessionId = `s${Date.now()}`;
  try {
    // Clone and generate a unique sessionId for THIS instance
    const preset = { ...basePreset, id: sessionId };
    
    // 1. ADD TO STORE FIRST: This triggers TerminalWrapper mounting
    console.log(`[IPC] Pre-registering session ${sessionId} in store...`);
    addSession(sessionId, 0, preset);

    // 2. WAIT FOR MOUNT: Brief delay to ensure TerminalWrapper onMount runs
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log(`[IPC] Requesting process spawn for session ${sessionId}...`);
    const pid = await spawnProcess(preset);
    
    // 3. UPDATE PID
    console.log(`[IPC] Process spawned successfully with PID: ${pid}`);
    
    return sessionId;
  } catch (error) {
    console.error(`[IPC] Launch failed for ${sessionId}:`, error);
    // Cleanup if spawning failed
    terminateSession(sessionId, 1);
    throw error;
  }
}

/**
 * Batch launches a workspace with multiple agents in a specific directory.
 */
export async function launchWorkspace(cwd: string, agents: (keyof typeof PRESETS)[]) {
  console.log(`[WORKSPACE] Initiating parallel launch for ${agents.length} agents in ${cwd}...`);
  
  const launchPromises = agents.map(async (presetName, index) => {
    const basePreset = PRESETS[presetName];
    if (!basePreset) return;

    // Unique ID for each agent in the batch
    const sessionId = `ws-${Date.now()}-${index}`;
    const preset = { ...basePreset, id: sessionId, cwd };

    console.log(`[WORKSPACE] Spawning agent ${index + 1}/${agents.length}: ${presetName} (ID: ${sessionId})`);
    
    // 1. Pre-register
    addSession(sessionId, 0, preset);
    
    // 2. Spawn
    try {
      const pid = await spawnProcess(preset);
      console.log(`[WORKSPACE] Agent ${sessionId} spawned with PID ${pid}`);
      return sessionId;
    } catch (e) {
      console.error(`[WORKSPACE] Failed to spawn agent ${sessionId}:`, e);
      terminateSession(sessionId, 1);
      return null;
    }
  });

  const results = await Promise.all(launchPromises);
  const activeIds = results.filter((id): id is string => id !== null);
  
  console.log(`[WORKSPACE] Batch launch complete. ${activeIds.length}/${agents.length} agents active.`);
  return activeIds;
}

/**
 * Sends data to the stdin of a specific session.
 */
export async function writeToStdin(id: string, data: number[]): Promise<void> {
  await invoke<void>('write_to_stdin', { id, data });
}

/**
 * Force terminates a process by id.
 */
export async function killProcess(id: string): Promise<void> {
  await invoke<void>('kill_process', { id });
}

/**
 * Resizes the PTY on the backend.
 */
export async function resizeTerminal(id: string, rows: number, cols: number): Promise<void> {
  await invoke<void>('resize_terminal', { id, rows, cols });
}

/**
 * Listens for terminal output events emitted by the backend.
 */
export async function listenToTerminalOutput(
  callback: (payload: TerminalOutputPayload) => void
): Promise<UnlistenFn> {
  return await listen<TerminalOutputPayload>('terminal-output', (event: Event<TerminalOutputPayload>) => {
    callback(event.payload);
  });
}

/**
 * Listens for process exit events emitted by the backend.
 */
export async function listenToProcessExit(
  callback: (payload: { id: string, exit_code: number | null }) => void
): Promise<UnlistenFn> {
  return await listen<{ id: string, exit_code: number | null }>('process-exit', (event) => {
    callback(event.payload);
  });
}
