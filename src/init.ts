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
    console.log(`[IPC] Terminal event received for session: ${payload.id}, data length: ${payload.data.length}`);
    
    // 1. Persist to store for session history/buffer (converting string to byte array for storage if needed, or just store string)
    // The store currently expects number[][], let's convert string to bytes for consistency if the store requires it
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(payload.data));
    appendOutput(payload.id, bytes);

    // 2. Direct-pipe to xterm.js instance for immediate rendering
    const term = terminalRegistry.get(payload.id);
    if (term) {
      console.log(`[IPC] Routing ${payload.data.length} characters to xterm instance: ${payload.id}`);
      term.write(payload.data);
    } else {
      console.warn(`[IPC] No xterm instance found in registry for session: ${payload.id}`);
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
