# AgentIDE

AgentIDE is a high-performance, multiplexed orchestration environment designed for managing parallel swarms of AI coding agents. Built with Tauri v2, SolidJS, and Rust, it provides a unified, low-latency interface for deploying and resizing multiple CLI-based agents (like Gemini, Claude, Codex, and OpenCode) in a synchronized workspace.

## 🚀 Key Features

- **Dynamic Swarm Launcher**: Deploy massive parallel workloads with a single click. Choose your target directory and configure the exact composition of your agent swarm.
- **Multiplexed Grid Workspace**: An edge-to-edge, responsive tiling system that automatically organizes 1 to 12+ agents into optimal grid layouts (2x2, 3x2, 4x3, etc.).
- **Proportional Resizing**: Interactive, high-priority gutters allow you to fluidly resize terminal tiles in real-time. The layout uses a Reactive CSS Grid model for instant UI synchronization.
- **Dynamic PTY Synchronization**: Deep integration between the xterm.js frontend and the Rust `portable-pty` backend ensures that CLI tools correctly reflow and adapt their graphics when terminals are resized.
- **Modern Terminal Aesthetics**: Pre-configured with the **Modern PowerShell (Campbell)** theme, featuring Cascadia Code fonts and vibrant ANSI color support.
- **Zero-Scroll Architecture**: The workspace is engineered to always fit the available viewport, providing a high-density "mission control" view of your entire agent swarm.

## 🛠 Tech Stack

- **Backend**: Rust, Tauri v2, `portable-pty` (High-performance process management).
- **Frontend**: SolidJS (Reactive UI), TypeScript, Vite.
- **Terminal**: `xterm.js` with WebGL acceleration and Fit addons.
- **Communication**: Tauri IPC with customized binary stream piping for zero-lag terminal output.

## 🚦 Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (v18+)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/agenticide.git
   cd agenticide
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## 🎮 Usage

1. **Deploy a Swarm**: Click the **+** button in the sidebar to open the Swarm Launcher.
2. **Select Directory**: Use the native folder picker to choose your project root.
3. **Configure Agents**: Use the quick presets (4, 6, 8, 12) or manually adjust the count of Gemini, Claude, or Codex agents.
4. **Orchestrate**: Click "Deploy Swarm" to initialize all PTY processes simultaneously.
5. **Resize**: Hover between any two terminals and drag the **AgentIDE Cyan** lines to customize your view.
6. **Cleanup**: Use the "TERMINATE ALL AGENTS" button in the header to clear the workspace instantly.

## 🛡 Security & System Integrity

AgentIDE operates with strict system permissions via the Tauri v2 capability model. It requires access to:
- `dialog`: For native directory selection.
- `fs`: For working directory initialization.
- `process`: For spawning and managing PTY sub-processes.

---

*AgentIDE - The Next-Generation Multi-Agent IDE.*
