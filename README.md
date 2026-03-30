# Lattice

Lattice is a desktop workspace for running multiple AI coding agents in parallel, built with Tauri v2, SolidJS, and Rust. It lets you launch mixed session layouts (Gemini, Claude, Codex, OpenCode, WSL, and Browser) into a single grid.

## Features

- **Workspace File Explorer**: Built-in file navigation with high-fidelity branded icons for common languages and frameworks (Rust, Python, TypeScript, JavaScript, Docker, etc.). Supports recursive directory expansion and workspace-specific browsing.
- **Server Management Dashboard**: Centralized hub for monitoring active Node.js services. Features include:
    - **System-Wide Discovery**: Automatically detects background services and maps them to their active ports.
    - **Clean Logs**: In-app log viewer with ANSI-code stripping for readable process output.
    - **Process Lifecycle**: Stop, restart, and rename services (both managed by Lattice and external).
    - **Background Deployment**: Launch new background services with a "Quick CD" navigation interface and default home directory scoping.
- **Git Source Control Integration**: First-class support for Git repositories. Stage changes, commit with custom messages, and view project history directly within the workspace.
- **Hybrid IDE Layout**: A professional, multiplexed interface with a full-height primary sidebar, a persistent global title bar with workspace tabs, and a utility-focused right sidebar.
- **The Swarm Builder**: A premium, multi-step onboarding experience for creating your workspace with a live grid preview.
- **Predictive Launching (Speed Booting)**: Reduces perceived latency by pre-spawning agent PTY processes in the background while you configure your swarm.
- **Mixed Workspace Launcher**: Combine terminal agents and browser tiles in one launch.
- **Multiplexed Grid Workspace**: Auto-layout optimized for 1 to 12+ sessions.
- **PTY-Backed Terminals**: Rust + `portable-pty` process management with WebGL-enabled xterm.js rendering.
- **Workspace Tabs**: Create, rename, recolor, and close workspaces with ease.
- **Custom Window Chrome**: Integrated title bar and native-feeling window controls with viewport-anchored management buttons.

## Browser Tile Behavior

Browser sessions are currently embedded as in-app webview frames.

- Great for local dev URLs (`http://localhost:3000`, etc.).
- Some major websites (for example Google) block iframe/embed access via security headers (`X-Frame-Options` / CSP `frame-ancestors`).
- If a site refuses to load, this is expected behavior from the target site, not a Lattice crash.

## Tech Stack

- Backend: Rust, Tauri v2, `portable-pty`
- Frontend: SolidJS, TypeScript, Vite
- Terminal: xterm.js (`@xterm/xterm`, fit + webgl addons)
- IPC: Tauri command + event bridge

## Getting Started

### Prerequisites

- Rust toolchain
- Node.js 18+
- Tauri system prerequisites for your OS

### Install

```bash
git clone https://github.com/YuvalHir/Lattice.git
cd Lattice
npm install
```

### Run

```bash
npm run tauri dev
```

## Troubleshooting

### `Cannot find native binding` / missing optional dependency

If you see errors such as missing `@tauri-apps/cli-win32-x64-msvc` (Windows) or rollup native packages, rebuild dependencies on the same OS where you run the app:

```powershell
rmdir /s /q node_modules
del package-lock.json
npm install --include=optional
```

Then run:

```powershell
npm run tauri dev
```

Do not reuse `node_modules` across WSL/Linux and Windows runs.
