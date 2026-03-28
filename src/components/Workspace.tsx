import { For, Show, createSignal, onMount, onCleanup } from "solid-js";
import { sessionStore } from "../store/sessionStore";
import { TerminalWrapper } from "./TerminalWrapper";

export const Workspace = () => {
  const activeSessionIds = () => sessionStore.workspace.sessionIds;
  
  const [columnSplit, setColumnSplit] = createSignal(50); 
  const [rowSplit, setRowSplit] = createSignal(50);
  const [isResizing, setIsResizing] = createSignal<string | null>(null);

  // Determine grid dimensions based on total agents
  const getGridDimensions = () => {
    const total = activeSessionIds().length;
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

  const startResizing = (type: 'col' | 'row') => (e: MouseEvent) => {
    setIsResizing(type);
    document.body.style.cursor = type === 'col' ? 'col-resize' : 'row-resize';
    e.preventDefault();
    e.stopPropagation();
  };

  const stopResizing = () => {
    if (isResizing()) {
      setIsResizing(null);
      document.body.style.cursor = 'default';
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const type = isResizing();
    if (!type) return;

    const container = document.querySelector('.workspace-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (type === 'col') {
      const x = e.clientX - rect.left;
      const newSplit = (x / rect.width) * 100;
      setColumnSplit(Math.max(10, Math.min(90, newSplit)));
    } else if (type === 'row') {
      const y = e.clientY - rect.top;
      const newSplit = (y / rect.height) * 100;
      setRowSplit(Math.max(10, Math.min(90, newSplit)));
    }
  };

  onMount(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
  });

  onCleanup(() => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResizing);
  });

  const getGridArea = (index: number) => {
    const { cols } = getGridDimensions();
    const row = Math.floor(index / cols) + 1;
    const col = (index % cols) + 1;
    return `${row} / ${col} / ${row + 1} / ${col + 1}`;
  };

  const getGridTemplate = () => {
    const { cols, rows } = getGridDimensions();
    
    let colTemplate = "";
    if (cols === 1) colTemplate = "1fr";
    else {
      // Scale the first column based on columnSplit, rest share remaining space
      const remainingWidth = 100 - columnSplit();
      const otherColsCount = cols - 1;
      const otherColWidth = remainingWidth / otherColsCount;
      colTemplate = `${columnSplit()}% repeat(${otherColsCount}, ${otherColWidth}%)`;
    }

    let rowTemplate = "";
    if (rows === 1) rowTemplate = "1fr";
    else {
      // Scale the first row based on rowSplit, rest share remaining space
      const remainingHeight = 100 - rowSplit();
      const otherRowsCount = rows - 1;
      const otherRowHeight = remainingHeight / otherRowsCount;
      rowTemplate = `${rowSplit()}% repeat(${otherRowsCount}, ${otherRowHeight}%)`;
    }

    return { colTemplate, rowTemplate };
  };

  return (
    <div class="workspace-container" style={{
      width: '100%',
      height: '100%',
      display: 'grid',
      'grid-template-columns': getGridTemplate().colTemplate,
      'grid-template-rows': getGridTemplate().rowTemplate,
      overflow: 'hidden',
      background: '#000',
      position: 'relative'
    }}>
      <Show when={isResizing()}>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          'z-index': 1000,
          cursor: isResizing() === 'col' ? 'col-resize' : 'row-resize',
          background: 'transparent'
        }} />
      </Show>

      <For each={activeSessionIds()}>
        {(sessionId, index) => (
          <div 
            class="terminal-tile"
            style={{
              'grid-area': getGridArea(index()),
              position: 'relative',
              border: '1px solid #1e293b',
              'box-sizing': 'border-box',
              overflow: 'hidden'
            }}
          >
            <div class="tile-header" style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              height: '22px',
              background: 'rgba(15, 23, 42, 0.95)',
              display: 'flex',
              'align-items': 'center',
              padding: '0 8px',
              'font-size': '10px',
              color: '#94a3b8',
              'z-index': 10,
              'border-bottom': '1px solid #1e293b',
              'pointer-events': 'none'
            }}>
              {sessionStore.sessions[sessionId]?.preset.name}
            </div>
            <div style={{ width: '100%', height: '100%', 'padding-top': '2px' }}>
              <TerminalWrapper id={sessionId} isActive={true} />
            </div>
          </div>
        )}
      </For>

      {/* Column Resizer Handle */}
      <Show when={getGridDimensions().cols >= 2}>
        <div 
          onMouseDown={startResizing('col')}
          style={{
            position: 'absolute',
            left: `${columnSplit()}%`,
            top: 0, bottom: 0,
            width: '12px',
            cursor: 'col-resize',
            'z-index': 500,
            transform: 'translateX(-50%)',
            display: 'flex',
            'justify-content': 'center'
          }}
        >
          <div style={{
            width: '2px',
            height: '100%',
            background: isResizing() === 'col' ? 'var(--primary)' : '#334155',
            transition: 'background 0.2s'
          }} />
        </div>
      </Show>

      {/* Row Resizer Handle */}
      <Show when={getGridDimensions().rows >= 2}>
        <div 
          onMouseDown={startResizing('row')}
          style={{
            position: 'absolute',
            top: `${rowSplit()}%`,
            left: 0, right: 0,
            height: '12px',
            cursor: 'row-resize',
            'z-index': 500,
            transform: 'translateY(-50%)',
            display: 'flex',
            'flex-direction': 'column',
            'justify-content': 'center'
          }}
        >
          <div style={{
            height: '2px',
            width: '100%',
            background: isResizing() === 'row' ? 'var(--primary)' : '#334155',
            transition: 'background 0.2s'
          }} />
        </div>
      </Show>
    </div>
  );
};
