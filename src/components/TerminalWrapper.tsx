import { onMount, onCleanup, createEffect } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { sessionStore } from "../store/sessionStore";
import { writeToStdin, resizeTerminal } from "../services/ipc";

/**
 * Global registry of active xterm.js instances.
 */
export const terminalRegistry = new Map<string, Terminal>();

interface TerminalWrapperProps {
  id: string; // Changed from sessionId
  isActive: boolean;
}

export const TerminalWrapper = (props: TerminalWrapperProps) => {
  let terminalElement: HTMLDivElement | undefined;
  let term: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let lastWrittenIndex = 0;
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
    if (!terminalElement) {
      console.error(`[TerminalWrapper] Critical Error: No DOM element found for session ${props.id}`);
      return;
    }

    console.log(`[TerminalWrapper] Initializing xterm instance for session: ${props.id}`);

    term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace", // Modern Microsoft terminal fonts
      theme: {
        background: "#0C0C0C", // Modern PowerShell Black
        foreground: "#CCCCCC", // Modern light grey text
        cursor: "#FFFFFF",
        selectionBackground: "rgba(255, 255, 255, 0.3)",
        black: "#0C0C0C",
        red: "#C50F1F",
        green: "#13A10E",
        yellow: "#C19C00",
        blue: "#0037DA",
        magenta: "#881798",
        cyan: "#3A96DD",
        white: "#CCCCCC",
        brightBlack: "#767676",
        brightRed: "#E74856",
        brightGreen: "#16C60C",
        brightYellow: "#F9F1A5",
        brightBlue: "#3B78FF",
        brightMagenta: "#B4009E",
        brightCyan: "#61D6D6",
        brightWhite: "#F2F2F2"
      },
      allowProposedApi: true,
    });

    // 1. Mount Priority: Register and Open BEFORE signal
    console.log(`[TerminalWrapper] Registering session ${props.id} in terminalRegistry.`);
    terminalRegistry.set(props.id, term);
    
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    // Attach to DOM immediately
    console.log(`[TerminalWrapper] Opening xterm instance on DOM element for session: ${props.id}`);
    term.open(terminalElement);

    // 2. Resize Synchronization Logic
    resizeObserver = new ResizeObserver(() => {
      if (fitAddon && term) {
        try {
          fitAddon.fit();
          const { rows, cols } = term;
          console.log(`[TerminalWrapper] Local resize detected for ${props.id}: ${cols}x${rows}. Syncing to PTY...`);
          resizeTerminal(props.id, rows, cols).catch(err => 
            console.error(`[TerminalWrapper] Failed to sync PTY size for ${props.id}:`, err)
          );
        } catch (e) {
          // Fit might fail if element is not visible or has 0 size
        }
      }
    });
    resizeObserver.observe(terminalElement);

    // 3. Debug Echo: Readiness Signal
    console.log(`[TerminalWrapper] Xterm instance successfully mounted and added to registry for session: ${props.id}`);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
      console.log(`[TerminalWrapper] WebGL acceleration enabled for session ${props.id}`);
    } catch (e) {
      console.warn(`[TerminalWrapper] WebGL addon failed for session ${props.id}, falling back to canvas`, e);
    }

    const dataListener = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      writeToStdin(props.id, bytes).catch(console.error);
    });

    onCleanup(() => {
      console.log(`[TerminalWrapper] Cleaning up terminal for session: ${props.id}`);
      resizeObserver?.disconnect();
      dataListener.dispose();
      terminalRegistry.delete(props.id);
      term?.dispose();
    });
  });

  /**
   * RE-FIT & RE-RENDER STRATEGY:
   * When the terminal becomes 'active' (visible in DOM), we must re-calculate 
   * dimensions and force a refresh to ensure the canvas is painted correctly.
   */
  createEffect(() => {
    if (props.isActive && fitAddon && term) {
      setTimeout(() => {
        try {
          console.log(`[TerminalWrapper] Activation trigger: Re-fitting terminal for session: ${props.id}`);
          fitAddon?.fit();
          const { rows, cols } = term!;
          resizeTerminal(props.id, rows, cols).catch(console.error);
          term?.refresh(0, (term?.rows || 1) - 1);
          term?.focus();
        } catch (e) {
          console.warn("Could not fit terminal on activation:", e);
        }
      }, 50);
    }
  });

  createEffect(() => {
    const session = sessionStore.sessions[props.id];
    if (session && term) {
      const buffer = session.buffer;
      
      // We only write from buffer if lastWrittenIndex is 0 (initial load/catchup)
      // Otherwise, init.ts handles direct routing to the xterm instance.
      if (lastWrittenIndex === 0 && buffer.length > 0) {
        console.log(`[TerminalWrapper] Catching up ${buffer.length} buffered segments for session: ${props.id}`);
        term.focus();
        term.scrollToBottom();
        
        for (let i = 0; i < buffer.length; i++) {
          term.write(new Uint8Array(buffer[i]));
        }
        lastWrittenIndex = buffer.length;
      } else {
        // Just update the index to stay in sync with what was routed by init.ts
        lastWrittenIndex = buffer.length;
      }
    }
  });


  return (
    <div 
      class={`terminal-container ${props.isActive ? '' : 'hidden'}`}
      ref={terminalElement}
      style={{
        width: "100%",
        height: "100%",
        display: props.isActive ? "block" : "none"
      }}
    />
  );
};
