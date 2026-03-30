import { createStore } from 'solid-js/store';
import type { LauncherPreset } from '../types/schema';

export type SessionKind = 'terminal' | 'browser';

export interface WorkspaceSession {
  id: string;
  kind: SessionKind;
  pid: number;
  preset: LauncherPreset;
  isActive: boolean;
  isDead: boolean;
  exitCode: number | null;
  startedAt: string;
  buffer: string; // Changed to string for performance
  browserUrl?: string;
  customName?: string; // User-defined name override
  isBackground?: boolean;
}

const MAX_BUFFER_SIZE = 50000; // Limit buffer to ~50KB to prevent memory leaks

export interface WorkspaceInstance {
  id: string;
  name: string;
  sessionIds: string[];
  layout: 'auto';
  color: string;
  cwd: string; // Workspace root directory
}

export const WORKSPACE_COLORS = [
  "#00E5FF", // Cyan
  "#50FA7B", // Green
  "#FF79C6", // Pink
  "#BD93F9", // Purple
  "#F1FA8C", // Yellow
  "#FF5555", // Red
  "#FFB86C", // Orange
  "#8BE9FD", // Light Blue
];

export interface ServiceInfo {
  name: string;
  pid: number;
  ports: number[];
  cwd: string;
  executable: string;
  is_managed: boolean;
  session_id: string | null;
}

interface SessionStore {
  sessions: Record<string, WorkspaceSession>;
  workspaces: WorkspaceInstance[];
  activeWorkspaceId: string | null;
  activeId: string | null; // Focus inside workspace
  isSourceControlOpen: boolean;
  isExplorerOpen: boolean;
  isServerManagerOpen: boolean;
  services: ServiceInfo[];
  externalNames: Record<number, string>; // Custom names for external services by PID
}

const [store, setStore] = createStore<SessionStore>({
  sessions: {},
  workspaces: [],
  activeWorkspaceId: null,
  activeId: null,
  isSourceControlOpen: false,
  isExplorerOpen: false,
  isServerManagerOpen: false,
  services: [],
  externalNames: {},
});

export const sessionStore = store;

/**
 * Adds a new workspace or adds a session to an existing one.
 */
export function addWorkspace(id: string, name: string, sessionIds: string[], cwd: string) {
  const usedColors = store.workspaces.map(w => w.color);
  const availableColors = WORKSPACE_COLORS.filter(c => !usedColors.includes(c));
  
  // Prioritize unused colors; fallback to modulo if all colors are already taken
  const color = availableColors.length > 0 
    ? availableColors[0] 
    : WORKSPACE_COLORS[store.workspaces.length % WORKSPACE_COLORS.length];
  setStore({
    workspaces: [
      ...store.workspaces,
      { id, name, sessionIds, layout: 'auto', color, cwd }
    ],
    activeWorkspaceId: id
  });
}

export function toggleSourceControl() {
  setStore('isSourceControlOpen', (prev) => !prev);
  if (store.isSourceControlOpen) {
    setStore('isExplorerOpen', false);
  }
}

export function toggleExplorer() {
  setStore('isExplorerOpen', (prev) => !prev);
  if (store.isExplorerOpen) {
    setStore('isSourceControlOpen', false);
  }
}

export function toggleServerManager() {
  setStore('isServerManagerOpen', (prev) => !prev);
}

export function updateServices(services: ServiceInfo[]) {
  setStore('services', services);
}

/**
 * Updates the color of a specific workspace.
 */
export function updateWorkspaceColor(id: string, color: string) {
  setStore('workspaces', (ws) => ws.id === id, 'color', color);
}

/**
 * Renames a specific workspace.
 */
export function renameWorkspace(id: string, name: string) {
  setStore('workspaces', (ws) => ws.id === id, 'name', name);
}

/**
 * Adds a new terminal session to the store.
 */
export function addSession(id: string, pid: number, preset: LauncherPreset, isBackground = false) {
  setStore('sessions', id, {
    id,
    kind: 'terminal',
    pid,
    preset,
    isActive: true,
    isDead: false,
    exitCode: null,
    startedAt: new Date().toISOString(),
    buffer: '',
    isBackground,
  });
  if (!isBackground) {
    setStore('activeId', id);
  }
}

/**
 * Adds a browser placeholder session used by Browser mode.
 * This session is UI-only and does not spawn a backend PTY process.
 */
export function addBrowserSession(id: string, url: string, name = 'Browser') {
  const browserPreset: LauncherPreset = {
    id,
    name,
    command: {
      executable: 'browser',
      args: [url],
    },
    runtime: 'native',
    context: 'Native',
  };

  setStore('sessions', id, {
    id,
    kind: 'browser',
    pid: 0,
    preset: browserPreset,
    isActive: true,
    isDead: false,
    exitCode: null,
    startedAt: new Date().toISOString(),
    buffer: '',
    browserUrl: url,
    isBackground: false,
  });
  setStore('activeId', id);
}

export function updateBrowserUrl(id: string, url: string) {
  setStore('sessions', id, 'browserUrl', url);
}

/**
 * Switch active workspace.
 */
export function setActiveWorkspace(id: string) {
  setStore('activeWorkspaceId', id);
}

/**
 * Marks a session as terminated.
 */
export function terminateSession(id: string, exitCode: number | null = null) {
  setStore('sessions', id, (s) => {
    if (s) {
      return { ...s, isActive: false, isDead: true, exitCode };
    }
    return s;
  });
}

/**
 * Utility to strip ANSI escape codes from a string for safe display in non-terminal UIs.
 */
export function stripAnsi(text: string): string {
  // Common ANSI escape sequence regex
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Appends output data to a session's buffer.
 */
export function appendOutput(id: string, data: string) {
  console.log(`[sessionStore] Appending ${data.length} bytes to session ${id}`);
  setStore('sessions', id, 'buffer', (prev) => {
    const combined = prev + data;
    if (combined.length > MAX_BUFFER_SIZE) {
      return combined.slice(-MAX_BUFFER_SIZE);
    }
    return combined;
  });
}

/**
 * Sets the currently active terminal session in the UI.
 */
export function setActiveSession(id: string | null) {
  setStore('activeId', id);
}

/**
 * Sets a custom name for a session.
 */
export function renameSession(id: string, name: string) {
  setStore('sessions', id, 'customName', name);
}

export function renameExternalService(pid: number, name: string) {
  setStore('externalNames', pid, name);
}

/**
 * Removes a session from the store.
 */
export function removeSession(id: string) {
  setStore('sessions', (sessions) => {
    const newSessions = { ...sessions };
    delete newSessions[id];
    return newSessions;
  });
  
  // Also remove from workspace
  setStore('workspaces', (ws) => 
    ws.map(w => ({
      ...w,
      sessionIds: w.sessionIds.filter(sid => sid !== id)
    }))
  );
}

/**
 * Removes a workspace and all its sessions.
 */
export function removeWorkspace(id: string) {
  const ws = store.workspaces.find(w => w.id === id);
  if (ws) {
    ws.sessionIds.forEach(sid => removeSession(sid));
  }
  const newWorkspaces = store.workspaces.filter(w => w.id !== id);
  setStore({
    workspaces: newWorkspaces,
    activeWorkspaceId: store.activeWorkspaceId === id 
      ? (newWorkspaces.length > 0 ? newWorkspaces[0].id : null)
      : store.activeWorkspaceId
  });
}

/**
 * Updates the PID of an existing session.
 */
export function updateSessionPid(id: string, pid: number) {
  setStore('sessions', id, (s) => (s ? { ...s, pid } : s));
}
