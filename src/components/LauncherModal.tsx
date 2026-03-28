import { createSignal, For, Show, onMount } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { launchWorkspace, type WorkspaceLaunchItem } from "../services/ipc";

interface LauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SESSION_TYPES = ["Gemini", "Claude", "Codex", "OpenCode", "WSL", "Browser"] as const;
type SessionType = typeof SESSION_TYPES[number];

type SessionCounts = Record<SessionType, number>;

const GridLayoutIcon = (props: { count: number }) => {
  const getGrid = () => {
    if (props.count === 1) return { cols: 1, rows: 1 };
    if (props.count === 4) return { cols: 2, rows: 2 };
    if (props.count === 6) return { cols: 3, rows: 2 };
    if (props.count === 8) return { cols: 4, rows: 2 };
    if (props.count === 12) return { cols: 4, rows: 3 };
    return { cols: 1, rows: 1 };
  };

  const { cols, rows } = getGrid();

  return (
    <div
      style={{
        display: "grid",
        "grid-template-columns": `repeat(${cols}, 1fr)`,
        "grid-template-rows": `repeat(${rows}, 1fr)`,
        gap: "2px",
        width: "24px",
        height: "18px",
        padding: "2px",
        background: "rgba(255,255,255,0.1)",
        "border-radius": "2px",
      }}
    >
      {Array(props.count)
        .fill(0)
        .map(() => (
          <div style={{ background: "var(--accent-primary)", opacity: 0.6, "border-radius": "1px" }} />
        ))}
    </div>
  );
};

const CounterButton = (props: { icon: "plus" | "minus"; onClick: () => void }) => (
  <button
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      props.onClick();
    }}
    style={{
      width: "24px",
      height: "24px",
      background: "#21262d",
      border: "1px solid var(--border-main)",
      "border-radius": "4px",
      cursor: "pointer",
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      color: "var(--text-muted)",
      transition: "all 0.2s",
    }}
  >
    <Show
      when={props.icon === "plus"}
      fallback={
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      }
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </Show>
  </button>
);

export const LauncherModal = (props: LauncherModalProps) => {
  const [selectedDir, setSelectedDir] = createSignal<string | null>(null);
  const [workspaceName, setWorkspaceName] = createSignal("");
  const [url, setUrl] = createSignal("http://localhost:3000");
  const [isLaunching, setIsLaunching] = createSignal(false);

  const [sessionCounts, setSessionCounts] = createSignal<SessionCounts>({
    Gemini: 1,
    Claude: 1,
    Codex: 0,
    OpenCode: 0,
    WSL: 0,
    Browser: 0,
  });

  const totalSessions = () => Object.values(sessionCounts()).reduce((a, b) => a + b, 0);

  onMount(async () => {
    try {
      const home = await homeDir();
      setSelectedDir(home);
    } catch (_error) {
      // Keep default null when path resolution fails.
    }
  });

  const updateCount = (key: SessionType, delta: number) => {
    setSessionCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  };

  const applyPreset = (count: number) => {
    const newCounts: SessionCounts = {
      Gemini: 0,
      Claude: 0,
      Codex: 0,
      OpenCode: 0,
      WSL: 0,
      Browser: 0,
    };

    newCounts.Gemini = Math.ceil(count / 2);
    newCounts.Claude = Math.floor(count / 2);
    setSessionCounts(newCounts);
  };

  const handleLaunch = async () => {
    if (!selectedDir() || totalSessions() === 0) return;

    setIsLaunching(true);

    const sessionsToLaunch: WorkspaceLaunchItem[] = [];
    Object.entries(sessionCounts()).forEach(([type, count]) => {
      for (let i = 0; i < count; i += 1) {
        sessionsToLaunch.push(type as WorkspaceLaunchItem);
      }
    });

    try {
      await launchWorkspace(
        workspaceName() || "New Workspace",
        selectedDir()!,
        sessionsToLaunch,
        url()
      );

      setWorkspaceName("");
      props.onClose();
    } catch (_error) {
      // Errors are already surfaced in IPC layer.
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="modal-overlay">
        <div class="launcher-modal" onMouseDown={(e) => e.stopPropagation()}>
          <header style={{ "margin-bottom": "1.5rem" }}>
            <h3 style={{ "font-weight": "600", color: "var(--text-main)", "margin-bottom": "4px" }}>
              Create Workspace
            </h3>
            <p style={{ color: "var(--text-muted)", "font-size": "11px" }}>
              Mix CLI sessions and browser tiles in the same grid.
            </p>
          </header>

          <div class="modal-section">
            <span class="modal-section-label">Workspace Name</span>
            <div class="dir-picker-box">
              <input
                type="text"
                class="dir-picker-input"
                placeholder="Project Alpha, Backend Swarm, etc."
                value={workspaceName()}
                onInput={(e) => setWorkspaceName(e.currentTarget.value)}
              />
            </div>
          </div>

          <div class="modal-section">
            <span class="modal-section-label">Working Directory</span>
            <div class="dir-picker-box">
              <input type="text" class="dir-picker-input" value={selectedDir() || "Scanning..."} readOnly />
              <button
                class="btn-browse"
                onClick={() =>
                  open({ directory: true }).then((selected) => {
                    if (selected) setSelectedDir(selected as string);
                  })
                }
              >
                Browse
              </button>
            </div>
          </div>

          <div class="modal-section">
            <span class="modal-section-label">Browser Start URL</span>
            <div class="dir-picker-box">
              <input
                type="text"
                class="dir-picker-input"
                placeholder="http://localhost:3000"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
              />
            </div>
          </div>

          <div class="modal-section">
            <span class="modal-section-label">Quick Layouts</span>
            <div class="preset-grid">
              <For each={[1, 4, 6, 8, 12]}>
                {(count) => (
                  <button
                    class="btn-preset"
                    onClick={() => applyPreset(count)}
                    style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "8px", padding: "10px 0" }}
                  >
                    <GridLayoutIcon count={count} />
                    <span style={{ "font-size": "11px" }}>{count} SESSIONS</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="modal-section">
            <span class="modal-section-label">Session Configuration</span>
            <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "0.75rem", "margin-bottom": "2rem" }}>
              <For each={SESSION_TYPES}>
                {(key) => (
                  <div class="agent-counter-card">
                    <span style={{ "font-weight": "500", "font-size": "12px" }}>{key}</span>
                    <div style={{ display: "flex", "align-items": "center", gap: "0.75rem" }}>
                      <CounterButton icon="minus" onClick={() => updateCount(key, -1)} />
                      <span
                        style={{
                          "min-width": "16px",
                          "text-align": "center",
                          "font-family": "JetBrains Mono",
                          "font-size": "12px",
                          "font-weight": "600",
                        }}
                      >
                        {sessionCounts()[key]}
                      </span>
                      <CounterButton icon="plus" onClick={() => updateCount(key, 1)} />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button class="btn-cancel" onClick={props.onClose}>
              Cancel
            </button>
            <button
              class="btn-deploy"
              disabled={!selectedDir() || totalSessions() === 0 || isLaunching()}
              onClick={handleLaunch}
            >
              {isLaunching() ? "Starting..." : `Start ${totalSessions()} Sessions`}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
