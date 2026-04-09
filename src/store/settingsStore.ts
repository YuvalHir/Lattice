import { createStore } from "solid-js/store";
import type { RecentWorkspace } from "../types/schema";

export const SESSION_TYPES = ["Gemini", "Claude", "Codex", "OpenCode", "WSL", "Browser", "Terminal"] as const;
export type SessionType = typeof SESSION_TYPES[number];

export const LAST_WORKING_DIR_KEY = "lattice:lastWorkingDirectory";
const SETTINGS_KEY = "lattice:settings";

// Theme Definitions
export type ThemeId = "github-dark" | "dracula" | "monokai" | "nord" | "one-dark" | "github-light";

export interface ThemeColors {
  bgApp: string;
  bgSidebar: string;
  bgHeader: string;
  borderMain: string;
  borderActive: string;
  accentPrimary: string;
  accentSecondary: string;
  accentDanger: string;
  textMain: string;
  textMuted: string;
  terminalBg: string;
  terminalFg: string;
  terminalCursor: string;
  terminalSelection: string;
  terminalBlack: string;
  terminalRed: string;
  terminalGreen: string;
  terminalYellow: string;
  terminalBlue: string;
  terminalMagenta: string;
  terminalCyan: string;
  terminalWhite: string;
  terminalBrightBlack: string;
  terminalBrightRed: string;
  terminalBrightGreen: string;
  terminalBrightYellow: string;
  terminalBrightBlue: string;
  terminalBrightMagenta: string;
  terminalBrightCyan: string;
  terminalBrightWhite: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  colors: ThemeColors;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "github-dark",
    name: "GitHub Dark",
    description: "Professional dark theme inspired by GitHub",
    colors: {
      bgApp: "#0d1117",
      bgSidebar: "#161b22",
      bgHeader: "#161b22",
      borderMain: "#30363d",
      borderActive: "#58a6ff",
      accentPrimary: "#58a6ff",
      accentSecondary: "#8b949e",
      accentDanger: "#f85149",
      textMain: "#c9d1d9",
      textMuted: "#8b949e",
      terminalBg: "#0d1117",
      terminalFg: "#c9d1d9",
      terminalCursor: "#58a6ff",
      terminalSelection: "rgba(88, 166, 255, 0.3)",
      terminalBlack: "#0d1117",
      terminalRed: "#ff7b72",
      terminalGreen: "#7ee787",
      terminalYellow: "#e3b341",
      terminalBlue: "#79c0ff",
      terminalMagenta: "#d2a8ff",
      terminalCyan: "#a5d6ff",
      terminalWhite: "#f0f6fc",
      terminalBrightBlack: "#484f58",
      terminalBrightRed: "#ffa198",
      terminalBrightGreen: "#aff5b4",
      terminalBrightYellow: "#ffd470",
      terminalBrightBlue: "#a5d6ff",
      terminalBrightMagenta: "#f2b6ff",
      terminalBrightCyan: "#a5d6ff",
      terminalBrightWhite: "#ffffff",
    }
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Popular dark theme with vibrant colors",
    colors: {
      bgApp: "#282a36",
      bgSidebar: "#343746",
      bgHeader: "#282a36",
      borderMain: "#44475a",
      borderActive: "#bd93f9",
      accentPrimary: "#bd93f9",
      accentSecondary: "#6272a4",
      accentDanger: "#ff5555",
      textMain: "#f8f8f2",
      textMuted: "#6272a4",
      terminalBg: "#282a36",
      terminalFg: "#f8f8f2",
      terminalCursor: "#f8f8f2",
      terminalSelection: "rgba(68, 71, 90, 0.5)",
      terminalBlack: "#21222c",
      terminalRed: "#ff5555",
      terminalGreen: "#50fa7b",
      terminalYellow: "#f1fa8c",
      terminalBlue: "#bd93f9",
      terminalMagenta: "#ff79c6",
      terminalCyan: "#8be9fd",
      terminalWhite: "#f8f8f2",
      terminalBrightBlack: "#6272a4",
      terminalBrightRed: "#ff6e6e",
      terminalBrightGreen: "#69ff94",
      terminalBrightYellow: "#ffffa5",
      terminalBrightBlue: "#d6acff",
      terminalBrightMagenta: "#ff92df",
      terminalBrightCyan: "#a4ffff",
      terminalBrightWhite: "#ffffff",
    }
  },
  {
    id: "monokai",
    name: "Monokai",
    description: "Warm and vibrant coding theme",
    colors: {
      bgApp: "#272822",
      bgSidebar: "#1e1f1c",
      bgHeader: "#272822",
      borderMain: "#3e3d32",
      borderActive: "#a6e22e",
      accentPrimary: "#a6e22e",
      accentSecondary: "#75715e",
      accentDanger: "#f92672",
      textMain: "#f8f8f2",
      textMuted: "#75715e",
      terminalBg: "#272822",
      terminalFg: "#f8f8f2",
      terminalCursor: "#f8f8f2",
      terminalSelection: "rgba(73, 72, 62, 0.5)",
      terminalBlack: "#272822",
      terminalRed: "#f92672",
      terminalGreen: "#a6e22e",
      terminalYellow: "#f4bf75",
      terminalBlue: "#66d9ef",
      terminalMagenta: "#ae81ff",
      terminalCyan: "#a1efe4",
      terminalWhite: "#f8f8f2",
      terminalBrightBlack: "#75715e",
      terminalBrightRed: "#f92672",
      terminalBrightGreen: "#a6e22e",
      terminalBrightYellow: "#f4bf75",
      terminalBrightBlue: "#66d9ef",
      terminalBrightMagenta: "#ae81ff",
      terminalBrightCyan: "#a1efe4",
      terminalBrightWhite: "#f9f8f5",
    }
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic north-bluish color palette",
    colors: {
      bgApp: "#2e3440",
      bgSidebar: "#3b4252",
      bgHeader: "#3b4252",
      borderMain: "#4c566a",
      borderActive: "#88c0d0",
      accentPrimary: "#88c0d0",
      accentSecondary: "#d8dee9",
      accentDanger: "#bf616a",
      textMain: "#eceff4",
      textMuted: "#d8dee9",
      terminalBg: "#2e3440",
      terminalFg: "#eceff4",
      terminalCursor: "#eceff4",
      terminalSelection: "rgba(67, 76, 94, 0.5)",
      terminalBlack: "#3b4252",
      terminalRed: "#bf616a",
      terminalGreen: "#a3be8c",
      terminalYellow: "#ebcb8b",
      terminalBlue: "#81a1c1",
      terminalMagenta: "#b48ead",
      terminalCyan: "#88c0d0",
      terminalWhite: "#e5e9f0",
      terminalBrightBlack: "#4c566a",
      terminalBrightRed: "#bf616a",
      terminalBrightGreen: "#a3be8c",
      terminalBrightYellow: "#ebcb8b",
      terminalBrightBlue: "#81a1c1",
      terminalBrightMagenta: "#b48ead",
      terminalBrightCyan: "#8fbcbb",
      terminalBrightWhite: "#eceff4",
    }
  },
  {
    id: "one-dark",
    name: "One Dark",
    description: "Atom's iconic dark theme",
    colors: {
      bgApp: "#282c34",
      bgSidebar: "#21252b",
      bgHeader: "#282c34",
      borderMain: "#3e4451",
      borderActive: "#61afef",
      accentPrimary: "#61afef",
      accentSecondary: "#5c6370",
      accentDanger: "#e06c75",
      textMain: "#abb2bf",
      textMuted: "#5c6370",
      terminalBg: "#282c34",
      terminalFg: "#abb2bf",
      terminalCursor: "#61afef",
      terminalSelection: "rgba(97, 175, 239, 0.3)",
      terminalBlack: "#282c34",
      terminalRed: "#e06c75",
      terminalGreen: "#98c379",
      terminalYellow: "#e5c07b",
      terminalBlue: "#61afef",
      terminalMagenta: "#c678dd",
      terminalCyan: "#56b6c2",
      terminalWhite: "#abb2bf",
      terminalBrightBlack: "#5c6370",
      terminalBrightRed: "#e06c75",
      terminalBrightGreen: "#98c379",
      terminalBrightYellow: "#e5c07b",
      terminalBrightBlue: "#61afef",
      terminalBrightMagenta: "#c678dd",
      terminalBrightCyan: "#56b6c2",
      terminalBrightWhite: "#ffffff",
    }
  },
  {
    id: "github-light",
    name: "GitHub Light",
    description: "Clean and professional light theme",
    colors: {
      bgApp: "#ffffff",
      bgSidebar: "#f6f8fa",
      bgHeader: "#f6f8fa",
      borderMain: "#d0d7de",
      borderActive: "#0969da",
      accentPrimary: "#0969da",
      accentSecondary: "#57606a",
      accentDanger: "#cf222e",
      textMain: "#1f2328",
      textMuted: "#656d76",
      terminalBg: "#f6f8fa",
      terminalFg: "#1f2328",
      terminalCursor: "#0969da",
      terminalSelection: "rgba(9, 105, 218, 0.2)",
      terminalBlack: "#24292f",
      terminalRed: "#cf222e",
      terminalGreen: "#1a7f37",
      terminalYellow: "#9a6700",
      terminalBlue: "#0969da",
      terminalMagenta: "#8250df",
      terminalCyan: "#1b7c83",
      terminalWhite: "#1f2328",
      terminalBrightBlack: "#57606a",
      terminalBrightRed: "#a40e26",
      terminalBrightGreen: "#2da44e",
      terminalBrightYellow: "#bf8700",
      terminalBrightBlue: "#218bff",
      terminalBrightMagenta: "#a475f9",
      terminalBrightCyan: "#3192aa",
      terminalBrightWhite: "#1f2328",
    }
  },
];

