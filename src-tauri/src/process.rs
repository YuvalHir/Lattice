use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtyPair, Child};
use crate::state::ExecutionContext;
use std::error::Error;
use std::path::Path;
use std::env;

/// Resolves common Windows shell names to their absolute system paths.
fn resolve_executable_path(cmd: &str) -> String {
    match cmd.to_lowercase().as_str() {
        "cmd" | "cmd.exe" => "C:\\Windows\\System32\\cmd.exe".to_string(),
        "powershell" | "powershell.exe" => "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe".to_string(),
        _ => cmd.to_string(),
    }
}

fn get_home_dir() -> String {
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .unwrap_or_else(|_| "C:\\".to_string())
}

/// Spawns a new process in a PTY based on the execution context.
pub fn spawn_with_pty(
    context: &ExecutionContext,
    cmd: &str,
    args: &[String],
    working_dir: Option<String>,
) -> Result<(PtyPair, Box<dyn Child + Send + Sync>), Box<dyn Error>> {
    let pty_system = native_pty_system();
    
    // Standard terminal dimensions
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    // 1. Resolve the executable path
    let resolved_executable = match context {
        ExecutionContext::Native => resolve_executable_path(cmd),
        ExecutionContext::WSL => "wsl.exe".to_string(),
    };

    // 2. Verify absolute path existence for core shells
    if (resolved_executable.contains("System32") || resolved_executable.contains("WindowsPowerShell"))
        && !Path::new(&resolved_executable).exists() 
    {
        return Err(format!("Critical Error: Executable not found at {}", resolved_executable).into());
    }

    // 3. Initialize CommandBuilder
    let mut builder = CommandBuilder::new(&resolved_executable);

    // 4. Add arguments (WSL context handling)
    if *context == ExecutionContext::WSL {
        builder.arg("-e");
        builder.arg(cmd);
    }
    
    for arg in args {
        builder.arg(arg);
    }

    // 5. Set Working Directory
    let final_cwd = working_dir.unwrap_or_else(get_home_dir);
    builder.cwd(final_cwd);

    println!("[OS] Spawning PTY with Native system: {} with args: {:?}", resolved_executable, args);

    // 6. Spawn on PTY Slave
    let child = pair.slave.spawn_command(builder).map_err(|e| {
        eprintln!("[!] PTY SLAVE SPAWN FAILURE: {}", e);
        e
    })?;

    Ok((pair, child))
}
