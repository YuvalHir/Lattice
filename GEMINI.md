# Lattice Foundational Mandates (GEMINI.md)

This document defines the core engineering standards and architectural constraints for the Lattice project. These mandates take absolute precedence over all other workflows.

## 🚀 Vision
Lattice is a high-performance, zero-latency multiplexed orchestration environment for parallel AI agent swarms.

## 🛠 Technical Stack
- **Backend**: Rust (Tauri v2) + `portable-pty`.
- **Frontend**: SolidJS + TypeScript.
- **Terminal**: `xterm.js` (WebGL enabled).
- **Styling**: Vanilla CSS + Reactive CSS Grid.

## 📐 Architectural Mandates

### 1. The Grid
- **Zero-Scroll**: The workspace MUST always fit the available viewport. Scrolling inside the workspace container is forbidden.
- **Edge-to-Edge**: Terminals must be perfectly adjacent with no padding or gaps between tiles.
- **Reactive Tiling**: Use CSS Grid driven by SolidJS signals for layout. Layouts MUST calculate optimal rows/cols for any agent count (optimized for 4, 6, 8, 12).

### 2. I/O & IPC Pipeline
- **Event Naming**: Use `terminal-output` for stdout/stderr and `process-exit` for PTY termination.
- **Payload Structure**: Always use `{ id: String, data: String }`. Do not use `session_id` or other variants.
- **Synchronization**: The frontend MUST register the session and mount the terminal element BEFORE the backend starts streaming.
- **PTY Resizing**: Every frontend resize event MUST be synchronized with the backend PTY master via the `resize_terminal` command to ensure CLI graphics (like Claude/Gemini) reflow correctly.

### 3. Aesthetics & UX
- **Theme**: Standardized on **Modern PowerShell (Campbell)**. 
  - Background: `#0C0C0C`.
  - Font: `'Cascadia Code', Consolas, monospace`.
- **Resizers**: Resizer handles MUST have a high `z-index` (500+) and use an "Interaction Shield" (transparent overlay) during drag to prevent terminal event theft.
- **Launcher**: Default directory MUST be the user's home directory.

## 🛡 Security & Safety
- **Capability Model**: All new features requiring OS access MUST be explicitly defined in `src-tauri/capabilities/default.json`.
- **Process Management**: Always use `taskkill` (Windows) or `kill -9` (Unix) to ensure swarm-wide cleanup when "Terminate All" is invoked.

## 📦 Release Hygiene
- **Changelog Mandate**: Before pushing any version tag (e.g., `v*`), the `CHANGELOG.md` MUST be updated with the latest changes, adhering to the established format.
- **CI/CD Alignment**: All performance optimizations and dependency fixes applied to the CI environment MUST be reflected in the `release.yml` to ensure build parity.

## 📝 Change Logs & Logging
- **Deep Logging**: All PTY lifecycle events (Spawn, Read, Emit, Resize, Exit) MUST be printed to the Rust console with the `[WORKSPACE]` or `[PTY]` prefix.
- **Frontend Debugging**: IPC events and mounting sequences MUST be logged to the browser console with the `[IPC]` or `[TerminalWrapper]` prefix.