export const DEFAULT_THEME_ID: ThemeId = "github-dark";

export function getThemeById(themeId: ThemeId): ThemeDefinition {
  return THEMES.find(t => t.id === themeId) || THEMES.find(t => t.id === DEFAULT_THEME_ID)!;
}

export interface AppSettings {
  defaultWorkspaceName: string;
  defaultBrowserUrl: string;
  rememberLastDirectory: boolean;
  terminalFontSize: number;
  defaultShell: "PowerShell" | "CMD" | "WSL" | "Native";
  theme: ThemeId;
  defaultSessionCounts: Record<SessionType, number>;
  recentWorkspaces: RecentWorkspace[];
}

export const defaultSettings: AppSettings = {
  defaultWorkspaceName: "New Workspace",
  defaultBrowserUrl: "http://localhost:3000",
  rememberLastDirectory: true,
  terminalFontSize: 13,
  defaultShell: "PowerShell",
  theme: DEFAULT_THEME_ID,
  defaultSessionCounts: {
    Gemini: 1,
    Claude: 1,
    Codex: 0,
    OpenCode: 0,
    WSL: 0,
    Browser: 0,
    Terminal: 0,
  },
  recentWorkspaces: [],
};

function sanitizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") {
    return { ...defaultSettings };
  }

  const candidate = raw as Partial<AppSettings>;
  const sessionCounts =
    (candidate.defaultSessionCounts as Partial<Record<SessionType, unknown>> | undefined) ?? {};

  return {
    defaultWorkspaceName:
      typeof candidate.defaultWorkspaceName === "string"
        ? candidate.defaultWorkspaceName
        : defaultSettings.defaultWorkspaceName,
    defaultBrowserUrl:
      typeof candidate.defaultBrowserUrl === "string"
        ? candidate.defaultBrowserUrl
        : defaultSettings.defaultBrowserUrl,
    rememberLastDirectory:
      typeof candidate.rememberLastDirectory === "boolean"
        ? candidate.rememberLastDirectory
        : defaultSettings.rememberLastDirectory,
    terminalFontSize:
      typeof candidate.terminalFontSize === "number"
        ? Math.min(24, Math.max(10, Math.round(candidate.terminalFontSize)))
        : defaultSettings.terminalFontSize,
    defaultShell:
      typeof candidate.defaultShell === "string" &&
      ["PowerShell", "CMD", "WSL", "Native"].includes(candidate.defaultShell)
        ? (candidate.defaultShell as any)
        : defaultSettings.defaultShell,
    theme:
      typeof candidate.theme === "string" &&
      THEMES.some(t => t.id === candidate.theme)
        ? (candidate.theme as ThemeId)
        : DEFAULT_THEME_ID,
    defaultSessionCounts: {
      Gemini: Math.max(0, Number(sessionCounts.Gemini ?? defaultSettings.defaultSessionCounts.Gemini)),
      Claude: Math.max(0, Number(sessionCounts.Claude ?? defaultSettings.defaultSessionCounts.Claude)),
      Codex: Math.max(0, Number(sessionCounts.Codex ?? defaultSettings.defaultSessionCounts.Codex)),
      OpenCode: Math.max(0, Number(sessionCounts.OpenCode ?? defaultSettings.defaultSessionCounts.OpenCode)),
      WSL: Math.max(0, Number(sessionCounts.WSL ?? defaultSettings.defaultSessionCounts.WSL)),
      Browser: Math.max(0, Number(sessionCounts.Browser ?? defaultSettings.defaultSessionCounts.Browser)),
      Terminal: Math.max(0, Number(sessionCounts.Terminal ?? defaultSettings.defaultSessionCounts.Terminal)),
    },
    recentWorkspaces: Array.isArray(candidate.recentWorkspaces) ? candidate.recentWorkspaces.filter(ws => ws.name && ws.cwd && ws.items) : [],
  };
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

