import { listenToTerminalOutput, listenToProcessExit } from './services/ipc';
import { appendOutput, terminateSession, sessionStore } from './store/sessionStore';
import { terminalRegistry } from './components/TerminalWrapper';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';

/**
 * Checks for application updates and prompts the user to install them.
 * @param manual If true, shows a message even if no update is found.
 */
export async function checkForUpdates(manual = false) {
  console.log(`[Updater] Checking for updates (manual: ${manual})...`);
  try {
    const update = await check();
    if (update) {
      console.log(`[Updater] Update available: ${update.version} from ${update.date}`);
      
      const shouldUpdate = await ask(
        `A new version (${update.version}) is available. Would you like to install it now?\n\nRelease notes: ${update.body || 'No release notes provided.'}`,
        {
          title: 'Update Available',
          kind: 'info',
          okLabel: 'Update and Relaunch',
          cancelLabel: 'Later'
        }
      );

      if (shouldUpdate) {
        console.log('[Updater] User accepted update. Downloading...');
        
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`[Updater] Started downloading ${event.data.contentLength} bytes`);
              break;
            case 'Progress':
              // console.log(`[Updater] Downloaded ${event.data.chunkLength} bytes`);
              break;
            case 'Finished':
              console.log('[Updater] Download finished');
              break;
          }
        });

        console.log('[Updater] Update installed, restarting...');
        await relaunch();
      } else {
        console.log('[Updater] User deferred update.');
      }
    } else {
      console.log('[Updater] No updates found.');
      if (manual) {
        await message('You are already running the latest version.', {
          title: 'No Update Available',
          kind: 'info'
        });
      }
    }
  } catch (error) {
    console.error('[Updater] Failed to check for updates:', error);
    if (manual) {
      await message(`Failed to check for updates: ${error}`, {
        title: 'Update Check Failed',
        kind: 'error'
      });
    }
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
