use crate::process::spawn_with_pty;
use crate::state::{ExecutionContext, SessionHandle, SessionRegistry, SessionStatus};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::Arc;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};

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

#[tauri::command]
pub async fn spawn_process(
    app: AppHandle,
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    payload: LauncherPreset,
) -> Result<u32, String> {
    println!(
        "[BACKEND] spawn_process start id={} cwd={:?} cmd={}",
        payload.id, payload.cwd, payload.command.executable
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

    let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(100);

    // Reader thread
    let app_reader = app.clone();
    let session_id_reader = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        // println!(
        //     "[PTY] Reader loop started for session {}",
        //     session_id_reader
        // );

        loop {
            match master_reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let cleaned_bytes: Vec<u8> =
                        buffer[..n].iter().cloned().filter(|&b| b != 0x00).collect();

                    if !cleaned_bytes.is_empty() {
                        let data_str = String::from_utf8_lossy(&cleaned_bytes).into_owned();
                        let _ = app_reader.emit(
                            "terminal-output",
                            TerminalOutputPayload {
                                id: session_id_reader.clone(),
                                data: data_str,
                            },
                        );
                    }
                }
                Ok(_) => {
                    break;
                }
                Err(_e) => {
                    break;
                }
            }
        }
    });

    // Writer task
    tokio::spawn(async move {
        while let Some(data) = stdin_rx.recv().await {
            if let Err(_e) = master_writer.write_all(&data) {
                break;
            }
            let _ = master_writer.flush();
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
            .spawn()
            .map_err(|e| e.to_string())?;
        let _ = kill.wait();
    }
    #[cfg(not(windows))]
    {
        let mut kill = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .spawn()
            .map_err(|e| e.to_string())?;
        let _ = kill.wait();
    }

    let mut registry = state.lock().await;
    registry.sessions.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn get_git_info(cwd: String) -> Result<GitInfo, String> {
    let output = tokio::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(&cwd)
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
pub async fn get_memory_usage(workspace_pids: Vec<u32>) -> Result<MemoryUsage, String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let current_pid = Pid::from_u32(std::process::id());

    // Single pass to build parent-child map for faster lookups
    let mut children_map: std::collections::HashMap<Pid, Vec<Pid>> =
        std::collections::HashMap::new();
    for (&pid, process) in sys.processes() {
        if let Some(parent) = process.parent() {
            children_map.entry(parent).or_default().push(pid);
        }
    }

    // Total memory: Lattice (current process) and all its descendants
    let total_bytes = get_memory_recursive(&sys, &children_map, current_pid);

    // Workspace memory: Sum of provided root PIDs and their descendants
    let workspace_bytes = workspace_pids
        .iter()
        .map(|&pid| get_memory_recursive(&sys, &children_map, Pid::from_u32(pid)))
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