function persist(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore persistence failures.
  }
}

const [store, setStore] = createStore<AppSettings>(loadSettings());
export const settingsStore = store;

export function updateSettings(next: AppSettings) {
  const sanitized = sanitizeSettings(next);
  setStore(sanitized);
  persist(sanitized);
}

export function setTerminalFontSize(size: number) {
  const next = { ...store, terminalFontSize: Math.min(24, Math.max(10, Math.round(size))) };
  updateSettings(next);
}

export function resetSettings() {
  updateSettings(defaultSettings);
}

export function addRecentWorkspace(name: string, cwd: string, items: string[], browserUrl?: string) {
  const newRecent: RecentWorkspace = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    cwd,
    items,
    browserUrl,
    lastUsed: new Date().toISOString()
  };

  // Check if same workspace exists (same name and cwd)
  const existingIndex = store.recentWorkspaces.findIndex(ws => ws.name === name && ws.cwd === cwd);
  let updatedWorkspaces = [...store.recentWorkspaces];
  
  if (existingIndex !== -1) {
    // Remove existing and add to front with new timestamp
    updatedWorkspaces.splice(existingIndex, 1);
  }
  
  updatedWorkspaces.unshift(newRecent);
  
  // Limit to top 5
  updatedWorkspaces = updatedWorkspaces.slice(0, 5);
  
  updateSettings({ ...store, recentWorkspaces: updatedWorkspaces });
}

