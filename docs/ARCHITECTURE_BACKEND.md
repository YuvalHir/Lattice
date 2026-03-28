# Backend Architecture: AgenticIDE Multiplexer

This document outlines the core backend architecture for the AgenticIDE terminal multiplexer and workspace manager, built with Tauri v2, Rust (tokio), and SolidJS.

## 1. Global State Management

The backend maintains a thread-safe, centralized state manager to track active terminal sessions, their associated child processes, and I/O streams.

### Registry Structure
The registry is implemented as a `HashMap` within a thread-safe wrapper:
- **Type**: `Arc<Mutex<SessionRegistry>>`
- **Key**: `SessionId` (a unique UUID or integer generated per project tab)
- **Value**: `SessionHandle`

### SessionHandle Components
Each `SessionHandle` contains:
- `process_id`: The OS-level PID of the child process.
- `stdin_tx`: A `tokio::sync::mpsc::Sender<Vec<u8>>` to pipe input from the frontend to the process.
- `status`: Current session status (Starting, Running, Backgrounded, Terminated).
- `metadata`: Project path, environment variables, and execution context (Native vs. WSL).

```rust
pub struct SessionRegistry {
    pub sessions: HashMap<String, SessionHandle>,
}

pub struct SessionHandle {
    pub pid: u32,
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub context: ExecutionContext,
    pub status: SessionStatus,
}
```

## 2. Process Lifecycle Management

### Phase 1: Creation (Spawn)
1. **Frontend Request**: The SolidJS frontend invokes a Tauri command `spawn_session` with project path and execution preferences.
2. **Command Construction**: The backend determines whether to use `cmd.exe`, `powershell.exe`, or `wsl.exe`.
3. **Pty/Pipe Allocation**: `tokio::process::Command` is used with `Stdio::piped()` for `stdin`, `stdout`, and `stderr`.
4. **Registration**: The new session is added to the `SessionRegistry`.

### Phase 2: Backgrounding (Persistent Execution)
- Processes are long-lived and decoupled from UI visibility.
- Switching tabs in the frontend does not affect the child process.
- I/O streaming continues in the background to maintain an internal buffer if needed, though primary output is pushed via Tauri events.

### Phase 3: Graceful Termination
1. **SIGINT/SIGTERM**: Attempts to send a termination signal to the PID.
2. **Resource Cleanup**: Close pipes, drop `stdin_tx`, and remove the session from the registry.
3. **Zombie Prevention**: A dedicated tokio task waits on the child process to ensure it is reaped by the OS.

## 3. OS Routing Logic (Native Windows vs. WSL)

Execution is abstracted through an `ExecutionBridge` trait to handle environment differences seamlessly.

### Native Windows (`CmdBridge` / `PowerShellBridge`)
- Uses `std::process::Command` or `tokio::process::Command` directly.
- Handles Windows-specific path resolution (e.g., `C:\...`).
- Environment variables are inherited or merged from the host.

### Windows Subsystem for Linux (`WslBridge`)
- Prepends commands with `wsl.exe -e`.
- Handles path translation between Windows (`C:\`) and Linux (`/mnt/c/`) using `wslpath`.
- Ensures shell environment (like `.bashrc` or `.zshrc`) is correctly sourced.

```rust
pub enum ExecutionContext {
    NativeWindows,
    WSL { distro: Option<String> },
}

pub trait ExecutionBridge {
    fn build_command(&self, cmd: &str, args: &[&str]) -> tokio::process::Command;
}
```

## 4. I/O Streaming and Tauri IPC

### Outbound (Stdout/Stderr -> Frontend)
- For each session, a dedicated `tokio::spawn` task monitors the process's `stdout` and `stderr`.
- Data is read into a buffer and emitted as a Tauri event: `emit("session-output", Payload { session_id, data })`.
- No parsing is performed; the raw byte stream (including ANSI escape codes) is sent directly to `xterm.js`.

### Inbound (Frontend -> Stdin)
- The frontend listens for keyboard input via `xterm.js` and invokes a Tauri command `send_input`.
- The command looks up the session in the `SessionRegistry` and sends the bytes to the process's `stdin` via the `stdin_tx` channel.

## 5. Resource Philosophy

- **Minimal Overhead**: Rust's zero-cost abstractions ensure the bridge adds negligible latency.
- **Async Efficiency**: `tokio` allows handling hundreds of concurrent terminal sessions with minimal thread count.
- **Memory Safety**: `Arc<Mutex<...>>` ensures no data races when the frontend spams multiple concurrent I/O requests.
