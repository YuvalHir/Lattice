import { createSignal, Show, For, createEffect } from "solid-js";
import {
  SESSION_TYPES,
  defaultSettings,
  resetSettings,
  settingsStore,
  updateSettings,
  THEMES,
  applyTheme,
  type AppSettings,
  type SessionType,
  type ThemeId,
} from "../store/settingsStore";
import { checkForUpdates } from "../init";
import { getVersion } from "@tauri-apps/api/app";

type SettingsCategory = "common" | "appearance" | "terminal" | "sessions" | "shortcuts" | "about";

interface SettingsPageProps {
  isActive: boolean;
  onClose: () => void;
}

const SETTINGS_CATEGORIES: { id: SettingsCategory; label: string; icon: string }[] = [
  { id: "common", label: "Common", icon: "⚙" },
  { id: "appearance", label: "Appearance", icon: "◑" },
  { id: "terminal", label: "Terminal", icon: "▮" },
  { id: "sessions", label: "Sessions", icon: "◫" },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: "⌨" },
  { id: "about", label: "About", icon: "ⓘ" },
];

export const SettingsPage = (props: SettingsPageProps) => {
  const [activeCategory, setActiveCategory] = createSignal<SettingsCategory>("common");
  const [draft, setDraft] = createSignal<AppSettings>({ ...settingsStore });
  const [appVersion, setAppVersion] = createSignal<string>("...");
  const [isCheckingUpdates, setIsCheckingUpdates] = createSignal(false);

  createEffect(async () => {
    if (props.isActive) {
      setDraft({ ...settingsStore });
      try {
        setAppVersion(await getVersion());
      } catch (e) {
        console.error("Failed to get app version:", e);
      }
    }
  });

  const updateCount = (type: SessionType, delta: number) => {
    setDraft((prev) => ({
      ...prev,
      defaultSessionCounts: {
        ...prev.defaultSessionCounts,
        [type]: Math.max(0, prev.defaultSessionCounts[type] + delta),
      },
    }));
  };

  const saveSettings = () => {
    const current = draft();
    updateSettings({
      ...current,
      defaultWorkspaceName: current.defaultWorkspaceName.trim() || defaultSettings.defaultWorkspaceName,
      defaultBrowserUrl: current.defaultBrowserUrl.trim() || defaultSettings.defaultBrowserUrl,
      terminalFontSize: Math.min(24, Math.max(10, Number(current.terminalFontSize) || 13)),
    });
  };

  const resetToDefaults = () => {
    resetSettings();
    setDraft({ ...defaultSettings });
  };

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdates(true);
    await checkForUpdates(true);
    setIsCheckingUpdates(false);
  };

  const renderCommonSettings = () => (
    <div class="settings-category-content">
      <div class="settings-section">
        <h3 class="settings-section-title">Workspace</h3>
        <p class="settings-section-description">Default settings for new workspaces</p>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Default Workspace Name</label>
            <span class="settings-item-id">workspace.defaultName</span>
          </div>
          <input
            class="settings-text-input"
            value={draft().defaultWorkspaceName}
            onInput={(e) => setDraft((prev) => ({ ...prev, defaultWorkspaceName: e.currentTarget.value }))}
            placeholder="New Workspace"
          />
        </div>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Default Browser URL</label>
            <span class="settings-item-id">workspace.defaultUrl</span>
          </div>
          <input
            class="settings-text-input"
            value={draft().defaultBrowserUrl}
            onInput={(e) => setDraft((prev) => ({ ...prev, defaultBrowserUrl: e.currentTarget.value }))}
            placeholder="http://localhost:3000"
          />
        </div>
      </div>
    </div>
  );

  const renderAppearanceSettings = () => (
    <div class="settings-category-content">
      <div class="settings-section">
        <h3 class="settings-section-title">Theme</h3>
        <p class="settings-section-description">Choose a theme for the application and terminals</p>

        <div class="settings-theme-grid">
          <For each={THEMES}>
            {(theme) => (
              <div
                classList={{
                  "settings-theme-card": true,
                  active: draft().theme === theme.id,
                }}
                onClick={() => {
                  setDraft((prev) => ({ ...prev, theme: theme.id }));
                  applyTheme(theme.id);
                }}
              >
                <div class="settings-theme-preview">
                  <div class="settings-theme-preview-header" style={{ background: theme.colors.bgHeader }}>
                    <div class="settings-theme-dot" style={{ background: theme.colors.accentDanger }} />
                    <div class="settings-theme-dot" style={{ background: theme.colors.accentSecondary }} />
                    <div class="settings-theme-dot" style={{ background: theme.colors.accentPrimary }} />
                  </div>
                  <div class="settings-theme-preview-body" style={{ background: theme.colors.bgApp }}>
                    <div class="settings-theme-sidebar" style={{ background: theme.colors.bgSidebar }}>
                      <div class="settings-theme-sidebar-icon" style={{ background: theme.colors.textMuted }} />
                      <div class="settings-theme-sidebar-icon" style={{ background: theme.colors.textMuted }} />
                      <div class="settings-theme-sidebar-icon" style={{ background: theme.colors.textMuted }} />
                    </div>
                    <div class="settings-theme-preview-content">
                      <div class="settings-theme-line" style={{ background: theme.colors.borderMain }} />
                      <div class="settings-theme-line short" style={{ background: theme.colors.textMuted }} />
                      <div class="settings-theme-line" style={{ background: theme.colors.borderMain }} />
                      <div class="settings-theme-line medium" style={{ background: theme.colors.accentPrimary }} />
                      <div class="settings-theme-line" style={{ background: theme.colors.borderMain }} />
                      <div class="settings-theme-line short" style={{ background: theme.colors.textMain }} />
                    </div>
                  </div>
                </div>
                <div class="settings-theme-info">
                  <div class="settings-theme-name">{theme.name}</div>
                  <div class="settings-theme-desc">{theme.description}</div>
                </div>
                <Show when={draft().theme === theme.id}>
                  <div class="settings-theme-check">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );

  const renderTerminalSettings = () => (
    <div class="settings-category-content">
      <div class="settings-section">
        <h3 class="settings-section-title">Appearance</h3>
        <p class="settings-section-description">Terminal display preferences</p>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Font Size</label>
            <span class="settings-item-id">terminal.fontSize</span>
          </div>
          <div class="settings-input-with-slider">
            <input
              type="range"
              min="10"
              max="24"
              class="settings-slider"
              value={draft().terminalFontSize}
              onInput={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  terminalFontSize: Number(e.currentTarget.value),
                }))
              }
            />
            <input
              type="number"
              min="10"
              max="24"
              class="settings-number-input"
              value={draft().terminalFontSize}
              onInput={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  terminalFontSize: Math.min(24, Math.max(10, Number(e.currentTarget.value) || 13)),
                }))
              }
            />
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Behavior</h3>
        <p class="settings-section-description">Terminal working preferences</p>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Default Shell</label>
            <span class="settings-item-id">terminal.defaultShell</span>
          </div>
          <select
            class="settings-select"
            value={draft().defaultShell}
            onChange={(e) => setDraft((prev) => ({ ...prev, defaultShell: e.currentTarget.value as any }))}
          >
            <option value="PowerShell">PowerShell</option>
            <option value="CMD">Command Prompt (CMD)</option>
            <option value="WSL">WSL (Windows Subsystem for Linux)</option>
            <option value="Native">System Default</option>
          </select>
        </div>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Remember Last Directory</label>
            <span class="settings-item-id">terminal.rememberDirectory</span>
          </div>
          <label class="settings-toggle">
            <input
              type="checkbox"
              checked={draft().rememberLastDirectory}
              onChange={(e) => setDraft((prev) => ({ ...prev, rememberLastDirectory: e.currentTarget.checked }))}
            />
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );

  const renderSessionsSettings = () => (
    <div class="settings-category-content">
      <div class="settings-section">
        <h3 class="settings-section-title">Default Session Counts</h3>
        <p class="settings-section-description">Number of each session type to launch by default</p>

        <div class="settings-sessions-grid">
          <For each={SESSION_TYPES}>
            {(type) => (
              <div class="settings-session-item">
                <div class="settings-session-header">
                  <span class="settings-session-icon">
                    {type === "Gemini" && "◇"}
                    {type === "Claude" && "◆"}
                    {type === "Codex" && "○"}
                    {type === "OpenCode" && "□"}
                    {type === "WSL" && "▤"}
                    {type === "Browser" && "🌐"}
                    {type === "Terminal" && "⧉"}
                  </span>
                  <span class="settings-session-name">{type}</span>
                </div>
                <div class="settings-session-controls">
                  <button class="settings-stepper-btn" onClick={() => updateCount(type, -1)}>−</button>
                  <span class="settings-session-count">{draft().defaultSessionCounts[type]}</span>
                  <button class="settings-stepper-btn" onClick={() => updateCount(type, 1)}>+</button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );

  const renderShortcutsSettings = () => (
    <div class="settings-category-content">
      <div class="settings-section">
        <h3 class="settings-section-title">Keyboard Shortcuts</h3>
        <p class="settings-section-description">Configure keybindings for common actions</p>

        <div class="settings-shortcuts-list">
          <div class="settings-shortcut-item">
            <span class="settings-shortcut-label">Open Launcher</span>
            <div class="settings-shortcut-keys">
              <kbd class="settings-shortcut-key">Ctrl+L</kbd>
              <span class="settings-shortcut-or">or</span>
              <kbd class="settings-shortcut-key">Ctrl+N</kbd>
            </div>
          </div>
          <div class="settings-shortcut-item">
            <span class="settings-shortcut-label">Toggle Settings</span>
            <kbd class="settings-shortcut-key">Ctrl+,</kbd>
          </div>
          <div class="settings-shortcut-item">
            <span class="settings-shortcut-label">Close Current Workspace</span>
            <kbd class="settings-shortcut-key">Ctrl+W</kbd>
          </div>
          <div class="settings-shortcut-item">
            <span class="settings-shortcut-label">Close Modal/Settings</span>
            <kbd class="settings-shortcut-key">Esc</kbd>
          </div>
        </div>

        <div class="settings-note">
          <span class="settings-note-icon">ℹ</span>
          <span>Keyboard shortcuts are currently hardcoded. Configurable keybindings coming soon.</span>
        </div>
      </div>
    </div>
  );

  const renderAboutSettings = () => (
    <div class="settings-category-content">
      <div class="settings-section">
        <h3 class="settings-section-title">Lattice</h3>
        <p class="settings-section-description">Application information and updates</p>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Version</label>
            <span class="settings-item-id">app.version</span>
          </div>
          <div class="settings-version-display">{appVersion()}</div>
        </div>

        <div class="settings-item">
          <div class="settings-item-header">
            <label class="settings-item-label">Check for Updates</label>
            <span class="settings-item-id">app.updater</span>
          </div>
          <button 
            class="settings-action-btn" 
            onClick={handleManualUpdateCheck}
            disabled={isCheckingUpdates()}
          >
            {isCheckingUpdates() ? "Checking..." : "Check for Updates"}
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-title">Legal</h3>
        <p class="settings-section-description">Open source licenses and terms</p>
        <div class="settings-note">
          <span class="settings-note-icon">⚖</span>
          <span>Lattice is licensed under the MIT License. Built with Tauri and SolidJS.</span>
        </div>
      </div>
    </div>
  );

  return (
    <div class="settings-page" classList={{ active: props.isActive }}>
      {/* Settings Sidebar */}
      <aside class="settings-sidebar">
        <div class="settings-sidebar-header">
          <div class="settings-sidebar-title-row">
            <h2 class="settings-sidebar-title">Settings</h2>
            <button class="settings-close-btn" onClick={props.onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="18" x2="18" y2="6"></line>
              </svg>
            </button>
          </div>
          <input
            type="text"
            class="settings-search-input"
            placeholder="Search settings..."
          />
        </div>

        <nav class="settings-sidebar-nav">
          <For each={SETTINGS_CATEGORIES}>
            {(category) => (
              <button
                classList={{
                  "settings-nav-item": true,
                  active: activeCategory() === category.id,
                }}
                onClick={() => setActiveCategory(category.id)}
              >
                <span class="settings-nav-icon">{category.icon}</span>
                <span class="settings-nav-label">{category.label}</span>
              </button>
            )}
          </For>
        </nav>

        <div class="settings-sidebar-footer">
          <button class="settings-reset-btn" onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <button class="settings-save-btn" onClick={saveSettings}>
            Save Settings
          </button>
        </div>
      </aside>

      {/* Settings Content */}
      <main class="settings-main">
        <Show when={activeCategory() === "common"}>{renderCommonSettings()}</Show>
        <Show when={activeCategory() === "appearance"}>{renderAppearanceSettings()}</Show>
        <Show when={activeCategory() === "terminal"}>{renderTerminalSettings()}</Show>
        <Show when={activeCategory() === "sessions"}>{renderSessionsSettings()}</Show>
        <Show when={activeCategory() === "shortcuts"}>{renderShortcutsSettings()}</Show>
        <Show when={activeCategory() === "about"}>{renderAboutSettings()}</Show>
      </main>
    </div>
  );
};
