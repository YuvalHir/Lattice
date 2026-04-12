use crate::state::ExecutionContext;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtyPair, PtySize};
use std::env;
use std::error::Error;
#[cfg(windows)]
use std::path::Path;

/// Resolves common Windows shell names to their absolute system paths.
#[cfg(windows)]
fn resolve_executable_path(cmd: &str) -> String {
    match cmd.to_lowercase().as_str() {
        "cmd" | "cmd.exe" => "C:\\Windows\\System32\\cmd.exe".to_string(),
        "powershell" | "powershell.exe" => {
            "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe".to_string()
        }
        "wsl" | "wsl.exe" => "C:\\Windows\\System32\\wsl.exe".to_string(),
        _ => cmd.to_string(),
    }
}

fn get_home_dir() -> String {
    #[cfg(windows)]
    {
        env::var("USERPROFILE")
            .or_else(|_| env::var("HOME"))
            .unwrap_or_else(|_| "C:\\".to_string())
    }
    #[cfg(not(windows))]
    {
        env::var("HOME").unwrap_or_else(|_| "/".to_string())
    }
}

fn shell_escape_posix(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }
    if s.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/' | ':'))
    {
        return s.to_string();
    }
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

fn build_wsl_command(cmd: &str, args: &[String]) -> String {
    if args.is_empty() {
        return cmd.to_string();
    }
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(shell_escape_posix(cmd));
    for arg in args {
        parts.push(shell_escape_posix(arg));
    }
    parts.join(" ")
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

    // 1. Resolve the shell and wrapping arguments based on context and platform
    let (shell_exe, shell_args) = match context {
        ExecutionContext::Native => {
            #[cfg(windows)]
            {
                (
                    "cmd.exe".to_string(),
                    vec!["/C".to_string()],
                )
            }
            #[cfg(not(windows))]
            {
                let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
                (shell, vec!["-lc".to_string()])
            }
        }
        ExecutionContext::PowerShell => {
            #[cfg(windows)]
            {
                (
                    "powershell.exe".to_string(),
                    vec![
                        "-NoLogo".to_string(),
                        "-ExecutionPolicy".to_string(),
                        "Bypass".to_string(),
                    ],
                )
            }
            #[cfg(not(windows))]
            {
                // Fallback to system shell if pwsh isn't standard on this system
                let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
                (shell, vec!["-lc".to_string()])
            }
        }
        ExecutionContext::CMD => {
            #[cfg(windows)]
            {
                ("cmd.exe".to_string(), vec!["/C".to_string()])
            }
            #[cfg(not(windows))]
            {
                let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
                (shell, vec!["-lc".to_string()])
            }
        }
        ExecutionContext::WSL => {
            #[cfg(windows)]
            {
                (
                    "wsl.exe".to_string(),
                    vec!["--".to_string(), "bash".to_string(), "-ilc".to_string()],
                )
            }
            #[cfg(not(windows))]
            {
                let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
                (shell, vec!["-lc".to_string()])
            }
        }
    };

    // 2. Resolve the absolute path for the shell executable (Windows only)
    #[cfg(windows)]
    let resolved_shell = resolve_executable_path(&shell_exe);
    #[cfg(not(windows))]
    let resolved_shell = shell_exe;

    // 3. Verify absolute path existence for core shells on Windows
    #[cfg(windows)]
    if (resolved_shell.to_lowercase().contains("system32")
        || resolved_shell.to_lowercase().contains("windowspowershell"))
        && !Path::new(&resolved_shell).exists()
    {
        return Err(format!(
            "Critical Error: Shell executable not found at {}",
            resolved_shell
        )
        .into());
    }

    // 4. Initialize CommandBuilder with the shell
    println!("[PTY] Initializing builder for: {}", resolved_shell);
    let mut builder = CommandBuilder::new(&resolved_shell);

    // Set common environment variables to prevent TTY hangs and enable colors
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    builder.env("CI", "true");
    builder.env("FORCE_COLOR", "1");
    builder.env("NP_NO_UPDATE_NOTIFIER", "1"); // Silence npm update checks

    // 5. Wrap the command
    if !cmd.is_empty() {
        println!("[PTY] Command detected: '{}' with {} args", cmd, args.len());
        // Apply shell arguments (like -lc or -NoProfile)
        for arg in &shell_args {
            println!("[PTY] Adding shell arg: {}", arg);
            builder.arg(arg);
        }

        if context == &ExecutionContext::WSL {
            let wsl_cmd = build_wsl_command(cmd, args);
            println!("[PTY] WSL wrapping: {}", wsl_cmd);
            builder.arg(wsl_cmd);
        } else {
            let mut full_cmd = cmd.to_string();
            // Append any additional arguments if they exist
            if !args.is_empty() {
                for arg in args {
                    full_cmd.push(' ');
                    full_cmd.push_str(arg);
                }
            }

            #[cfg(windows)]
            {
                if context == &ExecutionContext::CMD {
                    println!("[PTY] CMD wrapping: {}", full_cmd);
                    builder.arg(full_cmd);
                } else {
                    // Simpler command execution
                    println!("[PTY] PowerShell wrapping: {}", full_cmd);
                    builder.arg("-Command");
                    builder.arg(&full_cmd);
                }
            }
            #[cfg(not(windows))]
            {
                println!("[PTY] Unix wrapping: {}", full_cmd);
                builder.arg(full_cmd);
            }
        }
    } else {
        println!("[PTY] No command provided, spawning interactive shell");
    }

    // 6. Set Working Directory
    let final_cwd = working_dir.unwrap_or_else(get_home_dir);
    println!("[PTY] Working directory: {}", final_cwd);
    builder.cwd(final_cwd);

    // 7. Spawn on PTY Slave
    println!("[PTY] Spawning command...");
    let child = pair.slave.spawn_command(builder).map_err(|e| {
        println!("[PTY] SPAWN FAILURE: {}", e);
        e
    })?;

    println!("[PTY] Spawned successfully with PID {:?}", child.process_id());

    Ok((pair, child))
}
