use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, Mutex};
use std::sync::Arc;
use std::io::{Read, Write};
use serde::{Serialize, Deserialize};
use crate::state::{SessionRegistry, SessionHandle, SessionStatus, ExecutionContext};
use crate::process::spawn_with_pty;

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
    // Aggressive logging for debug
    println!("[WORKSPACE] INITIATING SPAWN FOR ID: {}", payload.id);
    println!("[WORKSPACE] DIRECTORY: {:?}", payload.cwd);
    println!("[WORKSPACE] FULL PAYLOAD: {:?}", payload);

    let session_id = payload.id.clone();
    
    // We now have the direct ExecutionContext from the frontend
    let context = payload.context.clone();

    {
        let registry = state.lock().await;
        if registry.sessions.contains_key(&session_id) {
            return Err(format!("Session {} already exists", session_id));
        }
    }

    // Spawn with PTY
    let (pair, mut child) = spawn_with_pty(
        &context,
        &payload.command.executable,
        &payload.command.args,
        payload.cwd.clone(),
    ).map_err(|e| {
        let err = format!("PTY Spawn Error: {}", e);
        eprintln!("[!] {}", err);
        err
    })?;

    let pid = child.process_id().unwrap_or(0);
    println!("[WORKSPACE] PTY Process spawned with PID {} in {:?}", pid, payload.cwd);

    let mut master_reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut master_writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(100);

    // Reader thread
    let app_reader = app.clone();
    let session_id_reader = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        println!("[PTY] Reader loop started for session {}", session_id_reader);
        
        loop {
            match master_reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let cleaned_bytes: Vec<u8> = buffer[..n].iter()
                        .cloned()
                        .filter(|&b| b != 0x00)
                        .collect();

                    if !cleaned_bytes.is_empty() {
                        let data_str = String::from_utf8_lossy(&cleaned_bytes).into_owned();
                        println!("[PTY] Read {} bytes from session {}. Emitting terminal-output.", n, session_id_reader);
                        
                        let _ = app_reader.emit("terminal-output", TerminalOutputPayload {
                            id: session_id_reader.clone(),
                            data: data_str,
                        });
                        println!("[PTY] Emit call confirmed for session {}", session_id_reader);
                    }
                }
                Ok(_) => {
                    println!("[PTY] Reader EOF (0 bytes) for session {}", session_id_reader);
                    break;
                }
                Err(e) => {
                    eprintln!("[PTY] Reader Error for session {}: {}", session_id_reader, e.to_string());
                    break;
                }
            }
        }
        println!("[PTY] Reader loop terminated for session {}", session_id_reader);
    });

    // Writer task
    tokio::spawn(async move {
        while let Some(data) = stdin_rx.recv().await {
            if let Err(e) = master_writer.write_all(&data) {
                eprintln!("[PTY STDIN] Error writing to PID {}: {}", pid, e);
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
        let status = child.wait();
        let exit_code = match status {
            Ok(s) => {
                println!("[PROCESS] PTY Child Exited: Session {} with status {:?}", session_id_monitor, s);
                // Attempt to get exit code (this might be platform specific in portable-pty)
                None 
            }
            Err(e) => {
                eprintln!("[PROCESS] Error waiting for child in session {}: {}", session_id_monitor, e);
                None
            }
        };

        let _ = app_monitor.emit("process-exit", ProcessExitPayload {
            id: session_id_monitor.clone(),
            exit_code,
        });

        let mut registry = state_monitor.lock().await;
        if let Some(handle) = registry.sessions.get_mut(&session_id_monitor) {
            handle.status = SessionStatus::Terminated;
        }
    });

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
        handle.pty_pair.master.resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
        println!("[WORKSPACE] PTY Resized for session {}: {}x{}", id, rows, cols);
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
    let registry = state.lock().await;
    if let Some(handle) = registry.sessions.get(&id) {
        handle.stdin_tx.send(data).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Session {} not found", id))
    }
}

#[tauri::command]
pub async fn kill_process(
    state: State<'_, Arc<Mutex<SessionRegistry>>>,
    id: String, // Changed from session_id
) -> Result<(), String> {
    let mut registry = state.lock().await;
    if let Some(handle) = registry.sessions.get(&id) {
        let pid = handle.pid;
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
        registry.sessions.remove(&id);
        Ok(())
    } else {
        Err(format!("Session {} not found", id))
    }
}
