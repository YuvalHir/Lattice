import { createSignal, Show, For, onMount } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { PRESETS, launchWorkspace } from "../services/ipc";

interface LauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LauncherModal = (props: LauncherModalProps) => {
  const [selectedDir, setSelectedDir] = createSignal<string | null>(null);
  const [isLaunching, setIsLaunching] = createSignal(false);
  
  // Track counts for each agent type
  const [agentCounts, setAgentCounts] = createSignal<Record<string, number>>({
    Gemini: 1,
    Claude: 1,
    Codex: 0,
    OpenCode: 0,
    WSL: 0
  });

  const totalAgents = () => Object.values(agentCounts()).reduce((a, b) => a + b, 0);

  const gridLayoutPreview = () => {
    const total = totalAgents();
    if (total <= 1) return "1x1 Grid";
    if (total === 2) return "1x2 Split";
    if (total === 3) return "T-Split (1 Top, 2 Bottom)";
    if (total === 4) return "2x2 Grid";
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);
    return `${rows}x${cols} Dynamic Tiling`;
  };

  onMount(async () => {
    try {
      const home = await homeDir();
      setSelectedDir(home);
    } catch (e) {
      console.error("Failed to get home directory:", e);
    }
  });

  const handleSelectDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Directory"
    });
    if (selected && typeof selected === "string") {
      setSelectedDir(selected);
    }
  };

  const applyPreset = (count: number) => {
    const newCounts = { Gemini: 0, Claude: 0, Codex: 0, OpenCode: 0, WSL: 0 };
    // Simple distribution logic: half Gemini, half Claude
    newCounts.Gemini = Math.ceil(count / 2);
    newCounts.Claude = Math.floor(count / 2);
    setAgentCounts(newCounts);
  };

  const updateCount = (key: string, delta: number) => {
    setAgentCounts(prev => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta)
    }));
  };

  const handleBatchLaunch = async () => {
    if (!selectedDir() || totalAgents() === 0) return;
    
    setIsLaunching(true);
    const agentsToLaunch: (keyof typeof PRESETS)[] = [];
    
    Object.entries(agentCounts()).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) {
        agentsToLaunch.push(type as any);
      }
    });

    console.log(`[WORKSPACE] Swarm deployment: ${agentsToLaunch.join(", ")} in ${selectedDir()}`);

    try {
      await launchWorkspace(selectedDir()!, agentsToLaunch);
      props.onClose();
    } catch (e) {
      console.error("[WORKSPACE] Batch launch failed:", e);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="modal-overlay">
        <div class="launcher-modal glass-panel" style={{ width: "600px", "max-height": "90vh", "overflow-y": "auto" }}>
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
            <h3 style={{ color: "var(--primary)", "margin-bottom": "0" }}>Lattice Swarm Launcher</h3>
            <span style={{ "font-size": "0.8rem", color: "var(--text-dim)" }}>{gridLayoutPreview()}</span>
          </div>
          
          <div class="modal-section">
            <label>Target Directory</label>
            <div class="dir-selector">
              <input type="text" value={selectedDir() || "No directory selected"} readOnly />
              <button onClick={handleSelectDir}>Browse</button>
            </div>
          </div>

          <div class="modal-section">
            <label>Quick Presets</label>
            <div style={{ display: "flex", gap: "0.5rem", "flex-wrap": "wrap" }}>
              <For each={[1, 4, 6, 8, 12]}>
                {(count) => (
                  <button 
                    class="secondary" 
                    style={{ "flex": 1, "min-width": "60px", "padding": "8px" }}
                    onClick={() => applyPreset(count)}
                  >
                    {count}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="modal-section">
            <label>Custom Swarm Composition</label>
            <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "1rem" }}>
              <For each={Object.keys(agentCounts())}>
                {(key) => (
                  <div class="count-item" style={{ background: "rgba(255,255,255,0.02)", padding: "8px", "border-radius": "8px" }}>
                    <span style={{ "font-size": "0.9rem" }}>{key}</span>
                    <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
                      <button class="secondary" style={{ padding: "2px 8px" }} onClick={() => updateCount(key, -1)}>-</button>
                      <span style={{ "min-width": "20px", "text-align": "center", "font-weight": "bold" }}>{agentCounts()[key]}</span>
                      <button class="secondary" style={{ padding: "2px 8px" }} onClick={() => updateCount(key, 1)}>+</button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="modal-actions" style={{ "margin-top": "2rem" }}>
            <button class="secondary" onClick={props.onClose}>Cancel</button>
            <button class="primary" disabled={!selectedDir() || totalAgents() === 0 || isLaunching()} onClick={handleBatchLaunch}>
              {isLaunching() ? "Deploying Swarm..." : `Deploy ${totalAgents()} Agents`}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
