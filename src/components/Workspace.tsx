import { For, Show, createSignal } from "solid-js";
import { sessionStore, setActiveSession, renameSession, addSession, addSessionToWorkspace, removeSession, updateSessionPid } from "../store/sessionStore";
import { TerminalWrapper } from "./TerminalWrapper";
import { BrowserPane } from "./BrowserPane";
import { spawnProcess, closeSession } from "../services/ipc";

interface WorkspaceProps {
  workspaceId: string;
  onLaunch: () => void; // Allow triggering launcher
}

export const Workspace = (props: WorkspaceProps) => {
  // Only show sessions belonging to THIS workspace
  const workspace = () => {
    return sessionStore.workspaces.find(w => w.id === props.workspaceId);
  };

  const sessionIds = () => workspace()?.sessionIds || [];

  // Track which session is being edited
  const [editingSessionId, setEditingSessionId] = createSignal<string | null>(null);

  const handleSplit = async (sessionId: string) => {
    const session = sessionStore.sessions[sessionId];
    if (!session) return;

    const workspaceId = props.workspaceId;
    const newSessionId = `split-${Date.now()}`;
    const preset = { ...session.preset, id: newSessionId, cwd: workspace()?.cwd || session.preset.cwd };

    addSession(newSessionId, 0, preset);
    addSessionToWorkspace(workspaceId, newSessionId);

    try {
      const pid = await spawnProcess(preset);
      updateSessionPid(newSessionId, pid);
    } catch (e) {
      console.error("Split failed:", e);
      removeSession(newSessionId);
    }
  };

  const handleAdd = () => {
    // For now, trigger the main launcher. 
    // In a future update, we could make the launcher "Add-aware"
    props.onLaunch();
  };
  
  const getGridDimensions = () => {
// ... (rest of getGridDimensions)
    const total = sessionIds().length;
    if (total <= 1) return { cols: 1, rows: 1 };
    if (total <= 2) return { cols: 2, rows: 1 };
    if (total <= 4) return { cols: 2, rows: 2 };
    if (total <= 6) return { cols: 3, rows: 2 }; 
    if (total <= 8) return { cols: 4, rows: 2 }; 
    if (total <= 12) return { cols: 4, rows: 3 }; 
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);
    return { cols, rows };
  };

  const getGridArea = (index: number) => {
// ... (rest of getGridArea)
    const { cols } = getGridDimensions();
    const row = Math.floor(index / cols) + 1;
    const col = (index % cols) + 1;
    return `${row} / ${col} / ${row + 1} / ${col + 1}`;
  };

  const getGridTemplate = () => {
// ... (rest of getGridTemplate)
    const { cols, rows } = getGridDimensions();
    return {
      col: `repeat(${cols}, 1fr)`,
      row: `repeat(${rows}, 1fr)`
    };
  };

  const isActiveWorkspace = () => sessionStore.activeWorkspaceId === props.workspaceId;

  return (
    <div 
      class="workspace-content" 
      style={{
        width: '100%',
        height: '100%',
        display: isActiveWorkspace() ? 'grid' : 'none',
        'grid-template-columns': getGridTemplate().col,
        'grid-template-rows': getGridTemplate().row,
        background: 'transparent',
        position: 'relative',
        'min-height': 0,
        'min-width': 0,
        overflow: 'hidden'
      }}
    >
      <For each={sessionIds()}>
        {(sessionId, index) => (
          <div
            class={`terminal-tile glass-pane ${sessionStore.activeId === sessionId ? 'glass-pane-active' : ''}`}
            onMouseDown={() => setActiveSession(sessionId)}
            style={{
              'grid-area': getGridArea(index()),
            }}
          >
            <div class="tile-header">
              <Show
                when={editingSessionId() === sessionId}
                fallback={
                  <div
                    class="tile-header-content"
                    onDblClick={() => setEditingSessionId(sessionId)}
                  >
                    <span class="tile-header-name">
                      {sessionStore.sessions[sessionId]?.customName || sessionStore.sessions[sessionId]?.preset.name}
                    </span>
                    <svg class="tile-header-edit-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </div>
                }
              >
                <input
                  autofocus
                  class="tile-header-input"
                  value={sessionStore.sessions[sessionId]?.customName || sessionStore.sessions[sessionId]?.preset.name}
                  onBlur={(e) => {
                    renameSession(sessionId, e.currentTarget.value);
                    setEditingSessionId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      renameSession(sessionId, e.currentTarget.value);
                      setEditingSessionId(null);
                    }
                    if (e.key === "Escape") {
                      setEditingSessionId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDblClick={(e) => e.stopPropagation()}
                />
              </Show>

              <div class="tile-header-actions">
                <button 
                  class="tile-action-btn" 
                  title="Split Agent"
                  onClick={(e) => { e.stopPropagation(); handleSplit(sessionId); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="12" y1="3" x2="12" y2="21"></line>
                  </svg>
                </button>
                <button 
                  class="tile-action-btn" 
                  title="Add Agent"
                  onClick={(e) => { e.stopPropagation(); handleAdd(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
                <button 
                  class="tile-action-btn danger" 
                  title="Close Session"
                  onClick={(e) => { e.stopPropagation(); closeSession(sessionId); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', 'min-height': 0 }}>
              <Show
                when={sessionStore.sessions[sessionId]?.kind === 'browser'}
                fallback={
                  <>
                    <Show when={!sessionStore.sessions[sessionId]?.pid}>
                      <div class="terminal-loading-overlay">
                        <div class="spinner-small" />
                        <span>Assembling Agent...</span>
                      </div>
                    </Show>
                    <TerminalWrapper id={sessionId} isActive={isActiveWorkspace()} />
                  </>
                }
              >
                <BrowserPane
                  id={sessionId}
                  initialUrl={sessionStore.sessions[sessionId]?.browserUrl || "https://example.com"}
                />
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};
