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
}

const MAX_BUFFER_SIZE = 50000; // Limit buffer to ~50KB to prevent memory leaks

export interface WorkspaceInstance {
  id: string;
  name: string;
  sessionIds: string[];
  layout: 'auto';
  color: string;
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

interface SessionStore {
  sessions: Record<string, WorkspaceSession>;
  workspaces: WorkspaceInstance[];
  activeWorkspaceId: string | null;
  activeId: string | null; // Focus inside workspace
}

const [store, setStore] = createStore<SessionStore>({
  sessions: {},
  workspaces: [],
  activeWorkspaceId: null,
  activeId: null,
});

export const sessionStore = store;

/**
 * Adds a new workspace or adds a session to an existing one.
 */
export function addWorkspace(id: string, name: string, sessionIds: string[]) {
  const usedColors = store.workspaces.map(w => w.color);
  const availableColors = WORKSPACE_COLORS.filter(c => !usedColors.includes(c));
  
  // Prioritize unused colors; fallback to modulo if all colors are already taken
  const color = availableColors.length > 0 
    ? availableColors[0] 
    : WORKSPACE_COLORS[store.workspaces.length % WORKSPACE_COLORS.length];

  setStore('workspaces', (prev) => [
    ...prev,
    { id, name, sessionIds, layout: 'auto', color }
  ]);
  setStore('activeWorkspaceId', id);
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
 * Appends output data to a session's buffer.
 */
export function appendOutput(id: string, data: string) {
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
  setStore('workspaces', (prev) => prev.filter(w => w.id !== id));
  if (store.activeWorkspaceId === id) {
    setStore('activeWorkspaceId', store.workspaces.length > 0 ? store.workspaces[0].id : null);
  }
}
