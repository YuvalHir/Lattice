import { For, createEffect, createSignal, Show } from "solid-js";
import { sessionStore, setActiveSession, removeSession, clearWorkspace } from "./store/sessionStore";
import { Sidebar } from "./components/Sidebar";
import { Workspace } from "./components/Workspace";
import { LauncherModal } from "./components/LauncherModal";
import { PRESETS } from "./services/ipc";
import "./App.css";

function App() {
  const [error, setError] = createSignal<string | null>(null);
  const [isLauncherOpen, setIsLauncherOpen] = createSignal(false);

  // Convert the sessions record to an array for rendering
  const sessionsList = () => Object.values(sessionStore.sessions);

  // Monitor the store in real-time
  createEffect(() => {
    console.log("Current Workspace State:", JSON.parse(JSON.stringify(sessionStore.workspace)));
  });

  return (
    <div class="layout" style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar with Launcher Access */}
      <Sidebar onLaunch={() => setIsLauncherOpen(true)} />

      {/* Main View */}
      <main class="main-view">
        <header class="tab-bar glass-panel" style={{ "justify-content": "space-between" }}>
          <div 
            style={{ 
              "font-weight": "bold",
              color: "var(--primary)",
              "letter-spacing": "2px",
              "font-size": "1.1rem"
            }}
          >
            LATTICE
          </div>

          <button 
            onClick={clearWorkspace}
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#FCA5A5",
              padding: "6px 12px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "0.75rem",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
          >
            TERMINATE ALL AGENTS
          </button>
        </header>

        <section class="workspace" style={{ background: "#000" }}>
          {/* Error Banner */}
          <Show when={error()}>
            <div 
              class="glass-panel" 
              style={{
                position: "absolute",
                top: "1rem",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "0.75rem 1.5rem",
                "background-color": "rgba(239, 68, 68, 0.2)",
                "border-color": "rgba(239, 68, 68, 0.5)",
                color: "#FCA5A5",
                "border-radius": "8px",
                "z-index": "100",
                display: "flex",
                "align-items": "center",
                gap: "1rem"
              }}
            >
              <span>{error()}</span>
              <button 
                onClick={() => setError(null)}
                style={{ 
                  background: "none", 
                  border: "none", 
                  color: "inherit", 
                  cursor: "pointer", 
                  "font-weight": "bold" 
                }}
              >
                ✕
              </button>
            </div>
          </Show>

          {/* Grid Workspace View */}
          <Workspace />

          {sessionsList().length === 0 && (
            <div style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              "justify-content": "center",
              height: "100%",
              color: "var(--text-dim)",
              gap: "1rem",
              padding: "2rem",
              "text-align": "center",
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              "background": "var(--surface)",
              "z-index": 5
            }}>
              <h1 style={{ color: "var(--primary)", "font-size": "2.5rem", "margin-bottom": "0.5rem" }}>LATTICE</h1>
              <p style={{ "max-width": "400px" }}>
                The Next-Generation Multi-Agent IDE. Click the '+' button to deploy your parallel swarm.
              </p>
              <button 
                class="primary" 
                onClick={() => setIsLauncherOpen(true)}
                style={{
                  background: "var(--primary)",
                  color: "#000",
                  border: "none",
                  padding: "0.75rem 1.5rem",
                  "border-radius": "8px",
                  "font-weight": "600",
                  cursor: "pointer",
                  "margin-top": "1rem"
                }}
              >
                Deploy Swarm
              </button>
            </div>
          )}
        </section>

        <footer class="status-bar glass-panel" style={{ 
          height: "28px", 
          "font-size": "0.75rem", 
          display: "flex", 
          "align-items": "center", 
          padding: "0 1rem", 
          color: "var(--text-dim)",
          "border-top": "1px solid var(--glass-border)"
        }}>
          <div style={{ display: "flex", "align-items": "center", gap: "1rem" }}>
            <span>IPC: Connected</span>
            <span style={{ color: "var(--success)" }}>● Lattice Ready</span>
          </div>
          <span style={{ "margin-left": "auto" }}>
            Active Agents: {sessionStore.workspace.sessionIds.length}
          </span>
        </footer>
      </main>

      <LauncherModal 
        isOpen={isLauncherOpen()} 
        onClose={() => setIsLauncherOpen(false)} 
      />
    </div>
  );
}

export default App;
