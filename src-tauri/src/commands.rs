use crate::process::spawn_with_pty;
use crate::state::{ExecutionContext, SessionHandle, SessionRegistry, SessionStatus};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::Arc;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

trait CommandNoWindow {
    fn no_window(&mut self) -> &mut Self;
}

impl CommandNoWindow for tokio::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            self.as_std_mut().creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

impl CommandNoWindow for std::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

#[tauri::command]
pub async fn check_directory_exists(path: String) -> bool {
    let p = std::path::Path::new(&path);
    p.exists() && p.is_dir()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryUsage {
    pub workspace_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitInfo {
    pub is_repo: bool,
    pub branch: String,
}

/// Nested command configuration matching the frontend's nested JSON.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CommandConfig {
    pub executable: String,
    pub args: Vec<String>,
}
/// Root LauncherPreset matching the exact frontend payload in the logs.
#[derive(Debug, Serialize, Deserialize)]
pub struct LauncherPreset {
    pub id: String,
    pub command: CommandConfig,
    pub context: ExecutionContext,
    pub cwd: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct TerminalOutputPayload {
    pub id: String,
    pub data: String,
}

#[derive(Debug, Serialize, Clone)]
struct ProcessExitPayload {
    pub id: String,
    pub exit_code: Option<i32>,
}

fn flush_buffer(
    app: &AppHandle,
    id: &str,
    byte_buffer: &mut Vec<u8>,
    spoof_tx: &mpsc::Sender<Vec<u8>>,
) {
    if byte_buffer.is_empty() {
        return;
    }

    // Filter out null bytes which can cause issues in some webview implementations
    let cleaned_bytes: Vec<u8> = byte_buffer
        .iter()
        .cloned()
        .filter(|&b| b != 0x00)
        .collect();

    if cleaned_bytes.is_empty() {
        byte_buffer.clear();
        return;
    }

    // Robust UTF-8 handling:
    // 1. If valid, emit all.
    // 2. If partial at end, emit valid part and keep tail.
    // 3. If invalid sequence, use lossy conversion and clear buffer.
    let (to_emit, to_keep) = match std::str::from_utf8(&cleaned_bytes) {
        Ok(s) => (s.to_string(), Vec::new()),
        Err(e) => {
            let valid_len = e.valid_up_to();
            if e.error_len().is_none() {
                // Incomplete sequence at the end, wait for more bytes
                let (valid, rest) = cleaned_bytes.split_at(valid_len);
                (
                    unsafe { std::str::from_utf8_unchecked(valid) }.to_string(),
                    rest.to_vec(),
                )
            } else {
                // Truly invalid UTF-8 (e.g. binary data). Use lossy to recover what we can.
                (String::from_utf8_lossy(&cleaned_bytes).into_owned(), Vec::new())
            }
        }
    };

    if !to_emit.is_empty() {
        // TTY-Spoof: Respond to cursor position requests commonly used by shell tools
        if to_emit.contains("\x1b[6n") {
            let _ = spoof_tx.try_send(b"\x1b[1;1R".to_vec());
        }

        let _ = app.emit(
            "terminal-output",
            TerminalOutputPayload {
                id: id.to_string(),
                data: to_emit,
            },
        );
    }

    // Retain only the partial tail for the next accumulation cycle
    byte_buffer.clear();
    byte_buffer.extend(to_keep);
}

#[tauri::command]
pub async fn spawn_process(
    app: AppHandle,
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    payload: LauncherPreset,
) -> Result<u32, String> {
    println!(
        "[BACKEND] spawn_process start id={} cwd={:?} context={:?} cmd={} args={:?}",
        payload.id,
        payload.cwd,
        payload.context,
        payload.command.executable,
        payload.command.args
    );

    // Aggressive logging for debug
    let session_id = payload.id.clone();

    // We now have the direct ExecutionContext from the frontend
    let context = payload.context.clone();

    {
        let registry = state.lock().await;
        if registry.sessions.contains_key(&session_id) {
            return Err(format!("Session {} already exists", session_id));
        }
    }

    let (pair, mut child) = spawn_with_pty(
        &context,
        &payload.command.executable,
        &payload.command.args,
        payload.cwd.clone(),
    )
    .map_err(|e| {
        let err = format!("PTY Spawn Error: {}", e);
        err
    })?;

    let pid = child.process_id().unwrap_or(0);

    let mut master_reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut master_writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(1024);
    let (output_tx, mut output_rx) = mpsc::channel::<Vec<u8>>(1024);
    let (spoof_tx, mut spoof_rx) = mpsc::channel::<Vec<u8>>(10);

    // 1. Dedicated Reader Thread (Low-latency blocking reads)
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match master_reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    // Send directly to the aggregator/throttler
                    if output_tx.blocking_send(buffer[..n].to_vec()).is_err() {
                        break;
                    }
                }
                _ => break,
            }
        }
    });

    // 2. Throttled Aggregator Task (Runs on Tokio)
    let app_emitter = app.clone();
    let session_id_emitter = session_id.clone();
    let spoof_tx_clone = spoof_tx.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(20));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        let mut byte_buffer = Vec::with_capacity(16384);

        loop {
            tokio::select! {
                Some(data) = output_rx.recv() => {
                    byte_buffer.extend(data);
                    // Force flush if buffer is getting huge to prevent extreme latency spikes
                    if byte_buffer.len() > 32768 {
                        flush_buffer(&app_emitter, &session_id_emitter, &mut byte_buffer, &spoof_tx_clone);
                    }
                }
                _ = interval.tick() => {
                    if !byte_buffer.is_empty() {
                        flush_buffer(&app_emitter, &session_id_emitter, &mut byte_buffer, &spoof_tx_clone);
                    }
                }
                else => break,
            }
        }
    });

    // Unified Writer task
    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(data) = stdin_rx.recv() => {
                    if master_writer.write_all(&data).is_err() { break; }
                    let _ = master_writer.flush();
                }
                Some(data) = spoof_rx.recv() => {
                    if master_writer.write_all(&data).is_err() { break; }
                    let _ = master_writer.flush();
                }
                else => break,
            }
        }
    });

    // Monitor task
    let state_monitor = state.inner().clone();
    let session_id_monitor = session_id.clone();
    let app_monitor = app.clone();

    {
        let mut registry = state_monitor.lock().await;
        registry.sessions.insert(
            session_id.clone(),
            SessionHandle {
                pid,
                stdin_tx,
                context: context.clone(),
                status: SessionStatus::Running,
                pty_pair: pair,
            },
        );
    }

    tokio::spawn(async move {
        // Wait on the PTY child in the blocking pool, not on core tokio workers.
        // Otherwise each session can pin a runtime thread and starve the app.
        let status = tokio::task::spawn_blocking(move || child.wait()).await;
        let exit_code = match status {
            Ok(Ok(_status)) => {
                // Attempt to get exit code (this might be platform specific in portable-pty)
                None
            }
            Ok(Err(_err)) => None,
            Err(_join_err) => None,
        };

        let _ = app_monitor.emit(
            "process-exit",
            ProcessExitPayload {
                id: session_id_monitor.clone(),
                exit_code,
            },
        );

        let mut registry = state_monitor.lock().await;
        if let Some(handle) = registry.sessions.get_mut(&session_id_monitor) {
            handle.status = SessionStatus::Terminated;
        }

        println!("[BACKEND] process-exit id={}", session_id_monitor);
    });

    println!("[BACKEND] spawn_process ready id={} pid={}", session_id, pid);
    Ok(pid)
}

