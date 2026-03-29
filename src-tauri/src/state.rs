use std::collections::HashMap;
use tokio::sync::mpsc;
use serde::{Serialize, Deserialize};
use portable_pty::PtyPair;

/// Represents the execution context for a session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExecutionContext {
    Native, // Default OS shell
    PowerShell,
    CMD,
    WSL,
}

/// Represents the current status of a session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Starting,
    Running,
    Backgrounded,
    Terminated,
}

/// A handle to an active terminal session.
pub struct SessionHandle {
    pub pid: u32,
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub context: ExecutionContext,
    pub status: SessionStatus,
    pub pty_pair: PtyPair, 
}

/// The global registry of all active sessions.
pub struct SessionRegistry {
    pub sessions: HashMap<String, SessionHandle>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}
