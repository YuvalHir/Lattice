import { createEffect, createSignal, For, Show, onMount, onCleanup, JSX, on } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { launchWorkspace, spawnProcess, killProcess, type WorkspaceLaunchItem, PRESETS } from "../services/ipc";
import type { ExecutionContext } from "../types/schema";
import {
  LAST_WORKING_DIR_KEY,
  SESSION_TYPES,
  settingsStore,
  type SessionType,
  addRecentWorkspace,
} from "../store/settingsStore";
import { addSession, terminateSession, updateSessionPid, removeSession, addSessionToWorkspace, addBrowserSession, sessionStore } from "../store/sessionStore";

interface LauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetWorkspaceId?: string | null;
}

type SessionCounts = Record<SessionType, number>;
type Step = "basics" | "swarm" | "config";
const PRELAUNCH_RETRY_BACKOFF_MS = 3000;

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
  Terminal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
};


export const LauncherModal = (props: LauncherModalProps) => {
  const [step, setStep] = createSignal<Step>("basics");

  // Initialize step and values if adding to existing workspace
  createEffect(() => {
    if (props.isOpen && props.targetWorkspaceId) {
      setStep("swarm");
      const ws = sessionStore.workspaces.find(w => w.id === props.targetWorkspaceId);
      if (ws) {
        setSelectedDir(ws.cwd);
        setWorkspaceName(ws.name);
        setSessionCounts({
          Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0, Terminal: 1
        });
      }
    } else if (props.isOpen) {
      setStep("basics");
      setSessionCounts({ ...settingsStore.defaultSessionCounts });
    }
  });

  const [selectedDir, setSelectedDir] = createSignal<string | null>(null);
  const [quickCd, setQuickCd] = createSignal("");
  const [cdError, setCdError] = createSignal(false);
  const [workspaceName, setWorkspaceName] = createSignal("");

  const handleQuickCd = async (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const val = quickCd().trim();
      if (val.startsWith('cd ')) {
        e.preventDefault();
        e.stopPropagation();
        const target = val.slice(3).trim();
        const currentCwd = selectedDir() || '';
        let nextPath = '';
        
        if (target === '..') {
          const parts = currentCwd.split(/[\\\/]/);
          if (parts.length > 1) {
            parts.pop();
            nextPath = parts.join(currentCwd.includes('/') ? '/' : '\\');
          }
        } else if (target.includes(':') || target.startsWith('/')) {
          nextPath = target;
        } else {
          const separator = currentCwd.includes('/') ? '/' : '\\';
          nextPath = `${currentCwd.replace(/[\\\/]$/, '')}${separator}${target}`;
        }

        if (nextPath) {
          try {
            const exists = await invoke<boolean>('check_directory_exists', { path: nextPath });
            if (exists) {
              setSelectedDir(nextPath);
              setQuickCd('');
              setCdError(false);
            } else {
              setCdError(true);
              setTimeout(() => setCdError(false), 1000);
            }
          } catch (err) {
            console.error("[LauncherModal] Directory check failed:", err);
            setCdError(true);
            setTimeout(() => setCdError(false), 1000);
          }
        }
      }
    }
  };
  const [url, setUrl] = createSignal("");
  const [isLaunching, setIsLaunching] = createSignal(false);
  const [sessionCounts, setSessionCounts] = createSignal<SessionCounts>({ ...settingsStore.defaultSessionCounts });
  
  const [preLaunched, setPreLaunched] = createSignal<Record<SessionType, string[]>>({
    Gemini: [], Claude: [], Codex: [], OpenCode: [], WSL: [], Browser: [], Terminal: []
  });

  const [shellOverrides, setShellOverrides] = createSignal<Record<SessionType, ExecutionContext>>({
    Gemini: "Native", 
    Claude: "Native", 
    Codex: "Native", 
    OpenCode: "Native", 
    WSL: "WSL", 
    Browser: "Native",
    Terminal: "Native"
  });
  
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [platform, setPlatform] = createSignal<string>("linux");
  
  // Track how many are currently in the process of spawning to prevent duplicates
  const [spawningCounts, setSpawningCounts] = createSignal<Record<SessionType, number>>({
    Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0, Terminal: 0
  });
  const [retryAfterTs, setRetryAfterTs] = createSignal<Record<SessionType, number>>({
    Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0, Terminal: 0
  });

  // Track the directory for which we've pre-launched agents
  const [preLaunchedCwd, setPreLaunchedCwd] = createSignal<string | null>(null);

  const totalSessions = () => Object.values(sessionCounts()).reduce((a, b) => a + b, 0);

  onMount(async () => {
    const home = await homeDir();
    const remembered = settingsStore.rememberLastDirectory ? localStorage.getItem(LAST_WORKING_DIR_KEY) : null;
    setSelectedDir(remembered || home);
    setWorkspaceName(settingsStore.defaultWorkspaceName);
    setUrl(settingsStore.defaultBrowserUrl);

    try {
      const p = await invoke<string>("get_platform");
      setPlatform(p);
    } catch (e) {
      console.error("[LauncherModal] Failed to get platform:", e);
    }
  });

  // PREDICTIVE LAUNCHING EFFECT
  createEffect(() => {
    if (!props.isOpen || step() === "basics" || isLaunching()) return;

    const currentDir = selectedDir();
    if (!currentDir) return;

    // If the directory changed, purge all stale pre-launched agents
    if (preLaunchedCwd() && preLaunchedCwd() !== currentDir) {
      console.log(`[LAUNCHER] Directory changed from ${preLaunchedCwd()} to ${currentDir}. Purging stale agents.`);
      cleanupAllPreLaunched();
      setPreLaunchedCwd(currentDir);
      return;
    }
    
    if (!preLaunchedCwd()) {
      setPreLaunchedCwd(currentDir);
    }

    const counts = sessionCounts();
    const launched = preLaunched();
    const spawning = spawningCounts();
    const overrides = shellOverrides();
    const retryAfter = retryAfterTs();
    const now = Date.now();

    for (const type of SESSION_TYPES) {
      // Gemini is intentionally excluded from predictive prelaunch.
      // Its startup TUI behaves more reliably when spawned directly
      // at workspace launch (foreground) instead of hidden prelaunch.
      if (type === "Browser" || type === "Gemini") continue;

      const targetCount = counts[type];
      const currentCount = launched[type].length + spawning[type];
      const canRetry = now >= retryAfter[type];

      if (currentCount < targetCount && canRetry) {
        const diff = targetCount - currentCount;
        for (let i = 0; i < diff; i++) {
          const tempId = `temp-${type}-${Math.random().toString(36).slice(2, 9)}`;
          const basePreset = PRESETS[type];
          if (basePreset) {
            const preset = { 
              ...basePreset, 
              id: tempId, 
              cwd: currentDir,
              context: overrides[type] || basePreset.context 
            };
            
            // Mark as spawning
            setSpawningCounts(prev => ({ ...prev, [type]: prev[type] + 1 }));
            addSession(tempId, 0, preset, true);
            
            spawnProcess(preset).then(pid => {
              updateSessionPid(tempId, pid);
              setRetryAfterTs(prev => ({ ...prev, [type]: 0 }));
              setPreLaunched(prev => ({ ...prev, [type]: [...prev[type], tempId] }));
            }).catch((err) => {
              // Failed prelaunch sessions are temporary; fully remove to avoid
              // unbounded dead-session growth in memory under repeated failures.
              removeSession(tempId);
              setRetryAfterTs(prev => ({ ...prev, [type]: Date.now() + PRELAUNCH_RETRY_BACKOFF_MS }));
              console.error(`[LAUNCHER] Prelaunch spawn failed for ${type}. Backing off ${PRELAUNCH_RETRY_BACKOFF_MS}ms.`, err);
            }).finally(() => {
              // Mark as no longer spawning
              setSpawningCounts(prev => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
            });
          }
        }
      } 
      else if (launched[type].length > targetCount) {
        const diff = launched[type].length - targetCount;
        for (let i = 0; i < diff; i++) {
          setPreLaunched(prev => {
            const list = [...prev[type]];
            const idToKill = list.pop();
            if (idToKill) {
              killProcess(idToKill).catch(() => {});
              terminateSession(idToKill, 0);
            }
            return { ...prev, [type]: list };
          });
        }
      }
    }
  });

  // Effect to purge pre-launched agents if shell overrides change
  createEffect(on(shellOverrides, () => {
    // React only when shell overrides themselves change.
    if (preLaunchedCwd()) {
      console.log("[LAUNCHER] Shell overrides changed. Purging pre-launched agents.");
      cleanupAllPreLaunched();
    }
  }, { defer: true }));

  // CLEANUP ON DISMISS
  const cleanupAllPreLaunched = async () => {
    const allIds = Object.values(preLaunched()).flat();
    for (const id of allIds) {
      killProcess(id).catch(() => {});
      terminateSession(id, 0);
    }
    setPreLaunched({ Gemini: [], Claude: [], Codex: [], OpenCode: [], WSL: [], Browser: [], Terminal: [] });
    setSpawningCounts({ Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0, Terminal: 0 });
    setRetryAfterTs({ Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0, Terminal: 0 });
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
    cleanupAllPreLaunched();
  });

  const handleLaunch = async () => {
    if (!selectedDir() || totalSessions() === 0) return;
    setIsLaunching(true);
    const sessionsToLaunch: WorkspaceLaunchItem[] = [];
    Object.entries(sessionCounts()).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) sessionsToLaunch.push(type as WorkspaceLaunchItem);
    });

    try {
      if (settingsStore.rememberLastDirectory) localStorage.setItem(LAST_WORKING_DIR_KEY, selectedDir()!);
      
      if (props.targetWorkspaceId) {
        // ADD TO EXISTING WORKSPACE
        console.log(`[LAUNCHER] Adding ${sessionsToLaunch.length} agents to workspace ${props.targetWorkspaceId}`);
        const workspaceId = props.targetWorkspaceId;
        const cwd = selectedDir()!;
        
        for (const item of sessionsToLaunch) {
          const sessionId = `${workspaceId}-added-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          if (item === 'Browser') {
            addBrowserSession(sessionId, url(), 'Browser');
            addSessionToWorkspace(workspaceId, sessionId);
          } else {
            const basePreset = PRESETS[item as keyof typeof PRESETS];
            if (basePreset) {
              const preset = { ...basePreset, id: sessionId, cwd };
              addSession(sessionId, 0, preset);
              addSessionToWorkspace(workspaceId, sessionId);
              spawnProcess(preset).then(pid => {
                updateSessionPid(sessionId, pid);
              }).catch(err => {
                console.error(`[LAUNCHER] Failed to spawn added agent ${item}:`, err);
                removeSession(sessionId);
              });
            }
          }
        }
      } else {
        // CREATE NEW WORKSPACE
        await launchWorkspace(
          workspaceName() || settingsStore.defaultWorkspaceName, 
          selectedDir()!, 
          sessionsToLaunch, 
          url(),
          preLaunched()
        );
        
        addRecentWorkspace(
          workspaceName() || settingsStore.defaultWorkspaceName,
          selectedDir()!,
          sessionsToLaunch,
          url()
        );
      }

      // Neutralize preLaunched map as they are now "adopted"
      setPreLaunched({ Gemini: [], Claude: [], Codex: [], OpenCode: [], WSL: [], Browser: [], Terminal: [] });
      props.onClose();
    } catch (e: any) {
      console.error("Launch failed:", e);
      setIsLaunching(false);
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

  const applyPreset = (preset: "pair" | "quad" | "browser-heavy" | "wsl-swarm") => {
    const counts: SessionCounts = { Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0, Browser: 0, Terminal: 1 };
    if (preset === "pair") { counts.Gemini = 1; counts.Claude = 1; }
    if (preset === "quad") { counts.Gemini = 2; counts.Claude = 2; }
    if (preset === "browser-heavy") { counts.Browser = 1; counts.Gemini = 2; counts.Claude = 1; }
    if (preset === "wsl-swarm") { counts.WSL = 4; }
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      // Don't trigger step transition if user is doing a quick cd
      if (quickCd().trim().startsWith('cd ')) return;

      e.preventDefault();
      if (step() === "basics" && selectedDir() && workspaceName()) {
        setStep("swarm");
      } else if (step() === "swarm") {
        setStep("config");
      } else if (step() === "config" && totalSessions() > 0 && !isLaunching()) {
        handleLaunch();
      }
    }
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

                <div class="launcher-input-group quick-cd">
                  <label class="launcher-label">Quick Navigation</label>
                  <div class="shell-input-wrapper" classList={{ 'error-shake': cdError() }}>
                    <span class="shell-prompt">$</span>
                    <input
                      type="text"
                      placeholder="cd folder_name"
                      value={quickCd()}
                      onInput={(e) => setQuickCd(e.currentTarget.value)}
                      onKeyDown={handleQuickCd}
                    />
                  </div>
                  <span class="hint" classList={{ 'error-text': cdError() }}>
                    {cdError() ? 'Directory not found!' : "Type 'cd ..' or 'cd folder' and press Enter to navigate."}
                  </span>
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
                  <span class="launcher-label">Presets:</span>
                  <div class="preset-chip" onClick={() => applyPreset("pair")}>Pair (1+1)</div>
                  <div class="preset-chip" onClick={() => applyPreset("quad")}>Quad (2+2)</div>
                  <div class="preset-chip" onClick={() => applyPreset("browser-heavy")}>Web</div>
                  <Show when={platform() === "windows"}>
                    <div class="preset-chip" onClick={() => applyPreset("wsl-swarm")}>WSL + Terminal</div>
                  </Show>
                </div>

                <div class="agent-selector-palette">
                  <For each={SESSION_TYPES}>
                    {(type) => (
                      <Show when={type !== "WSL" || platform() === "windows"}>
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
                      </Show>
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
                
                <div style={{ "margin-bottom": "1rem" }}>
                  <button 
                    onClick={() => setShowAdvanced(!showAdvanced())}
                    style={{ background: "transparent", border: "none", color: "var(--accent-primary)", "font-size": "11px", "font-weight": "600", cursor: "pointer", padding: 0 }}
                  >
                    {showAdvanced() ? "− Hide Advanced Options" : "+ Show Advanced Shell Overrides"}
                  </button>
                  
                  <Show when={showAdvanced()}>
                    <div style={{ "margin-top": "0.75rem", display: "flex", "flex-direction": "column", gap: "8px", background: "rgba(255,255,255,0.02)", padding: "10px", "border-radius": "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <span class="launcher-label" style={{ "font-size": "9px" }}>Per-Agent Shell Overrides</span>
                      <For each={SESSION_TYPES.filter(t => t !== "Browser" && sessionCounts()[t] > 0)}>
                        {(type) => (
                          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "8px" }}>
                            <span style={{ "font-size": "11px", "flex": 1 }}>{type} Shell:</span>
                            <select 
                              value={shellOverrides()[type]} 
                              onChange={(e) => setShellOverrides(prev => ({ ...prev, [type]: e.currentTarget.value as ExecutionContext }))}
                              style={{ background: "#0d1117", border: "1px solid var(--border-main)", color: "var(--text-main)", "font-size": "10px", padding: "2px 4px", "border-radius": "4px" }}
                            >
                              <option value="Native">Global Default</option>
                              <Show when={platform() === "windows"}>
                                <option value="PowerShell">PowerShell</option>
                                <option value="CMD">CMD</option>
                                <option value="WSL">WSL</option>
                              </Show>
                              <Show when={platform() !== "windows"}>
                                <option value="PowerShell">PowerShell (pwsh)</option>
                              </Show>
                            </select>
                          </div>
                        )}
                      </For>
                      <p style={{ "font-size": "9px", color: "var(--text-muted)", "margin": 0 }}>Changes here will purge and restart pre-launched agents.</p>
                    </div>
                  </Show>
                </div>

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
                  class="btn-success" 
                  disabled={totalSessions() === 0 || isLaunching()} 
                  onClick={handleLaunch}
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
