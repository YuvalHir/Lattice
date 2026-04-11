# 🛡️ Security Audit Report: Lattice (agenticide)

**Date:** April 9, 2026  
**Status:** Action Required  
**Overall Risk:** 🔴 **HIGH** (due to Command Injection potential)

---

## 🚨 Critical Findings

### 1. Command Injection in PTY Spawning
*   **Location:** `src-tauri/src/process.rs` (lines 90-115) and `src-tauri/src/commands.rs`.
*   **Vulnerability:** The backend receives an executable and an array of arguments from the frontend, but then concatenates them into a single string (`full_cmd`) and passes it to a shell command (`powershell -Command` or `sh -lc`).
*   **Risk:** A malicious input (e.g., `npm run dev; rm -rf /`) would allow arbitrary code execution on the host machine.
*   **Recommendation:** Use the `CommandBuilder::arg` method for **each** argument individually rather than building a single command string. Avoid using shell wrappers (`-Command`, `-c`) when possible, or ensure arguments are never interpreted as shell instructions.

---

## 🔴 High Priority Findings

### 2. Missing Content Security Policy (CSP)
*   **Location:** `src-tauri/tauri.conf.json` (line 35: `"csp": null`).
*   **Vulnerability:** The application has no defined CSP, which is the primary defense against XSS in Tauri.
*   **Risk:** If a malicious script is ever loaded (via a dependency or external content), it can invoke **any** Tauri command (spawn processes, read files) without restriction.
*   **Recommendation:** Implement a strict CSP in `tauri.conf.json`.
    ```json
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:*;"
    }
    ```

---

## 🟡 Medium Priority Findings

### 3. Broad File System Permissions
*   **Location:** `src-tauri/capabilities/default.json`.
*   **Issue:** The `fs:scope` is set to `$HOME/**`.
*   **Risk:** This gives the application (and any potential attacker) full read/write access to the user's entire home directory (SSH keys, documents, browser data).
*   **Recommendation:** Narrow the scope to specific project directories or require the user to explicitly grant access to folders via the `dialog` plugin.

### 4. Unrestricted Process Termination (`kill_pid`)
*   **Location:** `src-tauri/src/commands.rs` (line 514).
*   **Issue:** The `kill_pid` command allows the frontend to send a `kill -9` signal to **any** process ID on the system.
*   **Risk:** A compromised frontend could be used to perform a Denial of Service (DoS) by killing system-critical processes.
*   **Recommendation:** Maintain a registry of PIDs started **only** by Lattice and restrict the `kill` commands to that registry.

---

## 🟢 Safe Findings (No Issues)

*   **API Keys/Secrets:** No hardcoded API keys, tokens, or private credentials were found in the codebase.
*   **Sensitive Files:** No `.env` files, SSH keys, or production logs were found tracked in Git.
*   **Git Integration:** Git commands are generally implemented safely using argument arrays.

---

## 🛠️ Recommended Next Steps

1.  **Harden the Backend:** Refactor the Rust command spawning to use individual arguments.
2.  **Enable CSP:** Update `tauri.conf.json` immediately.
3.  **Input Validation:** Add regex checks in `ServerManager.tsx` and `LauncherModal.tsx` to prevent shell metacharacters in custom commands.
