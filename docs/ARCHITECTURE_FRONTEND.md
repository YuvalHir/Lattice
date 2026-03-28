# Multiplexer Frontend Architecture

## 1. Component Tree & Layout
The application follows a classic IDE layout but optimized for high-density terminal management.

```text
App
├── Layout (Main Container)
│   ├── Sidebar (Global Navigation: Agents, History, Settings)
│   ├── MainView
│   │   ├── TabBar (Session switcher, Add/Remove tabs)
│   │   └── Workspace (Terminal viewport)
│   │       └── TerminalWrapper (Per-session xterm.js instance)
│   └── StatusBar (IPC status, active agent count, performance metrics)
```

### Component Roles:
- **Sidebar**: Slim, glassmorphic vertical bar for switching context.
- **TabBar**: Dynamic horizontal bar using `SolidJS` `<For />` for high-performance tab switching.
- **TerminalWrapper**: A memoized component that manages a single `xterm.js` instance.

---

## 2. Terminal Persistence Strategy
To maintain the state of background agent processes (e.g., Claude Code, Gemini CLI) without memory leaks or buffer loss during tab switching, we will employ a **Detached DOM Registry** strategy.

### Implementation:
1. **Terminal Registry**: A centralized SolidJS Store will hold `Terminal` objects and their corresponding `FitAddon` instances.
2. **Persistence**: Terminal instances are created once per session. When a user switches tabs, the `xterm.js` DOM element is NOT destroyed. Instead:
   - The inactive terminal's parent container is set to `display: none` or moved to an off-screen `DocumentFragment`.
   - The active terminal is "reattached" to the Workspace viewport.
3. **Rust Backend IPC**:
   - Every session has a unique `SessionID`.
   - The backend emits events to `terminal:stdout:{SessionID}`.
   - The frontend listener updates the specific `xterm.js` buffer regardless of whether the tab is currently visible.

---

## 3. Visual Design System (Option A)

### Glassmorphism Implementation
We will use Vanilla CSS with CSS Variables for the "Option A" palette to achieve a "Cyber-Glass" aesthetic.

- **Backgrounds**: `rgba(15, 23, 42, 0.65)` with `backdrop-filter: blur(12px)`.
- **Borders**: `1px solid rgba(255, 255, 255, 0.1)` for that "crisp edge" feel.
- **Typography**: 
  - Global: `Assistant`, sans-serif.
  - Weights: 300 (Light), 400 (Regular), 600 (Semi-Bold).
- **Color Palette (Option A - Accents)**:
  - Primary: `#00E5FF` (Electric Cyan)
  - Secondary: `#7000FF` (Vivid Violet)
  - Success: `#00FF9C` (Neon Mint)
  - Surface: `#0F172A` (Slate Deep)

---

## 4. State Management & IPC
- **SolidJS Stores**: Used for UI state (active tab, sidebar collapsed state, session metadata).
- **Tauri IPC**:
  - `invoke("spawn_agent")`: Starts a new process on the backend.
  - `listen("terminal:stdout")`: High-frequency binary or UTF-8 stream directly into `term.write()`.
  - `invoke("terminal:stdin")`: Sends keystrokes from `term.onData()`.

---

## 5. Performance Optimization
- **Webgl Addon**: Enabled for `xterm.js` to offload terminal rendering to the GPU, keeping the main thread free for SolidJS reactivity.
- **Throttled Resizing**: `FitAddon.fit()` will be debounced during window/panel resizing to prevent layout thrashing.
- **Virtualization**: The Sidebar and TabBar will use keyed reconciliation to ensure only minimal DOM updates occur during session changes.
