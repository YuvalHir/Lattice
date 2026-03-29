import { createSignal, createEffect, For, Show } from "solid-js";
import { sessionStore } from "../store/sessionStore";
import { 
  getGitInfo, 
  gitStatus, 
  gitAdd, 
  gitAddAll,
  gitUnstage, 
  gitCommit, 
  gitPush, 
  gitInit, 
  getGitLog,
  type GitFileStatus, 
  type GitInfo,
  type GitCommit as GitCommitType
} from "../services/ipc";

export const SourceControlPanel = () => {
  const [gitInfo, setGitInfo] = createSignal<GitInfo | null>(null);
  const [statusList, setStatusList] = createSignal<GitFileStatus[]>([]);
  const [commitLog, setCommitLog] = createSignal<GitCommitType[]>([]);
  const [commitMessage, setCommitMessage] = createSignal("");
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [isPushOffered, setIsPushOffered] = createSignal(false);

  const activeWorkspace = () => 
    sessionStore.workspaces.find(w => w.id === sessionStore.activeWorkspaceId);

  const refreshStatus = async () => {
    const ws = activeWorkspace();
    
    // Reset state before fetching new data
    setGitInfo(null);
    setStatusList([]);
    setCommitLog([]);
    setError(null);

    if (!ws) return;

    console.log(`[SCM] Refreshing status for workspace: ${ws.name} (${ws.cwd})`);
    setIsRefreshing(true);
    try {
      const info = await getGitInfo(ws.cwd);
      console.log(`[SCM] Git Info for ${ws.name}:`, info);
      setGitInfo(info);
      if (info.is_repo) {
        const [statuses, log] = await Promise.all([
          gitStatus(ws.cwd),
          getGitLog(ws.cwd)
        ]);
        console.log(`[SCM] Statuses found: ${statuses.length}, Commits: ${log.length}`);
        setStatusList(statuses);
        setCommitLog(log);
        
        // If there are changes, reset the push offering
        if (statuses.length > 0) {
          setIsPushOffered(false);
        }
      }
    } catch (e: any) {
      console.error(`[SCM] Error refreshing ${ws.name}:`, e);
      setError(e.toString());
    } finally {
      setIsRefreshing(false);
    }
  };

  createEffect(() => {
    // We track both the active ID and the workspaces array to ensure we refresh 
    // whenever a workspace is added or switched.
    if (sessionStore.isSourceControlOpen && sessionStore.activeWorkspaceId && sessionStore.workspaces.length >= 0) {
      refreshStatus();
    }
  });

  const handleStage = async (path: string) => {
    const ws = activeWorkspace();
    if (!ws) return;
    try {
      await gitAdd(ws.cwd, path);
      refreshStatus();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleStageAll = async () => {
    const ws = activeWorkspace();
    if (!ws) return;
    try {
      await gitAddAll(ws.cwd);
      refreshStatus();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleUnstage = async (path: string) => {
    const ws = activeWorkspace();
    if (!ws) return;
    try {
      await gitUnstage(ws.cwd, path);
      refreshStatus();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleCommit = async () => {
    const ws = activeWorkspace();
    if (!ws || !commitMessage().trim()) return;
    try {
      await gitCommit(ws.cwd, commitMessage().trim());
      setCommitMessage("");
      await refreshStatus();
      // Offer push immediately after a successful commit
      setIsPushOffered(true);
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handlePush = async () => {
    const ws = activeWorkspace();
    if (!ws) return;
    try {
      await gitPush(ws.cwd);
      await refreshStatus();
      // Push complete, remove the offer
      setIsPushOffered(false);
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleInit = async () => {
    const ws = activeWorkspace();
    if (!ws) return;
    try {
      await gitInit(ws.cwd);
      refreshStatus();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const stagedFiles = () => statusList().filter(s => s.staged);
  const unstagedFiles = () => statusList().filter(s => !s.staged);

  return (
    <aside 
      class="source-control-panel-right"
      style={{
        width: sessionStore.isSourceControlOpen ? "320px" : "0px",
        display: "flex",
        "flex-direction": "column",
        background: "var(--bg-sidebar)",
        "border-left": sessionStore.isSourceControlOpen ? "1px solid var(--border-main)" : "none",
        transition: "width 0.2s ease, border-left 0.2s ease",
        overflow: "hidden",
        "z-index": 100,
      }}
    >
      <header style={{ 
        padding: "12px 16px", 
        display: "flex", 
        "justify-content": "space-between", 
        "align-items": "center",
        height: "48px",
        "border-bottom": "1px solid var(--border-main)",
        "white-space": "nowrap"
      }}>
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <span style={{ "font-size": "11px", "font-weight": "600", color: "var(--text-muted)", "text-transform": "uppercase" }}>Source Control</span>
          <Show when={gitInfo()?.branch}>
            <span style={{ "font-size": "10px", padding: "1px 6px", background: "rgba(88, 166, 255, 0.1)", color: "var(--accent-primary)", "border-radius": "4px", "font-weight": "500" }}>
              {gitInfo()?.branch}
            </span>
          </Show>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button 
            title="Refresh"
            onClick={refreshStatus} 
            class="git-icon-btn"
            style={{ opacity: isRefreshing() ? 0.5 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
          <button title="Push" onClick={handlePush} class="git-icon-btn">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </button>
        </div>
      </header>

      <div class="panel-body" style={{ flex: 1, padding: "12px", display: "flex", "flex-direction": "column", overflow: "hidden" }}>
        <Show 
          when={gitInfo()?.is_repo}
          fallback={
            <div style={{ "text-align": "center", padding: "2rem 1rem" }}>
              <div style={{ opacity: 0.3, "margin-bottom": "1rem" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                   <circle cx="18" cy="18" r="3"></circle>
                   <circle cx="6" cy="6" r="3"></circle>
                   <path d="M6 9v7a3 3 0 0 0 3 3h3"></path>
                   <line x1="18" y1="9" x2="18" y2="15"></line>
                </svg>
              </div>
              <p style={{ "font-size": "13px", color: "var(--text-muted)", "margin-bottom": "1.5rem" }}>
                This workspace is not a git repository yet.
              </p>
              <button class="btn-primary" style={{ width: "100%" }} onClick={handleInit}>
                Initialize Repository
              </button>
            </div>
          }
        >
          {/* STATIC TOP SECTION */}
          <div style={{ "margin-bottom": "16px", flex: "0 0 auto" }}>
            <textarea
              placeholder="Commit Message (Ctrl+Enter to commit)"
              value={commitMessage()}
              onInput={(e) => setCommitMessage(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.ctrlKey && e.key === "Enter") handleCommit();
              }}
              style={{
                width: "100%",
                height: "80px",
                background: "var(--bg-app)",
                border: "1px solid var(--border-main)",
                "border-radius": "4px",
                color: "var(--text-main)",
                padding: "10px",
                "font-size": "13px",
                outline: "none",
                resize: "none",
                "font-family": "inherit"
              }}
            />
            <Show 
              when={(stagedFiles().length > 0 || unstagedFiles().length > 0) || !isPushOffered()}
              fallback={
                <button 
                  class="btn-primary" 
                  style={{ width: "100%", "margin-top": "8px", background: "var(--accent-primary)" }}
                  onClick={handlePush}
                >
                  Push Changes
                </button>
              }
            >
              <button 
                class="btn-primary" 
                style={{ width: "100%", "margin-top": "8px" }}
                disabled={!commitMessage().trim() || stagedFiles().length === 0}
                onClick={handleCommit}
              >
                Commit
              </button>
            </Show>
          </div>

          <Show when={error()}>
            <div style={{ color: "#f85149", "font-size": "11px", "margin-bottom": "12px", padding: "10px", background: "rgba(248, 81, 73, 0.1)", "border-radius": "4px", "border": "1px solid rgba(248, 81, 73, 0.2)" }}>
              {error()}
            </div>
          </Show>

          {/* CHANGES SECTIONS - SCROLLABLE IF NEEDED BUT KEEPING COMMIT HISTORY SEPARATE */}
          <div style={{ flex: "0 1 auto", overflow: "hidden auto", "margin-bottom": "16px" }} class="scm-changes-list custom-scrollbar">
            <div class="scm-section">
              <div class="scm-section-header">STAGED CHANGES ({stagedFiles().length})</div>
              <For each={stagedFiles()}>
                {(file) => (
                  <div class="scm-file-item">
                    <span class={`scm-status-icon status-${file.status}`}>{file.status}</span>
                    <span class="scm-file-path">{file.path}</span>
                    <button class="scm-action-btn" onClick={() => handleUnstage(file.path)} title="Unstage individual file">
                      -
                    </button>
                  </div>
                )}
              </For>
              <Show when={stagedFiles().length === 0}>
                 <div style={{ "font-size": "11px", color: "rgba(255,255,255,0.2)", padding: "4px 8px" }}>No staged changes</div>
              </Show>
            </div>

            <div class="scm-section" style={{ "margin-top": "20px" }}>
              <div class="scm-section-header" style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                <span>CHANGES ({unstagedFiles().length})</span>
                <button 
                  onClick={handleStageAll} 
                  title="Stage All Changes"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--accent-primary)",
                    cursor: "pointer",
                    padding: "0 4px",
                    "font-size": "16px",
                    display: "flex",
                    "align-items": "center"
                  }}
                >
                  +
                </button>
              </div>
              <For each={unstagedFiles()}>
                {(file) => (
                  <div class="scm-file-item">
                    <span class={`scm-status-icon status-${file.status}`}>{file.status}</span>
                    <span class="scm-file-path">{file.path}</span>
                    <button class="scm-action-btn" onClick={() => handleStage(file.path)} title="Stage individual file">
                      +
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* COMMIT HISTORY SECTION - PRIMARY SCROLL AREA */}
          <div style={{ flex: 1, "border-top": "1px solid var(--border-main)", "padding-top": "16px", display: "flex", "flex-direction": "column", overflow: "hidden" }}>
            <div class="scm-section-header">RECENT COMMITS</div>
            <div class="scm-history-scroll custom-scrollbar" style={{ flex: 1, "overflow-y": "auto", "padding-right": "4px" }}>
              <For each={commitLog()}>
                {(commit) => (
                  <div class="scm-commit-item" style={{
                    padding: "8px",
                    "border-radius": "4px",
                    cursor: "pointer",
                    transition: "background 0.1s ease",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "4px"
                  }}>
                    <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                      <span style={{ "font-size": "11px", "font-weight": "600", color: "var(--accent-primary)", "font-family": "monospace" }}>{commit.hash}</span>
                      <span style={{ "font-size": "10px", color: "var(--text-muted)" }}>{commit.date}</span>
                    </div>
                    <div style={{ "font-size": "12px", color: "var(--text-main)", "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                      {commit.message}
                    </div>
                    <div style={{ "font-size": "10px", color: "var(--text-muted)", opacity: 0.7 }}>
                      By {commit.author}
                    </div>
                  </div>
                )}
              </For>
              <Show when={commitLog().length === 0}>
                 <div style={{ "font-size": "11px", color: "rgba(255,255,255,0.2)", padding: "4px 8px" }}>No commit history found</div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </aside>
  );
};