#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let registry = state.lock().await;
    if let Some(handle) = registry.sessions.get(&id) {
        handle
            .pty_pair
            .master
            .resize(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        // println!(
        //     "[WORKSPACE] PTY Resized for session {}: {}x{}",
        //     id, rows, cols
        // );
        Ok(())
    } else {
        Err(format!("Session {} not found", id))
    }
}

#[tauri::command]
pub async fn write_to_stdin(
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    id: String, // Changed from session_id
    data: Vec<u8>,
) -> Result<(), String> {
    // Never hold the global registry lock across await points.
    // If this send blocks on a full channel, holding the lock can stall
    // all other terminal commands (spawn/resize/kill) and freeze the app.
    let stdin_tx = {
        let registry = state.lock().await;
        registry.sessions.get(&id).map(|handle| handle.stdin_tx.clone())
    };

    match stdin_tx {
        Some(tx) => {
            tx.send(data).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err(format!("Session {} not found", id)),
    }
}

#[tauri::command]
pub async fn kill_process(
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    id: String, // Changed from session_id
) -> Result<(), String> {
    // Read the PID under lock, but perform potentially slow process-kill
    // operations outside the lock so other sessions remain responsive.
    let pid = {
        let registry = state.lock().await;
        registry.sessions.get(&id).map(|handle| handle.pid)
    };

    let Some(pid) = pid else {
        return Err(format!("Session {} not found", id));
    };
    println!("[BACKEND] kill_process id={} pid={}", id, pid);

    #[cfg(windows)]
    {
        let mut kill = std::process::Command::new("taskkill")
            .arg("/F")
            .arg("/T")
            .arg("/PID")
            .arg(pid.to_string())
            .no_window()
            .spawn()
            .map_err(|e| e.to_string())?;
        let _ = kill.wait();
    }
    #[cfg(not(windows))]
    {
        let mut kill = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .no_window()
            .spawn()
            .map_err(|e| e.to_string())?;
        let _ = kill.wait();
    }

    let mut registry = state.lock().await;
    registry.sessions.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn kill_pid(pid: u32) -> Result<(), String> {
    println!("[BACKEND] kill_pid pid={}", pid);

    #[cfg(windows)]
    {
        let mut kill = std::process::Command::new("taskkill")
            .arg("/F")
            .arg("/T")
            .arg("/PID")
            .arg(pid.to_string())
            .no_window()
            .spawn()
            .map_err(|e| e.to_string())?;
        let _ = kill.wait();
    }
    #[cfg(not(windows))]
    {
        let mut kill = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .no_window()
            .spawn()
            .map_err(|e| e.to_string())?;
        let _ = kill.wait();
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub name: String,
    pub pid: u32,
    pub ports: Vec<u16>,
    pub cwd: String,
    pub executable: String,
    pub is_managed: bool,
    pub session_id: Option<String>,
}

#[cfg(windows)]
#[derive(Debug, Serialize, Deserialize)]
struct PortOwner {
    #[serde(rename = "LocalPort")]
    local_port: u16,
    #[serde(rename = "OwningProcess")]
    owning_process: u32,
}

#[tauri::command]
pub async fn get_all_services(
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
) -> Result<Vec<ServiceInfo>, String> {
    let mut registry = state.lock().await;
    // Fast partial refresh for CPU/RAM/Procs
    registry.sys.refresh_processes(ProcessesToUpdate::All, true);

    let mut port_map: std::collections::HashMap<u32, Vec<u16>> = std::collections::HashMap::new();

    // Build parent-child mapping once for efficient descendant lookups
    let mut children_map: std::collections::HashMap<Pid, Vec<Pid>> =
        std::collections::HashMap::new();
    for (&pid, process) in registry.sys.processes() {
        if let Some(parent) = process.parent() {
            children_map.entry(parent).or_default().push(pid);
        }
    }

    // 1. Get Listening Ports
    #[cfg(windows)]
    {
        let output = tokio::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-NetTCPConnection -State Listen | Select-Object LocalPort, OwningProcess | ConvertTo-Json",
            ])
            .no_window()
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stdout.trim().is_empty() {
                if let Ok(owners) = serde_json::from_str::<Vec<PortOwner>>(&stdout) {
                    for owner in owners {
                        port_map
                            .entry(owner.owning_process)
                            .or_default()
                            .push(owner.local_port);
                    }
                } else if let Ok(owner) = serde_json::from_str::<PortOwner>(&stdout) {
                    port_map
                        .entry(owner.owning_process)
                        .or_default()
                        .push(owner.local_port);
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let output = tokio::process::Command::new("ss")
            .args(["-tunlp"])
            .no_window()
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                if let Some(pid_start) = line.find("pid=") {
                    let pid_str: String = line[pid_start + 4..]
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if let Some(addr_start) = line.rfind(" ") {
                            let part = &line[..addr_start].trim();
                            if let Some(last_space) = part.rfind(" ") {
                                let addr = &part[last_space + 1..];
                                if let Some(port_start) = addr.rfind(":") {
                                    if let Ok(port) = addr[port_start + 1..].parse::<u16>() {
                                        port_map.entry(pid).or_default().push(port);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut services = Vec::new();
    let mut seen_pids = std::collections::HashSet::new();

    // 2. First, add all MANAGED sessions from the registry
    for (id, handle) in &registry.sessions {
        if handle.status == SessionStatus::Terminated {
            continue;
        }

        let root_pid = handle.pid;
        seen_pids.insert(root_pid);

        // Find ALL descendants of this managed process to prevent duplicate "External" entries
        let mut ports = port_map.get(&root_pid).cloned().unwrap_or_default();
        let mut queue = vec![Pid::from_u32(root_pid)];
        let mut visited = std::collections::HashSet::new();
        visited.insert(Pid::from_u32(root_pid));

        while let Some(pid) = queue.pop() {
            if let Some(children) = children_map.get(&pid) {
                for &child in children {
                    if visited.insert(child) {
                        queue.push(child);
                        let child_u32 = child.to_string().parse::<u32>().unwrap_or(0);
                        seen_pids.insert(child_u32);
                        if let Some(p) = port_map.get(&child_u32) {
                            ports.extend(p);
                        }
                    }
                }
            }
        }

        // Filter out ephemeral ports (>32768) if we have other ports,
        // as they are usually internal IPC/debug ports.
        let mut significant_ports: Vec<u16> = ports.iter().cloned().filter(|&p| p < 32768).collect();
        if significant_ports.is_empty() {
            significant_ports = ports;
        }

        significant_ports.sort();
        significant_ports.dedup();

        if let Some(proc) = registry.sys.process(Pid::from_u32(root_pid)) {
            // If the root is a shell but has a Node child, maybe use the child's name?
            // For now, stick to the managed ID/Name.
            services.push(ServiceInfo {
                name: proc.name().to_string_lossy().to_string(),
                pid: root_pid,
                ports: significant_ports,
                cwd: proc.cwd().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
                executable: proc.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
                is_managed: true,
                session_id: Some(id.clone()),
            });
        }
    }

    // 3. Add EXTERNAL Node services that are listening on ports
    for (pid, ports) in port_map {
        if seen_pids.contains(&pid) {
            continue;
        }

        let sys_pid = Pid::from_u32(pid);
        if let Some(proc) = registry.sys.process(sys_pid) {
            let exe_path = proc.exe().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
            let proc_name = proc.name().to_string_lossy().to_lowercase();

            let is_node = proc_name.contains("node") ||
                          proc_name.contains("npm") ||
                          proc_name.contains("yarn") ||
                          proc_name.contains("pnpm") ||
                          exe_path.contains("node") ||
                          exe_path.contains("nvm");

            if is_node {
                let mut significant_ports: Vec<u16> = ports.iter().cloned().filter(|&p| p < 49152).collect();
                if significant_ports.is_empty() {
                    significant_ports = ports;
                }
                significant_ports.sort();
                significant_ports.dedup();

                services.push(ServiceInfo {
                    name: proc.name().to_string_lossy().to_string(),
                    pid,
                    ports: significant_ports,
                    cwd: proc.cwd().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
                    executable: proc.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
                    is_managed: false,
                    session_id: None,
                });
            }
        }
    }

    Ok(services)
}


#[tauri::command]
pub async fn get_git_info(cwd: String) -> Result<GitInfo, String> {
    let output = tokio::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(&cwd)
        .no_window()
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(GitInfo {
            is_repo: false,
            branch: "".to_string(),
        });
    }

    let branch_output = tokio::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&cwd)
        .no_window()
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let branch = if branch_output.status.success() {
        String::from_utf8_lossy(&branch_output.stdout)
            .trim()
            .to_string()
    } else {
        "HEAD".to_string()
    };

    Ok(GitInfo {
        is_repo: true,
        branch,
    })
}

#[tauri::command]
pub async fn git_status(cwd: String) -> Result<Vec<GitFileStatus>, String> {
    let output = tokio::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&cwd)
        .no_window()
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Failed to get git status".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut statuses = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let (status_chars, path) = line.split_at(3);
        let path = path.trim().to_string();

        let index_status = status_chars.chars().next().unwrap_or(' ');
        let worktree_status = status_chars.chars().nth(1).unwrap_or(' ');

        // If it's staged
        if index_status != ' ' && index_status != '?' {
            statuses.push(GitFileStatus {
                path: path.clone(),
                status: index_status.to_string(),
                staged: true,
            });
        }

        // If it's not staged
        if worktree_status != ' ' {
            statuses.push(GitFileStatus {
                path: path.clone(),
                status: if worktree_status == '?' {
                    "U".to_string()
                } else {
                    worktree_status.to_string()
                },
                staged: false,
            });
        }
    }

    Ok(statuses)
}

#[tauri::command]
pub async fn git_add(cwd: String, path: String) -> Result<(), String> {
    let status = tokio::process::Command::new("git")
        .args(["add", &path])
        .current_dir(&cwd)
        .no_window()
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to add path: {}", path))
    }
}

#[tauri::command]
pub async fn git_unstage(cwd: String, path: String) -> Result<(), String> {
    let status = tokio::process::Command::new("git")
        .args(["reset", "HEAD", "--", &path])
        .current_dir(&cwd)
        .no_window()
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to unstage path: {}", path))
    }
}

#[tauri::command]
pub async fn git_commit(cwd: String, message: String) -> Result<(), String> {
    let status = tokio::process::Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&cwd)
        .no_window()
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Failed to commit changes".to_string())
    }
}

#[tauri::command]
pub async fn git_push(cwd: String) -> Result<(), String> {
    let status = tokio::process::Command::new("git")
        .args(["push"])
        .current_dir(&cwd)
        .no_window()
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Failed to push changes".to_string())
    }
}

