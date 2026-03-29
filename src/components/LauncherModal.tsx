import { createEffect, createSignal, For, Show, onMount, JSX } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { launchWorkspace, spawnProcess, killProcess, type WorkspaceLaunchItem, PRESETS } from "../services/ipc";
import {
  LAST_WORKING_DIR_KEY,
  SESSION_TYPES,
  settingsStore,
  type SessionType,
} from "../store/settingsStore";
import { addSession, terminateSession, updateSessionPid } from "../store/sessionStore";

interface LauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SessionCounts = Record<SessionType, number>;
type Step = "basics" | "swarm" | "config";

const AGENT_ICONS: Record<SessionType, JSX.Element> = {
  Gemini: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  Claude: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    </svg>
  ),
  Codex: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  OpenCode: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  WSL: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  Browser: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
};

export const LauncherModal = (props: LauncherModalProps) => {
  const [step, setStep] = createSignal<Step>("basics");
  const [selectedDir, setSelectedDir] = createSignal<string | null>(null);
  const [workspaceName, setWorkspaceName] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [isLaunching, setIsLaunching] = createSignal(false);
  const [sessionCounts, setSessionCounts] = createSignal<SessionCounts>({ ...settingsStore.defaultSessionCounts });
  
  // Track pre-launched session IDs by type
  const [preLaunched, setPreLaunched] = createSignal<Record<SessionType, string[]>>({
    Gemini: [], Claude: [], Codex: [], OpenCode: [], WSL: [], Browser: []
  });

  const totalSessions = () => Object.values(sessionCounts()).reduce((a, b) => a + b, 0);

  onMount(async () => {
    const home = await homeDir();
    const remembered = settingsStore.rememberLastDirectory ? localStorage.getItem(LAST_WORKING_DIR_KEY) : null;
    setSelectedDir(remembered || home);
    setWorkspaceName(settingsStore.defaultWorkspaceName);
    setUrl(settingsStore.defaultBrowserUrl);
  });

  // PREDICTIVE LAUNCHING EFFECT
  createEffect(async () => {
    if (!props.isOpen || step() === "basics") return;

    const counts = sessionCounts();
    const launched = preLaunched();
    const newLaunched = { ...launched };
    let changed = false;

    for (const type of SESSION_TYPES) {
      if (type === "Browser") continue; // Spawning browser is instant in UI

      const targetCount = counts[type];
      const currentLaunched = launched[type];

      // Spawn if needed
      if (currentLaunched.length < targetCount) {
        const diff = targetCount - currentLaunched.length;
        for (let i = 0; i < diff; i++) {
          const tempId = `temp-${type}-${Math.random().toString(36).slice(2, 9)}`;
          const basePreset = PRESETS[type];
          if (basePreset) {
            const preset = { ...basePreset, id: tempId, cwd: selectedDir()! };
            // Add to store in background mode
            addSession(tempId, 0, preset, true);
            try {
              const pid = await spawnProcess(preset);
              updateSessionPid(tempId, pid);
              newLaunched[type] = [...newLaunched[type], tempId];
              changed = true;
            } catch (e) {
              terminateSession(tempId, 1);
            }
          }
        }
      } 
      // Kill if needed
      else if (currentLaunched.length > targetCount) {
        const diff = currentLaunched.length - targetCount;
        for (let i = 0; i < diff; i++) {
          const idToKill = newLaunched[type][newLaunched[type].length - 1];
          newLaunched[type] = newLaunched[type].slice(0, -1);
          changed = true;
          killProcess(idToKill).catch(() => {});
          terminateSession(idToKill, 0);
        }
      }
    }

    if (changed) {
      setPreLaunched(newLaunched);
    }
  });

  // CLEANUP ON DISMISS
  const cleanupAllPreLaunched = async () => {
    const allIds = Object.values(preLaunched()).flat();
    for (const id of allIds) {
      killProcess(id).catch(() => {});
      terminateSession(id, 0);
    }
    setPreLaunched({ Gemini: [], Claude: [], Codex: [], OpenCode: [], WSL: [], Browser: [] });
  };

  createEffect(() => {
    if (props.isOpen) {
      setStep("basics");
    } else {
      cleanupAllPreLaunched();
    }
  });

  const handleLaunch = async () => {
    if (!selectedDir() || totalSessions() === 0) return;
    setIsLaunching(true);
    const sessionsToLaunch: WorkspaceLaunchItem[] = [];
    Object.entries(sessionCounts()).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) sessionsToLaunch.push(type as WorkspaceLaunchItem);
    });

    const preLaunchedIds = Object.values(preLaunched()).flat();

    try {
      if (settingsStore.rememberLastDirectory) localStorage.setItem(LAST_WORKING_DIR_KEY, selectedDir()!);
      await launchWorkspace(
        workspaceName() || settingsStore.defaultWorkspaceName, 
        selectedDir()!, 
        sessionsToLaunch, 
        url(),
        preLaunchedIds
      );
      // Neutralize preLaunched map as they are now "adopted"
      setPreLaunched({ Gemini: [], Claude: [], Codex: [], OpenCode: [], WSL: [], Browser: [] });
      props.onClose();
    } catch (_e) {
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCancel = () => {
    cleanupAllPreLaunched();
    props.onClose();
  };

  const updateCount = (type: SessionType, delta: number) => {
    setSessionCounts(prev => ({ ...prev, [type]: Math.max(0, prev[type] + delta) }));
  };

  const applyPreset = (preset: "pair" | "quad" | "browser-heavy") => {
    const counts: SessionCounts = { Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0 };
    if (preset === "pair") { counts.Gemini = 1; counts.Claude = 1; }
    if (preset === "quad") { counts.Gemini = 2; counts.Claude = 2; }
    if (preset === "browser-heavy") { counts.Browser = 1; counts.Gemini = 2; counts.Claude = 1; }
    setSessionCounts(counts);
  };

  const getGridDims = (count: number) => {
    if (count <= 1) return { cols: 1, rows: 1 };
    if (count <= 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 8) return { cols: 4, rows: 2 };
    if (count <= 12) return { cols: 4, rows: 3 };
    return { cols: Math.ceil(Math.sqrt(count)), rows: Math.ceil(count / Math.ceil(Math.sqrt(count))) };
  };

  return (
    <Show when={props.isOpen}>
      <div class="modal-overlay" onMouseDown={handleCancel}>
        <div class="launcher-modal" onMouseDown={(e) => e.stopPropagation()}>
          <header class="modal-header">
            <h3 style={{ "font-weight": "600", color: "var(--text-main)", margin: 0 }}>
              {step() === "basics" ? "New Workspace" : step() === "swarm" ? "Assemble your Swarm" : "Finalize Config"}
            </h3>
            <div class="step-indicators">
              <div class={`step-dot ${step() === "basics" ? "active" : ""}`} />
              <div class={`step-dot ${step() === "swarm" ? "active" : ""}`} />
              <div class={`step-dot ${step() === "config" ? "active" : ""}`} />
            </div>
          </header>

          <main class="modal-body">
            <Show when={step() === "basics"}>
              <div class="step-container">
                <div class="launcher-input-group">
                  <label class="launcher-label">Workspace Identity</label>
                  <input
                    type="text"
                    class="launcher-input"
                    placeholder="e.g. Project 'Lattice' Backend"
                    value={workspaceName()}
                    onInput={(e) => setWorkspaceName(e.currentTarget.value)}
                    autofocus
                  />
                </div>
                <div class="launcher-input-group">
                  <label class="launcher-label">Project Root</label>
                  <div class="launcher-dir-box">
                    <div class="launcher-dir-text">{selectedDir() || "Select a directory..."}</div>
                    <button class="btn-icon" onClick={() => open({ directory: true }).then(d => d && setSelectedDir(d as string))}>
                      Browse
                    </button>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={step() === "swarm"}>
              <div class="step-container">
                <div class="swarm-grid-preview" style={{
                  "grid-template-columns": `repeat(${getGridDims(totalSessions()).cols}, 1fr)`,
                  "grid-template-rows": `repeat(${getGridDims(totalSessions()).rows}, 1fr)`
                }}>
                  <For each={Object.entries(sessionCounts()).flatMap(([type, count]) => Array(count).fill(type))}>
                    {(type) => (
                      <div class="preview-tile">
                        {type[0].toUpperCase()}
                      </div>
                    )}
                  </For>
                  <Show when={totalSessions() === 0}>
                    <div style={{ "grid-column": "1/-1", display: "flex", "align-items": "center", "justify-content": "center", color: "rgba(255,255,255,0.2)", "font-size": "12px" }}>
                      Empty Swarm - Add agents below
                    </div>
                  </Show>
                </div>

                <div style={{ display: "flex", gap: "8px", "margin-bottom": "0.5rem" }}>
                  <span class="launcher-label">Quick Presets:</span>
                  <div class="preset-chip" onClick={() => applyPreset("pair")}>The Pair (1+1)</div>
                  <div class="preset-chip" onClick={() => applyPreset("quad")}>The Quad (2+2)</div>
                  <div class="preset-chip" onClick={() => applyPreset("browser-heavy")}>Web Dev</div>
                </div>

                <div class="agent-selector-palette">
                  <For each={SESSION_TYPES}>
                    {(type) => (
                      <div 
                        class={`agent-card-mini ${sessionCounts()[type] > 0 ? 'active' : ''}`}
                        onClick={() => updateCount(type, 1)}
                        onContextMenu={(e) => { e.preventDefault(); updateCount(type, -1); }}
                      >
                        <Show when={sessionCounts()[type] > 0}>
                          <div class="agent-badge-count">{sessionCounts()[type]}</div>
                        </Show>
                        <div style={{ color: sessionCounts()[type] > 0 ? "var(--accent-primary)" : "var(--text-muted)", transition: "color 0.2s" }}>
                          {AGENT_ICONS[type]}
                        </div>
                        <span style={{ "font-size": "11px", "font-weight": "500" }}>{type}</span>
                      </div>
                    )}
                  </For>
                </div>
                <p style={{ "font-size": "10px", color: "var(--text-muted)", "text-align": "center", "margin-top": "8px" }}>
                  Left-click to add, Right-click to remove.
                </p>
              </div>
            </Show>

            <Show when={step() === "config"}>
              <div class="step-container">
                <Show 
                  when={sessionCounts().Browser > 0}
                  fallback={<div style={{ "text-align": "center", color: "var(--text-muted)", padding: "2rem" }}>No extra configuration needed for this swarm.</div>}
                >
                  <div class="launcher-input-group">
                    <label class="launcher-label">Browser Start URL</label>
                    <input
                      type="text"
                      class="launcher-input"
                      placeholder="http://localhost:3000"
                      value={url()}
                      onInput={(e) => setUrl(e.currentTarget.value)}
                    />
                  </div>
                </Show>
                
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "1rem", "border-radius": "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span class="launcher-label" style={{ "margin-bottom": "8px", display: "block" }}>Configuration Summary</span>
                  <div style={{ "font-size": "12px", display: "grid", "grid-template-columns": "1fr 1fr", gap: "4px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Workspace:</span>
                    <span>{workspaceName() || "Unnamed"}</span>
                    <span style={{ color: "var(--text-muted)" }}>Total Sessions:</span>
                    <span>{totalSessions()} Agents</span>
                    <span style={{ color: "var(--text-muted)" }}>Root:</span>
                    <span style={{ "overflow": "hidden", "text-overflow": "ellipsis" }}>{selectedDir()?.split(/[\\/]/).pop()}</span>
                  </div>
                </div>
              </div>
            </Show>
          </main>

          <footer class="modal-footer">
            <div>
              <Show when={step() !== "basics"}>
                <button class="btn-secondary" onClick={() => setStep(step() === "config" ? "swarm" : "basics")}>
                  Back
                </button>
              </Show>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button class="btn-secondary" onClick={handleCancel}>Cancel</button>
              <Show 
                when={step() === "config"} 
                fallback={
                  <button 
                    class="btn-primary" 
                    disabled={step() === "basics" && (!selectedDir() || !workspaceName())}
                    onClick={() => setStep(step() === "basics" ? "swarm" : "config")}
                  >
                    Next Step
                  </button>
                }
              >
                <button 
                  class="btn-primary" 
                  disabled={totalSessions() === 0 || isLaunching()} 
                  onClick={handleLaunch}
                  style={{ background: "#238636" }}
                >
                  {isLaunching() ? "Launching..." : `Deploy Swarm`}
                </button>
              </Show>
            </div>
          </footer>
        </div>
      </div>
    </Show>
  );
};
