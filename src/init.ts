import { listenToTerminalOutput, listenToProcessExit } from './services/ipc';
import { appendOutput, terminateSession } from './store/sessionStore';
import { terminalRegistry } from './components/TerminalWrapper';

/**
 * Initializes global listeners for the application.
 */
export async function initializeApp() {
  console.log('Initializing Multiplexer IPC listeners...');

  // Start listening for terminal output from the backend
  const unlistenOutput = await listenToTerminalOutput((payload) => {
    // 1. Persist to store (string-based append)
    appendOutput(payload.id, payload.data);

    // 2. Direct-pipe to xterm.js instance for immediate rendering
    const term = terminalRegistry.get(payload.id);
    if (term) {
      term.write(payload.data);
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
