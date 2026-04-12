import { listenToTerminalOutput, listenToProcessExit, getPlatform } from './services/ipc';
import { appendOutput, terminateSession, sessionStore } from './store/sessionStore';
import { terminalRegistry } from './components/TerminalWrapper';
import { settingsStore, updateSettings } from './store/settingsStore';
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

  try {
    const platform = await getPlatform();
    console.log(`[INIT] Running on platform: ${platform}`);
  } catch (e) {
    console.error('[INIT] Failed to get platform:', e);
  }

  // Check for updates in the background
  checkForUpdates();

  // Start listening for terminal output from the backend
  const unlistenOutput = await listenToTerminalOutput((payload) => {
    if (payload.id.startsWith('bg-')) {
       console.log(`[IPC] ${payload.id} raw data: ${JSON.stringify(payload.data)}`);
    }

    // 1. Persist to store for history/catch-up.
    appendOutput(payload.id, payload.data);

    // 2. Direct-pipe active workspace output for low-latency interactive CLIs.
    const term = terminalRegistry.get(payload.id);
    if (!term) return;

    // Optimization: If it's the absolutely focused session, write immediately.
    if (payload.id === sessionStore.activeId) {
      term.write(payload.data);
      return;
    }

    // Fallback: Check if it's part of the currently visible workspace (multi-terminal view).
    const activeWs = sessionStore.workspaces.find(w => w.id === sessionStore.activeWorkspaceId);
    if (activeWs && activeWs.sessionIds.includes(payload.id)) {
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
