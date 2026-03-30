import { createStore } from "solid-js/store";

export const SESSION_TYPES = ["Gemini", "Claude", "Codex", "OpenCode", "WSL", "Browser", "Terminal"] as const;
export type SessionType = typeof SESSION_TYPES[number];

export const LAST_WORKING_DIR_KEY = "lattice:lastWorkingDirectory";
const SETTINGS_KEY = "lattice:settings";

export interface AppSettings {
  defaultWorkspaceName: string;
  defaultBrowserUrl: string;
  rememberLastDirectory: boolean;
  terminalFontSize: number;
  defaultShell: "PowerShell" | "CMD" | "WSL" | "Native";
  defaultSessionCounts: Record<SessionType, number>;
}

export const defaultSettings: AppSettings = {
  defaultWorkspaceName: "New Workspace",
  defaultBrowserUrl: "http://localhost:3000",
  rememberLastDirectory: true,
  terminalFontSize: 13,
  defaultShell: "PowerShell",
  defaultSessionCounts: {
    Gemini: 1,
    Claude: 1,
    Codex: 0,
    OpenCode: 0,
    WSL: 0,
    Browser: 0,
    Terminal: 0,
  },
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
    defaultSessionCounts: {
      Gemini: Math.max(0, Number(sessionCounts.Gemini ?? defaultSettings.defaultSessionCounts.Gemini)),
      Claude: Math.max(0, Number(sessionCounts.Claude ?? defaultSettings.defaultSessionCounts.Claude)),
      Codex: Math.max(0, Number(sessionCounts.Codex ?? defaultSettings.defaultSessionCounts.Codex)),
      OpenCode: Math.max(0, Number(sessionCounts.OpenCode ?? defaultSettings.defaultSessionCounts.OpenCode)),
      WSL: Math.max(0, Number(sessionCounts.WSL ?? defaultSettings.defaultSessionCounts.WSL)),
      Browser: Math.max(0, Number(sessionCounts.Browser ?? defaultSettings.defaultSessionCounts.Browser)),
      Terminal: Math.max(0, Number(sessionCounts.Terminal ?? defaultSettings.defaultSessionCounts.Terminal)),
    },
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
