import { listenToTerminalOutput, listenToProcessExit } from './services/ipc';
import { appendOutput, terminateSession, sessionStore } from './store/sessionStore';
import { terminalRegistry } from './components/TerminalWrapper';

/**
 * Initializes global listeners for the application.
 */
export async function initializeApp() {
  console.log('Initializing Multiplexer IPC listeners...');

  // Start listening for terminal output from the backend
  const unlistenOutput = await listenToTerminalOutput((payload) => {
    // Persist to store for history/catch-up.
    appendOutput(payload.id, payload.data);

    // Direct-pipe active workspace output for low-latency interactive CLIs (Gemini/Claude/Codex).
    // TerminalWrapper keeps lastWrittenIndex in sync to avoid duplicate rendering.
    const term = terminalRegistry.get(payload.id);
    if (term) {
      const ws = sessionStore.workspaces.find(w => w.sessionIds.includes(payload.id));
      if (ws && ws.id === sessionStore.activeWorkspaceId) {
        term.write(payload.data);
      }
    }
  });

  // Start listening for process exit events
  const unlistenExit = await listenToProcessExit((payload) => {
    console.log(`Process exited for session ${payload.id} with code ${payload.exit_code}`);
    terminateSession(payload.id, payload.exit_code);
  });

  // Return a cleanup function if needed
  return () => {
    unlistenOutput();
    unlistenExit();
  };
}
