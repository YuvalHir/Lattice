import { Component, For, Show, createSignal, createEffect, onCleanup, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { 
  sessionStore, 
  toggleServerManager, 
  updateServices, 
  ServiceInfo, 
  addSession, 
  updateSessionPid, 
  stripAnsi, 
  renameSession, 
  renameExternalService 
} from '../store/sessionStore';
import './ServerManager.css';

const ServerManager: Component = () => {
  const [isLaunching, setIsLaunching] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [newCommand, setNewCommand] = createSignal('');
  const [newCwd, setNewCwd] = createSignal('');
  const [quickCd, setQuickCd] = createSignal('');
  const [cdError, setCdError] = createSignal(false);
  const [viewingLogId, setViewingLogId] = createSignal<string | null>(null);
  const [editingPid, setEditingPid] = createSignal<number | null>(null);
  const [editValue, setEditValue] = createSignal('');

  onMount(async () => {
    const home = await homeDir();
    setNewCwd(home);
  });

  // Poll for services every 5 seconds
  const poll = async () => {
    // If user is editing, skip polling to avoid losing focus/state
    if (editingPid() !== null) return;

    try {
      const services = await invoke<ServiceInfo[]>('get_all_services');
      updateServices(services);
    } catch (e) {
      console.error('[ServerManager] Failed to fetch services:', e);
    }
  };

  createEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    onCleanup(() => clearInterval(interval));
  });

  const stopService = async (id: string | null, pid: number) => {
    if (id) {
      await invoke('kill_process', { id });
    } else {
      await invoke('kill_pid', { pid });
    }
    poll();
  };

  const restartService = async (id: string) => {
    const session = sessionStore.sessions[id];
    if (!session) return;
    
    await invoke('kill_process', { id });
    const pid = await invoke<number>('spawn_process', { payload: session.preset });
    updateSessionPid(id, pid);
    poll();
  };

  const handleBrowse = async () => {
    const selected = await open({ directory: true, defaultPath: newCwd() });
    if (selected) setNewCwd(selected as string);
  };

  const handleQuickCd = async (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      const val = quickCd().trim();
      if (val.startsWith('cd ')) {
        const target = val.slice(3).trim();
        let nextPath = '';
        if (target === '..') {
          const parts = newCwd().split(/[\\\/]/);
          if (parts.length > 1) {
            parts.pop();
            nextPath = parts.join('\\');
          }
        } else if (target.includes(':') || target.startsWith('/')) {
          nextPath = target;
        } else {
          const separator = newCwd().includes('/') ? '/' : '\\';
          nextPath = `${newCwd().replace(/[\\\/]$/, '')}${separator}${target}`;
        }

        if (nextPath) {
          const exists = await invoke<boolean>('check_directory_exists', { path: nextPath });
          if (exists) {
            setNewCwd(nextPath);
            setQuickCd('');
            setCdError(false);
          } else {
            setCdError(true);
            setTimeout(() => setCdError(false), 1000);
          }
        }
      }
    }
  };

  const launchBackgroundService = async () => {
    if (!newCommand() || !newName()) return;
    const id = `bg-${Math.random().toString(36).slice(2, 11)}`;
    const [executable, ...args] = newCommand().split(' ');
    const preset = {
      id,
      name: newName(),
      command: { executable, args },
      context: 'Native' as const,
      cwd: newCwd() || undefined,
      runtime: 'native' as const,
    };
    try {
      addSession(id, 0, preset, true);
      const pid = await invoke<number>('spawn_process', { payload: preset });
      updateSessionPid(id, pid);
      setIsLaunching(false);
      setNewName('');
      setNewCommand('');
      // Force an immediate poll after launch
      setTimeout(poll, 500); 
    } catch (e) {
      console.error('[ServerManager] Launch failed:', e);
    }
  };

  const activeLogBuffer = () => {
    const id = viewingLogId();
    if (!id) return '';
    const raw = sessionStore.sessions[id]?.buffer || 'No logs available yet...';
    return stripAnsi(raw);
  };

  const startEditing = (service: ServiceInfo) => {
    const currentName = getDisplayName(service);
    setEditValue(currentName);
    setEditingPid(service.pid);
  };

  const saveRename = (service: ServiceInfo) => {
    const newVal = editValue().trim();
    if (newVal) {
      if (service.is_managed && service.session_id) {
        renameSession(service.session_id, newVal);
      } else {
        renameExternalService(service.pid, newVal);
      }
    }
    setEditingPid(null);
    poll(); // Refresh after edit
  };

  const getDisplayName = (service: ServiceInfo) => {
    // 1. Managed custom name or preset name
    if (service.is_managed && service.session_id) {
      const session = sessionStore.sessions[service.session_id];
      if (session?.customName) return session.customName;
      if (session?.preset.name) return session.preset.name;
    }
    
    // 2. External custom name
    if (sessionStore.externalNames[service.pid]) {
      return sessionStore.externalNames[service.pid];
    }

    // 3. Fallback for external (Node @ folder)
    if (!service.is_managed) {
      const folder = service.cwd.split(/[\\\/]/).pop() || 'unknown';
      return `Node @ ${folder}`;
    }

    // 4. Default to process name (e.g. powershell.exe)
    return service.name;
  };

  // Only show background services or external services
  const filteredServices = () => {
    return sessionStore.services.filter(s => {
      if (!s.is_managed) return true;
      if (s.session_id) {
        return sessionStore.sessions[s.session_id]?.isBackground === true;
      }
      return false;
    });
  };

  return (
    <div class="server-manager-overlay">
      <div class="server-manager-content" onClick={(e) => e.stopPropagation()}>
        <header class="server-manager-header">
          <div class="header-title">
            <h2>Server Management</h2>
            <span class="service-count">{filteredServices().length} active endpoints monitored</span>
          </div>
          <div class="header-actions">
             <button class="launch-btn" onClick={() => setIsLaunching(true)}>
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px">
                 <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
               </svg>
               Deploy New Service
             </button>
             <button class="close-btn" onClick={toggleServerManager}>✕</button>
          </div>
        </header>

        <div class="services-list">
          <table>
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Port(s)</th>
                <th>PID</th>
                <th>Status</th>
                <th>Working Directory</th>
                <th style="text-align: right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={filteredServices()}>
                {(service) => (
                  <tr class={service.is_managed ? 'managed-row' : 'external-row'}>
                    <td>
                      <div class="service-name">
                        <span class="indicator" classList={{ active: service.ports.length > 0 }}></span>
                        
                        <Show when={editingPid() === service.pid} 
                              fallback={
                                <div class="name-display-wrapper" onClick={() => startEditing(service)}>
                                  <span class="name-text">{getDisplayName(service)}</span>
                                  <svg class="edit-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </div>
                              }
                        >
                          <input 
                            class="rename-input"
                            type="text" 
                            value={editValue()} 
                            onInput={(e) => setEditValue(e.currentTarget.value)}
                            onBlur={() => saveRename(service)}
                            onKeyDown={(e) => e.key === 'Enter' && saveRename(service)}
                            autofocus
                          />
                        </Show>

                        <Show when={!service.is_managed}>
                          <span class="tag external">External</span>
                        </Show>
                        <Show when={service.is_managed}>
                          <span class="tag managed">Managed</span>
                        </Show>
                      </div>
                    </td>
                    <td>
                      <div class="port-chips">
                        <For each={service.ports}>
                          {(port) => (
                            <a href={`http://localhost:${port}`} target="_blank" class="port-link">
                              {port}
                            </a>
                          )}
                        </For>
                        <Show when={service.ports.length === 0}>
                          <span class="no-ports">None</span>
                        </Show>
                      </div>
                    </td>
                    <td><code class="pid-code">{service.pid}</code></td>
                    <td>
                      <span class="status-badge" classList={{ listening: service.ports.length > 0 }}>
                        {service.ports.length > 0 ? 'LISTENING' : 'RUNNING'}
                      </span>
                    </td>
                    <td class="path-cell" title={service.cwd}>
                      <span class="path-text">{service.cwd}</span>
                    </td>
                    <td style="text-align: right">
                      <div class="actions">
                        <Show when={service.is_managed && service.session_id}>
                          <button class="action-btn logs" onClick={() => setViewingLogId(service.session_id)} title="View Logs">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                          </button>
                          <button class="action-btn restart" onClick={() => restartService(service.session_id!)} title="Restart Service">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                          </button>
                        </Show>
                        <button class="action-btn stop" onClick={() => stopService(service.session_id, service.pid)} title="Stop Service">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        {/* LOG VIEWER MODAL */}
        <Show when={viewingLogId()}>
          <div class="log-viewer-overlay" onClick={() => setViewingLogId(null)}>
            <div class="log-viewer-content" onClick={(e) => e.stopPropagation()}>
              <header class="log-viewer-header">
                <h3>Service Logs: {sessionStore.sessions[viewingLogId()!]?.preset.name}</h3>
                <button class="close-btn" onClick={() => setViewingLogId(null)}>✕</button>
              </header>
              <pre class="log-display">
                {activeLogBuffer()}
              </pre>
            </div>
          </div>
        </Show>

        <Show when={isLaunching()}>
          <div class="launch-modal-overlay" onClick={() => setIsLaunching(false)}>
            <div class="launch-modal-content" 
                 onClick={(e) => e.stopPropagation()}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !quickCd().trim() && newName() && newCommand()) {
                     launchBackgroundService();
                   }
                 }}
            >
              <h3>Deploy Background Service</h3>
              <div class="form-group">
                <label>Service Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. My API Server" 
                  value={newName()} 
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  autofocus
                />
              </div>
              <div class="form-group">
                <label>Command</label>
                <input 
                  type="text" 
                  placeholder="e.g. npm run dev" 
                  value={newCommand()} 
                  onInput={(e) => setNewCommand(e.currentTarget.value)}
                />
              </div>
              <div class="form-group">
                <label>Working Directory</label>
                <div class="dir-input">
                  <input 
                    type="text" 
                    placeholder="Auto-detects current home if empty" 
                    value={newCwd()} 
                    onInput={(e) => setNewCwd(e.currentTarget.value)}
                  />
                  <button onClick={handleBrowse}>Browse</button>
                </div>
              </div>
              
              <div class="form-group quick-cd">
                <label>Quick Navigation (Shell)</label>
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
                  {cdError() ? 'Directory not found!' : "Type 'cd ..' or 'cd folder' to navigate. Press Enter to apply."}
                </span>
              </div>

              <div class="modal-footer">
                <button class="btn-cancel" onClick={() => setIsLaunching(false)}>Cancel</button>
                <button class="btn-deploy" onClick={launchBackgroundService} disabled={!newCommand() || !newName()}>Start Service</button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ServerManager;
