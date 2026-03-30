import { createSignal, createEffect, For, Show, onMount } from "solid-js";
import { sessionStore } from "../store/sessionStore";
import { readDir, BaseDirectory } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

// Professional Icon Pack - Using VS and OC which are more stable
import { 
  VsFolder, 
  VsFolderOpened, 
  VsFileBinary, 
  VsFileCode, 
  VsFilePdf, 
  VsFileMedia, 
  VsJson,
  VsSymbolNamespace,
  VsSettingsGear,
  VsMarkdown
} from 'solid-icons/vs';
import { 
  SiRust, 
  SiPython, 
  SiTypescript, 
  SiJavascript, 
  SiVite, 
  SiNodedotjs, 
  SiReact, 
  SiGit, 
  SiDocker, 
  SiHtml5,
  SiTailwindcss,
  SiPrettier,
  SiEslint,
  SiYaml,
  SiCss
} from 'solid-icons/si';
import { OcFilezip2 } from 'solid-icons/oc';

interface FileItem {
  name: string;
  path: string; // Full absolute path
  isDirectory: boolean;
  isExpanded: boolean;
  depth: number;
}

const FileIcon = (props: { name: string, isDirectory: boolean, isExpanded?: boolean }) => {
  const name = props.name.toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase();
  
  if (props.isDirectory) {
    return (
      <div style={{ display: "flex", "align-items": "center", "justify-content": "center", width: "16px", height: "16px", color: "var(--accent-primary)" }}>
        {props.isExpanded ? <VsFolderOpened size={16} /> : <VsFolder size={16} />}
      </div>
    );
  }

  // BRANDED LOGOS & SPECIFIC CONFIGS
  if (name === 'package.json') return <SiNodedotjs color="#339933" size={14} />;
  if (name === 'cargo.toml' || name === 'cargo.lock') return <SiRust color="#DEA584" size={14} />;
  if (name.includes('vite.config')) return <SiVite color="#646CFF" size={14} />;
  if (name === 'tsconfig.json') return <SiTypescript color="#3178C6" size={14} />;
  if (name.includes('tailwind.config')) return <SiTailwindcss color="#06B6D4" size={14} />;
  if (name.includes('prettier')) return <SiPrettier color="#F7B93E" size={14} />;
  if (name.includes('eslint')) return <SiEslint color="#4B32C3" size={14} />;
  if (name === '.gitignore' || name.startsWith('.git/')) return <SiGit color="#F05032" size={14} />;
  if (name.includes('dockerfile') || name.includes('docker-compose')) return <SiDocker color="#2496ED" size={14} />;

  // EXTENSIONS
  switch (ext) {
    case 'ts': return <SiTypescript color="#3178C6" size={14} />;
    case 'tsx': return <SiReact color="#61DAFB" size={14} />;
    case 'js': return <SiJavascript color="#F7DF1E" size={14} />;
    case 'jsx': return <SiReact color="#61DAFB" size={14} />;
    case 'rs': return <SiRust color="#DEA584" size={14} />;
    case 'py': return <SiPython color="#3776AB" size={14} />;
    case 'json': return <VsJson color="#CBCB41" size={14} />;
    case 'md': return <VsMarkdown color="#8B949E" size={14} />;
    case 'css': return <SiCss color="#1572B6" size={14} />;
    case 'html': return <SiHtml5 color="#E34C26" size={14} />;
    case 'yaml':
    case 'yml': return <SiYaml color="#CB171E" size={14} />;
    case 'zip':
    case 'gz':
    case 'tar': return <OcFilezip2 color="#8B949E" size={14} />;
    case 'pdf': return <VsFilePdf color="#F40F02" size={14} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif': return <VsFileMedia color="#C2C2C2" size={14} />;
    case 'exe':
    case 'dll':
    case 'bin': return <VsFileBinary color="#8B949E" size={14} />;
    default:
      return (
        <div style={{ opacity: 0.6, display: "flex", "align-items": "center", "justify-content": "center" }}>
          <VsFileCode size={14} />
        </div>
      );
  }
};

