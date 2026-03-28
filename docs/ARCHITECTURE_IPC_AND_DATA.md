# Architecture: IPC & Data Modeling

This document defines the communication protocol between the Rust (Tauri) backend and the SolidJS frontend for the Multiplexer agentic IDE.

## 1. Launcher Preset Schema (JSON)

The "Launcher Preset" dictates how an agent or CLI tool is initialized. It must support local binaries, node-based tools, and environment-specific flags (e.g., WSL).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LauncherPreset",
  "type": "object",
  "properties": {
    "id": { "type": "string", "description": "Unique identifier for the preset." },
    "name": { "type": "string", "description": "Display name in the UI." },
    "description": { "type": "string" },
    "command": {
      "type": "object",
      "properties": {
        "executable": { "type": "string", "description": "e.g., 'gemini-cli', 'npx', 'python'" },
        "args": { "type": "array", "items": { "type": "string" } },
        "cwd": { "type": "string", "description": "Working directory path." }
      },
      "required": ["executable"]
    },
    "env": {
      "type": "object",
      "additionalProperties": { "type": "string" },
      "description": "Injected environment variables."
    },
    "runtime": {
      "type": "string",
      "enum": ["native", "wsl", "docker"],
      "default": "native"
    },
    "options": {
      "type": "object",
      "properties": {
        "auto_restart": { "type": "boolean" },
        "shell": { "type": "boolean", "description": "Run inside a system shell (cmd/sh)." }
      }
    }
  },
  "required": ["id", "name", "command"]
}
```

## 2. Tauri IPC Protocol

To prevent UI locking during high-frequency terminal updates (e.g., `stdout` bursts), we use asynchronous Tauri Events for data streaming and `invoke` for control signals.

### A. Events (Backend -> Frontend)

| Event Name | Payload Structure | Description |
| :--- | :--- | :--- |
| `terminal-output` | `{ pid: number, data: string, stream: 'stdout' | 'stderr' }` | Raw byte stream encoded as UTF-8 string. |
| `process-spawn` | `{ pid: number, preset_id: string, timestamp: string }` | Emitted when a process successfully starts. |
| `process-exit` | `{ pid: number, exit_code: number \| null, signal: string \| null }` | Emitted when a process terminates. |

### B. Commands (Frontend -> Backend)

| Command (`invoke`) | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `spawn_process` | `{ preset: LauncherPreset }` | `Result<number, string>` | Starts a new process; returns PID. |
| `write_to_stdin` | `{ pid: number, data: string }` | `Result<(), string>` | Sends input to a specific process. |
| `kill_process` | `{ pid: number }` | `Result<(), string>` | Force terminates a process. |

## 3. SolidJS Service Layer Strategy

The frontend will manage terminal state using a centralized store (e.g., `createStore`) to ensure reactivity across the UI without redundant re-renders.

### Event Listening
The service layer initializes listeners on mount:
```typescript
import { listen } from '@tauri-apps/api/event';

const setupListeners = (pid: number) => {
  const unlisten = listen<TerminalOutputPayload>('terminal-output', (event) => {
    if (event.payload.pid === pid) {
      updateTerminalStore(pid, event.payload.data);
    }
  });
  return unlisten;
};
```

### Buffering & Rendering
To handle high-volume output:
1. **Virtualization:** Use a virtualized list for the terminal buffer to maintain 60fps.
2. **Throttling:** If output exceeds a specific threshold (e.g., >100 lines/sec), the service layer will buffer incoming strings and update the store in batches (every 16ms) rather than on every event.
3. **Xterm.js Integration:** The raw string data will be fed directly into an `xterm.js` instance for high-performance terminal emulation.

## 4. Rust Backend Implementation Notes (Tokio)

The Rust side will utilize `tokio::process::Command` to manage child processes.
- Each process will have a dedicated Tokio task that polls `stdout`/`stderr`.
- Data is read into a fixed-size buffer (e.g., 4KB) and emitted as a Tauri event immediately.
- `stdin` is handled via a `mpsc` channel passed to the process manager.
