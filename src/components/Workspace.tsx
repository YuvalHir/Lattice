import { For, Show } from "solid-js";
import { sessionStore, setActiveSession } from "../store/sessionStore";
import { TerminalWrapper } from "./TerminalWrapper";
import { BrowserPane } from "./BrowserPane";

interface WorkspaceProps {
  workspaceId: string;
}

export const Workspace = (props: WorkspaceProps) => {
  // Only show sessions belonging to THIS workspace
  const workspace = () => {
    return sessionStore.workspaces.find(w => w.id === props.workspaceId);
  };

  const sessionIds = () => workspace()?.sessionIds || [];
  
  const getGridDimensions = () => {
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
    const { cols } = getGridDimensions();
    const row = Math.floor(index / cols) + 1;
    const col = (index % cols) + 1;
    return `${row} / ${col} / ${row + 1} / ${col + 1}`;
  };

  const getGridTemplate = () => {
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
        position: 'relative'
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
              {sessionStore.sessions[sessionId]?.preset.name}
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <Show
                when={sessionStore.sessions[sessionId]?.kind === 'browser'}
                fallback={<TerminalWrapper id={sessionId} isActive={isActiveWorkspace()} />}
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
