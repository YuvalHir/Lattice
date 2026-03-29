use crate::state::ExecutionContext;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtyPair, PtySize};
use std::env;
use std::error::Error;
use std::path::Path;

/// Resolves common Windows shell names to their absolute system paths.
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
    env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .unwrap_or_else(|_| "C:\\".to_string())
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

    // 1. Resolve the shell and wrapping arguments based on context
    let (shell_exe, mut shell_args) = match context {
        ExecutionContext::Native => {
            #[cfg(windows)]
            {
                ("powershell.exe".to_string(), vec!["-NoLogo".to_string(), "-Command".to_string()])
            }
            #[cfg(not(windows))]
            {
                let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
                // Use login shell mode so user PATH customizations are loaded.
                (shell, vec!["-lc".to_string()])
            }
        }
        ExecutionContext::PowerShell => {
            ("powershell.exe".to_string(), vec!["-NoLogo".to_string(), "-Command".to_string()])
        }
        ExecutionContext::CMD => {
            ("cmd.exe".to_string(), vec!["/C".to_string()])
        }
        ExecutionContext::WSL => {
            (
                "wsl.exe".to_string(),
                vec!["--".to_string(), "bash".to_string(), "-ilc".to_string()],
            )
        }
    };

    // 2. Resolve the absolute path for the shell executable (Windows only)
    let resolved_shell = if shell_exe.ends_with(".exe") || shell_exe.contains("System32") {
        resolve_executable_path(&shell_exe)
    } else {
        shell_exe
    };

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
    let mut builder = CommandBuilder::new(&resolved_shell);

    // 5. Wrap the command
    if !cmd.is_empty() {
        // Apply shell arguments (like -- or -Command)
        for arg in shell_args {
            builder.arg(arg);
        }

        // PowerShell/CMD special wrapping: use a single command string
        if context == &ExecutionContext::PowerShell || 
           (context == &ExecutionContext::Native && cfg!(windows)) ||
           context == &ExecutionContext::CMD {
            
            let mut full_cmd = cmd.to_string();
            if !args.is_empty() {
                for arg in args {
                    full_cmd.push(' ');
                    full_cmd.push_str(arg);
                }
            }

            if context == &ExecutionContext::CMD {
                builder.arg(full_cmd);
            } else {
                builder.arg(format!("& {}", full_cmd));
            }
        } else if context == &ExecutionContext::WSL {
            // WSL launches through bash -lc so PATH/profile customizations are loaded.
            builder.arg(build_wsl_command(cmd, args));
        } else {
            // Native Unix: pass argv directly.
            builder.arg(cmd);
            for arg in args {
                builder.arg(arg);
            }
        }
    } else {
        // Just launch the interactive shell if no command provided
        for arg in args {
            builder.arg(arg);
        }
    }

    // 6. Set Working Directory
    let final_cwd = working_dir.unwrap_or_else(get_home_dir);
    builder.cwd(final_cwd);

    // 7. Spawn on PTY Slave
    let child = pair.slave.spawn_command(builder).map_err(|e| e)?;

    Ok((pair, child))
}
