/**
 * Execution Context for the session.
 */
export type ExecutionContext = 'Native' | 'PowerShell' | 'CMD' | 'WSL';

/**
 * Launcher Preset Interface
 * Dictates how an agent or CLI tool is initialized.
 */
export interface LauncherPreset {
  id: string;
  name: string;
  description?: string;
  command: {
    executable: string;
    args: string[];
    cwd?: string;
  };
  cwd?: string; // Top level cwd for Workspace launch
  env?: Record<string, string>;
  runtime: 'native' | 'wsl' | 'docker';
  context: ExecutionContext; // Added context field
  options?: {
    auto_restart?: boolean;
    shell?: boolean;
  };
}

/**
 * Tauri Event Payloads
 */

export interface TerminalOutputPayload {
  id: string; // Consistently using 'id'
  data: string; // From PTY output
}

export interface ProcessSpawnPayload {
  pid: number;
  id: string; 
  timestamp: string;
}

export interface ProcessExitPayload {
  id: string; 
  exit_code: number | null;
  signal: string | null;
}

/**
 * IPC Types
 */
export type UnlistenFn = () => void;