export const FileExplorerPanel = () => {
  const [files, setFiles] = createSignal<FileItem[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const activeWorkspace = () => 
    sessionStore.workspaces.find(w => w.id === sessionStore.activeWorkspaceId);

  const loadDirectory = async (dirPath: string, depth = 0): Promise<FileItem[]> => {
    try {
      const entries = await readDir(dirPath);
      const items: FileItem[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.github') continue;
        if (entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist' || entry.name === '.git') continue;

        const fullPath = await join(dirPath, entry.name);
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory,
          isExpanded: false,
          depth
        });
      }

      return items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err: any) {
      console.error("Failed to read directory:", err);
      throw err;
    }
  };

  const refreshFiles = async () => {
    const ws = activeWorkspace();
    if (!ws) {
      setFiles([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const rootFiles = await loadDirectory(ws.cwd);
      setFiles(rootFiles);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setIsLoading(false);
    }
  };

  createEffect(() => {
    if (sessionStore.isExplorerOpen && sessionStore.activeWorkspaceId && sessionStore.workspaces.length >= 0) {
      refreshFiles();
    }
  });

  const toggleExpand = async (item: FileItem, index: number) => {
    if (!item.isDirectory) return;

    const newFiles = [...files()];
    const target = newFiles[index];

    if (target.isExpanded) {
      // Collapse
      let count = 0;
      for (let i = index + 1; i < newFiles.length; i++) {
        if (newFiles[i].depth > target.depth) {
          count++;
        } else {
          break;
        }
      }
      newFiles.splice(index + 1, count);
      target.isExpanded = false;
      setFiles(newFiles);
    } else {
      // Expand
      try {
        const children = await loadDirectory(target.path, target.depth + 1);
        newFiles.splice(index + 1, 0, ...children);
        target.isExpanded = true;
        setFiles(newFiles);
      } catch (err) {
        console.error("Expand failed", err);
      }
    }
  };

  return (
    <aside 
      class="file-explorer-panel"
      style={{
        width: sessionStore.isExplorerOpen ? "260px" : "0px",
        display: "flex",
        "flex-direction": "column",
        background: "var(--bg-sidebar)",
        "border-right": sessionStore.isExplorerOpen ? "1px solid var(--border-main)" : "none",
        transition: "width 0.2s ease, border-right 0.2s ease",
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
        <span style={{ "font-size": "11px", "font-weight": "600", color: "var(--text-muted)", "text-transform": "uppercase" }}>Explorer</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <button 
            title="Refresh"
            onClick={refreshFiles} 
            class="git-icon-btn"
            style={{ opacity: isLoading() ? 0.5 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>
      </header>

      <div class="panel-body custom-scrollbar" style={{ flex: 1, "overflow-y": "auto", "overflow-x": "hidden", padding: "8px 0" }}>
        <Show when={error()}>
          <div style={{ padding: "10px", color: "#f85149", "font-size": "12px" }}>{error()}</div>
        </Show>
        
        <Show when={files().length === 0 && !isLoading() && !error()}>
          <div style={{ padding: "20px", "text-align": "center", color: "var(--text-muted)", "font-size": "12px" }}>
            No files found in workspace.
          </div>
        </Show>

        <For each={files()}>
          {(file, index) => (
            <div 
              onClick={() => toggleExpand(file, index())}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "8px",
                padding: "4px 16px",
                "padding-left": `${16 + file.depth * 12}px`,
                cursor: "pointer",
                "font-size": "13px",
                color: "var(--text-main)",
                transition: "background 0.1s ease",
                "white-space": "nowrap",
                overflow: "hidden",
                "text-overflow": "ellipsis",
                opacity: file.name.startsWith('.') ? 0.5 : 1
              }}
              class="explorer-item"
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <FileIcon name={file.name} isDirectory={file.isDirectory} isExpanded={file.isExpanded} />
              <span style={{ "text-overflow": "ellipsis", "overflow": "hidden" }}>{file.name}</span>
            </div>
          )}
        </For>
      </div>
      
      <Show when={activeWorkspace()}>
        <footer style={{ 
          padding: "8px 12px", 
          "border-top": "1px solid var(--border-main)", 
          "font-size": "10px", 
          color: "var(--text-muted)", 
          "overflow": "hidden", 
          "text-overflow": "ellipsis", 
          "white-space": "nowrap",
          background: "rgba(0,0,0,0.1)"
        }}>
          {activeWorkspace()?.cwd}
        </footer>
      </Show>
    </aside>
  );
};
