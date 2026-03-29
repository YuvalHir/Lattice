import { listenToTerminalOutput, listenToProcessExit } from './services/ipc';
import { appendOutput, terminateSession, sessionStore } from './store/sessionStore';
import { terminalRegistry } from './components/TerminalWrapper';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Checks for application updates.
 */
async function checkForUpdates() {
  try {
    const update = await check();
    if (update) {
      console.log(`Update available: ${update.version} from ${update.date}`);
      let downloaded = 0;
      let contentLength: number | undefined = 0;

      // You can implement a custom UI for progress here if needed.
      // For now, we'll use the built-in system dialogs if enabled, 
      // but manually trigger download/install to be safe.
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength;
            console.log(`Started downloading ${event.data.contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            // console.log(`Downloaded ${downloaded} from ${contentLength}`);
            break;
          case 'Finished':
            console.log('Download finished');
            break;
        }
      });

      console.log('Update installed, restarting...');
      await relaunch();
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
}

/**
 * Initializes global listeners for the application.
 */
export async function initializeApp() {
  console.log('Initializing Multiplexer IPC listeners...');

  // Check for updates in the background
  checkForUpdates();

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