export function removeRecentWorkspace(id: string) {
  const updatedWorkspaces = store.recentWorkspaces.filter(ws => ws.id !== id);
  updateSettings({ ...store, recentWorkspaces: updatedWorkspaces });
}

/**
 * Applies the specified theme to the application.
 * Updates CSS variables and persists the theme setting.
 */
export function applyTheme(themeId: ThemeId) {
  const theme = getThemeById(themeId);
  const root = document.documentElement;
  const colors = theme.colors;

  // Apply CSS variables to :root
  root.style.setProperty('--bg-app', colors.bgApp);
  root.style.setProperty('--bg-sidebar', colors.bgSidebar);
  root.style.setProperty('--bg-header', colors.bgHeader);
  root.style.setProperty('--border-main', colors.borderMain);
  root.style.setProperty('--border-active', colors.borderActive);
  root.style.setProperty('--accent-primary', colors.accentPrimary);
  root.style.setProperty('--accent-secondary', colors.accentSecondary);
  root.style.setProperty('--accent-danger', colors.accentDanger);
  root.style.setProperty('--text-main', colors.textMain);
  root.style.setProperty('--text-muted', colors.textMuted);

  // Update the settings store
  updateSettings({ ...store, theme: themeId });
}

/**
 * Gets the current theme definition from the store.
 */
export function getCurrentTheme(): ThemeDefinition {
  return getThemeById(store.theme);
}
