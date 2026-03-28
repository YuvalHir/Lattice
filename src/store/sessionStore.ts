import { createStore } from 'solid-js/store';
import type { LauncherPreset } from '../types/schema';

export interface TerminalSession {
  id: string; // Changed from sessionId
  pid: number;
  preset: LauncherPreset;
  isActive: boolean;
  isDead: boolean;
  exitCode: number | null;
  startedAt: string;
  buffer: number[][]; // Buffered byte arrays
}

export type LayoutType = 'grid-2x2' | 'grid-3x2' | 'auto';

interface Workspace {
  sessionIds: string[];
  layout: LayoutType;
}

interface SessionStore {
  sessions: Record<string, TerminalSession>;
  activeId: string | null; // Changed from activeSessionId
  workspace: Workspace;
}

const [store, setStore] = createStore<SessionStore>({
  sessions: {},
  activeId: null,
  workspace: {
    sessionIds: [],
    layout: 'auto'
  }
});

export const sessionStore = store;

/**
 * Adds a new terminal session to the store.
 */
export function addSession(id: string, pid: number, preset: LauncherPreset) {
  setStore('sessions', id, {
    id,
    pid,
    preset,
    isActive: true,
    isDead: false,
    exitCode: null,
    startedAt: new Date().toISOString(),
    buffer: [],
  });
  setStore('activeId', id);
  // Also add to workspace if not already there
  setStore('workspace', 'sessionIds', (ids) => {
    if (!ids.includes(id)) {
      return [...ids, id];
    }
    return ids;
  });
}

/**
 * Sets the workspace layout.
 */
export function setWorkspaceLayout(layout: LayoutType) {
  setStore('workspace', 'layout', layout);
}

/**
 * Clears the current workspace.
 */
export function clearWorkspace() {
  setStore('workspace', 'sessionIds', []);
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
export function appendOutput(id: string, data: number[]) {
  setStore('sessions', id, 'buffer', (prev) => [...prev, data]);
}

/**
 * Sets the currently active terminal session in the UI.
 */
export function setActiveSession(id: string | null) {
  setStore('activeId', id);
  if (id !== null && store.sessions[id]) {
    setStore('sessions', id, 'isActive', true);
  }
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
  if (store.activeId === id) {
    setStore('activeId', null);
  }
}
