# Lattice

Lattice is a desktop workspace for running multiple AI coding agents in parallel, built with Tauri v2, SolidJS, and Rust. It lets you launch mixed session layouts (Gemini, Claude, Codex, OpenCode, WSL, and Browser) into a single grid.

## Features

- Mixed workspace launcher: combine terminal agents and browser tiles in one launch.
- Multiplexed grid workspace: auto-layout for 1 to 12+ sessions.
- PTY-backed terminals: Rust + `portable-pty` process management with xterm.js rendering.
- Workspace tabs: create, rename, recolor, and close workspaces.
- Custom window chrome: integrated title bar and controls.

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