#[tauri::command]
pub async fn git_init(cwd: String) -> Result<(), String> {
    let status = tokio::process::Command::new("git")
        .args(["init"])
        .current_dir(&cwd)
        .no_window()
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Failed to initialize git repository".to_string())
    }
}

#[tauri::command]
pub async fn git_add_all(cwd: String) -> Result<(), String> {
    let status = tokio::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&cwd)
        .no_window()
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Failed to stage all changes".to_string())
    }
}

#[tauri::command]
pub async fn get_git_log(cwd: String) -> Result<Vec<GitCommit>, String> {
    let output = tokio::process::Command::new("git")
        .args(["log", "--pretty=format:%h|%an|%ar|%s", "-n", "20"])
        .current_dir(&cwd)
        .no_window()
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                author: parts[1].to_string(),
                date: parts[2].to_string(),
                message: parts[3..].join("|"),
            });
        }
    }

    Ok(commits)
}

#[tauri::command]
pub async fn get_memory_usage(
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    workspace_pids: Vec<u32>
) -> Result<MemoryUsage, String> {
    let mut registry = state.lock().await;
    // Fast partial refresh for CPU/RAM/Procs
    registry.sys.refresh_processes(ProcessesToUpdate::All, true);

    let current_pid = Pid::from_u32(std::process::id());

    // Single pass to build parent-child map for faster lookups
    let mut children_map: std::collections::HashMap<Pid, Vec<Pid>> =
        std::collections::HashMap::new();
    for (&pid, process) in registry.sys.processes() {
        if let Some(parent) = process.parent() {
            children_map.entry(parent).or_default().push(pid);
        }
    }

    // Total memory: Lattice (current process) and all its descendants
    let total_bytes = get_memory_recursive(&registry.sys, &children_map, current_pid);

    // Workspace memory: Sum of provided root PIDs and their descendants
    let workspace_bytes = workspace_pids
        .iter()
        .map(|&pid| get_memory_recursive(&registry.sys, &children_map, Pid::from_u32(pid)))
        .sum();

    Ok(MemoryUsage {
        workspace_bytes,
        total_bytes,
    })
}

fn get_memory_recursive(
    sys: &System,
    children_map: &std::collections::HashMap<Pid, Vec<Pid>>,
    root_pid: Pid,
) -> u64 {
    let mut total = 0;
    let mut queue = vec![root_pid];
    let mut visited = std::collections::HashSet::new();

    while let Some(pid) = queue.pop() {
        if !visited.insert(pid) {
            continue;
        }

        if let Some(process) = sys.process(pid) {
            total += process.memory();

            // Efficiently add children from the pre-built map
            if let Some(children) = children_map.get(&pid) {
                for &child in children {
                    queue.push(child);
                }
            }
        }
    }
    total
}
