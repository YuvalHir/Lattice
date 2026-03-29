import { createSignal, Show, For, onMount, onCleanup } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

import { sessionStore, setActiveWorkspace, removeWorkspace, updateWorkspaceColor, renameWorkspace, WORKSPACE_COLORS } from "./store/sessionStore";
import { Sidebar } from "./components/Sidebar";
import { RightSidebar } from "./components/RightSidebar";
import { SourceControlPanel } from "./components/SourceControlPanel";
import { Workspace } from "./components/Workspace";
import { LauncherModal } from "./components/LauncherModal";
import { SettingsPage } from "./components/SettingsPage";
import "./App.css";

function App() {
  const appWindow = getCurrentWindow();
  const [isLauncherOpen, setIsLauncherOpen] = createSignal(false);
  const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = createSignal<string | null>(null);
  const [contextMenu, setContextMenu] = createSignal<{ x: number, y: number, id: string } | null>(null);
  const [memoryUsage, setMemoryUsage] = createSignal({ workspace_bytes: 0, total_bytes: 0 });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0.0MB';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    // Always show at least MB
    if (i < 2) return (bytes / Math.pow(1024, 2)).toFixed(1) + 'MB';
    return (bytes / Math.pow(1024, i)).toFixed(1) + units[i];
  };

  onMount(() => {
    // RAM Polling
    const interval = setInterval(async () => {
      const activeWorkspace = sessionStore.workspaces.find(w => w.id === sessionStore.activeWorkspaceId);
      const pids: number[] = [];
      
      if (activeWorkspace) {
        activeWorkspace.sessionIds.forEach(sid => {
          const session = sessionStore.sessions[sid];
          if (session && session.pid > 0 && !session.isDead) {
            pids.push(session.pid);
          }
        });
      }

      try {
        const usage = await invoke<{ workspace_bytes: number, total_bytes: number }>("get_memory_usage", { 
          workspacePids: pids 
        });
        setMemoryUsage(usage);
      } catch (err) {
        console.error("Failed to fetch memory usage:", err);
      }
    }, 5000);

    onCleanup(() => clearInterval(interval));

    const handleKeyDown = (e: KeyboardEvent) => {

      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl+, to toggle settings
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
        return;
      }

      // Ctrl+L to open launcher
      if (e.ctrlKey && e.key === "l") {
        e.preventDefault();
        setIsLauncherOpen(true);
        return;
      }

      // Ctrl+N to create new workspace (opens launcher)
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        setIsLauncherOpen(true);
        return;
      }

      // Ctrl+W to close current workspace
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        const activeId = sessionStore.activeWorkspaceId;
        if (activeId) {
          removeWorkspace(activeId);
        }
        return;
      }

      // Escape to close settings or launcher
      if (e.key === "Escape") {
        if (isSettingsOpen()) setIsSettingsOpen(false);
        if (isLauncherOpen()) setIsLauncherOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const cycleColor = (workspaceId: string, currentColor: string) => {
    const currentIndex = WORKSPACE_COLORS.indexOf(currentColor);
    const nextIndex = (currentIndex + 1) % WORKSPACE_COLORS.length;
    updateWorkspaceColor(workspaceId, WORKSPACE_COLORS[nextIndex]);
  };

  const handleRename = (id: string, newName: string) => {
    if (newName.trim()) {
      renameWorkspace(id, newName.trim());
    }
    setEditingWorkspaceId(null);
  };

  const forceTerminalReflow = () => {
    const pulses = [0, 50, 140, 260];
    pulses.forEach((delay) => {
      window.setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("terminal-force-reflow"));
      }, delay);
    });
  };

  const handleWorkspaceTabClick = (id: string) => {
    setActiveWorkspace(id);
    forceTerminalReflow();
  };

  const onTabContextMenu = (e: MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, id });
  };
  
  const toggleMaximize = async () => {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };
  
  return (
    <div class="layout-root" onClick={() => setContextMenu(null)}>
      {/* FULL HEIGHT LEFT SIDEBAR */}
      <Sidebar onLaunch={() => setIsLauncherOpen(true)} onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* VERTICAL STACK FOR HEADER + CONTENT */}
      <div class="app-main-stack">
        {/* GLOBAL TITLE BAR (Rest of the width) */}
        <header 
          data-tauri-drag-region
          style={{ 
            height: "35px", 
            background: "var(--bg-header)", 
            display: "flex", 
            "align-items": "flex-end", 
            padding: "0 140px 0 0.5rem",
            "border-bottom": "1px solid var(--border-main)",
            "gap": "2px",
            "user-select": "none",
            "cursor": "default",
            "position": "relative",
            "z-index": "1002"
          }}
        >
          <For each={sessionStore.workspaces}>
            {(ws) => (
              <div 
                onClick={() => handleWorkspaceTabClick(ws.id)}
                onDblClick={() => setEditingWorkspaceId(ws.id)}
                onContextMenu={(e) => onTabContextMenu(e, ws.id)}
                style={{
                  height: "28px",
                  "min-width": "120px",
                  "max-width": "200px",
                  background: sessionStore.activeWorkspaceId === ws.id ? "var(--bg-app)" : "transparent",
                  border: "1px solid var(--border-main)",
                  "border-bottom": sessionStore.activeWorkspaceId === ws.id ? `2px solid ${ws.color}` : "1px solid var(--border-main)",
                  "border-top-left-radius": "6px",
                  "border-top-right-radius": "6px",
                  display: "flex",
                  "align-items": "center",
                  padding: "0 10px",
                  cursor: "pointer",
                  position: "relative",
                  "margin-bottom": "-1px",
                  "z-index": sessionStore.activeWorkspaceId === ws.id ? 2 : 1,
                  transition: "border-bottom 0.2s ease"
                }}
              >
                <div 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    cycleColor(ws.id, ws.color);
                  }}
                  style={{
                    width: "8px",
                    height: "8px",
                    "border-radius": "50%",
                    background: ws.color,
                    "margin-right": "8px",
                    "box-shadow": `0 0 5px ${ws.color}66`
                  }}
                  title="Click to cycle color"
                />
                <Show when={editingWorkspaceId() === ws.id} fallback={<span style={{ "font-size": "11px", "font-weight": "500", color: sessionStore.activeWorkspaceId === ws.id ? "var(--text-main)" : "var(--text-muted)", "white-space": "nowrap", "overflow": "hidden", "text-overflow": "ellipsis", "flex": 1 }}>{ws.name}</span>}>
                  <input autofocus value={ws.name} onBlur={(e) => handleRename(ws.id, e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(ws.id, e.currentTarget.value); if (e.key === "Escape") setEditingWorkspaceId(null); }} style={{ background: "transparent", border: "none", color: "var(--text-main)", "font-size": "11px", "font-weight": "500", width: "100%", outline: "none", padding: "0" }} onClick={(e) => e.stopPropagation()} />
                </Show>
                <span onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }} style={{ "margin-left": "8px", opacity: 0.5, "font-size": "14px", "display": "flex", "align-items": "center" }}>×</span>
              </div>
            )}
          </For>
          <button onClick={() => setIsLauncherOpen(true)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", padding: "0 10px", height: "28px", cursor: "pointer", "font-size": "18px", "margin-bottom": "-1px" }}>+</button>

          {/* Global Window Controls */}
          <div class="window-controls-container">
            <div class="window-control-btn" onClick={() => appWindow.minimize()} style={{ width: "45px", height: "100%", display: "flex", "align-items": "center", "justify-content": "center", cursor: "pointer", "font-size": "14px", color: "var(--text-muted)" }}>─</div>
            <div class="window-control-btn" onClick={() => toggleMaximize()} style={{ width: "45px", height: "100%", display: "flex", "align-items": "center", "justify-content": "center", cursor: "pointer", "font-size": "12px", color: "var(--text-muted)" }}>▢</div>
            <div class="window-control-btn close" onClick={() => appWindow.close()} style={{ width: "45px", height: "100%", display: "flex", "align-items": "center", "justify-content": "center", cursor: "pointer", "font-size": "16px", color: "var(--text-muted)" }}>×</div>
          </div>
        </header>

        {/* BOTTOM CONTENT AREA */}
        <div class="content-body">
          <main class="main-content">
            <section class="workspace-container" style={{ position: "relative", flex: 1 }}>
              <For each={sessionStore.workspaces}>
                {(ws) => <Workspace workspaceId={ws.id} />}
              </For>

              <Show when={sessionStore.workspaces.length === 0}>
                <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", height: "100%", background: "var(--bg-app)" }}>
                  <div style={{ opacity: 0.2, "margin-bottom": "1rem" }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L20.6603 7V17L12 22L3.33975 17V7L12 2Z" stroke="var(--text-main)" stroke-width="1"/>
                    </svg>
                  </div>
                  <h2 style={{ "font-weight": "500", "font-size": "1.2rem", color: "var(--text-muted)" }}>LATTICE</h2>
                  <p style={{ color: "#484f58", "font-size": "0.85rem", "margin-top": "0.5rem" }}>Select '+' to configure a new workspace.</p>
                </div>
              </Show>

              {/* Context Menu Overlay */}
              <Show when={contextMenu()}>
                <div style={{ position: "fixed", top: `${contextMenu()!.y}px`, left: `${contextMenu()!.x}px`, background: "#1c2128", border: "1px solid var(--border-main)", "border-radius": "8px", "box-shadow": "0 8px 32px rgba(0,0,0,0.6)", "z-index": 1000, padding: "6px", "min-width": "160px" }} onClick={(e) => e.stopPropagation()}>
                  <div class="context-menu-item" onClick={() => { setEditingWorkspaceId(contextMenu()!.id); setContextMenu(null); }}><span>✎</span> Rename</div>
                  <div style={{ height: "1px", background: "var(--border-main)", margin: "6px 4px" }} />
                  <div style={{ padding: "8px 10px 4px 10px" }}>
                    <div style={{ "font-size": "9px", "font-weight": "bold", color: "var(--text-muted)", "margin-bottom": "8px", "text-transform": "uppercase", "letter-spacing": "0.05em" }}>Workspace Color</div>
                    <div style={{ display: "grid", "grid-template-columns": "repeat(4, 1fr)", gap: "6px" }}>
                      <For each={WORKSPACE_COLORS}>
                        {(color) => <div onClick={() => { updateWorkspaceColor(contextMenu()!.id, color); setContextMenu(null); }} style={{ width: "24px", height: "24px", "border-radius": "4px", background: color, cursor: "pointer", border: sessionStore.workspaces.find(w => w.id === contextMenu()?.id)?.color === color ? "2px solid white" : "1px solid rgba(255,255,255,0.1)", "box-shadow": `0 0 10px ${color}33`, transition: "transform 0.1s ease" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.15)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"} />}
                      </For>
                    </div>
                  </div>
                  <div style={{ height: "1px", background: "var(--border-main)", margin: "8px 4px 6px 4px" }} />
                  <div class="context-menu-item danger" onClick={() => { removeWorkspace(contextMenu()!.id); setContextMenu(null); }}><span>🗑</span> Close Workspace</div>
                </div>
              </Show>
            </section>

            <footer style={{ height: "22px", "font-size": "10px", display: "flex", "align-items": "center", padding: "0 0.75rem", color: "var(--text-muted)", background: "#0d1117", "border-top": "1px solid var(--border-main)", "flex-shrink": 0 }}>
              <div style={{ display: "flex", "align-items": "center", gap: "1rem" }}>
                <span style={{ color: "var(--accent-primary)" }}>● READY</span>
                <span style={{ "border-left": "1px solid var(--border-main)", "padding-left": "1rem", "font-family": "var(--font-mono)", "opacity": 0.8 }}>
                  {formatBytes(memoryUsage().workspace_bytes)} / {formatBytes(memoryUsage().total_bytes)}
                </span>
              </div>
              <span style={{ "margin-left": "auto" }}>{sessionStore.workspaces.length} WORKSPACES ONLINE</span>
            </footer>

          </main>

          <SourceControlPanel />
          <RightSidebar />
        </div>
      </div>

      <Show when={isLauncherOpen()}>
        <LauncherModal isOpen={true} onClose={() => setIsLauncherOpen(false)} />
      </Show>
      <SettingsPage isActive={isSettingsOpen()} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default App;
