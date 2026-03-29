import { onMount, onCleanup, createEffect } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { sessionStore } from "../store/sessionStore";
import { settingsStore } from "../store/settingsStore";
import { writeToStdin, resizeTerminal } from "../services/ipc";

/**
 * Global registry of active xterm.js instances.
 */
export const terminalRegistry = new Map<string, Terminal>();

interface TerminalWrapperProps {
  id: string; 
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

    term = new Terminal({
      cursorBlink: true,
      fontSize: settingsStore.terminalFontSize,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: "transparent",
        foreground: "#E0E7FF", // --text-main
        cursor: "#00E5FF", // --accent-primary
        selectionBackground: "rgba(0, 229, 255, 0.3)",
        black: "#0B0F1A",
        red: "#FF5555",
        green: "#50FA7B",
        yellow: "#F1FA8C",
        blue: "#BD93F9",
        magenta: "#FF79C6",
        cyan: "#8BE9FD",
        white: "#F8F8F2",
        brightBlack: "#44475A",
        brightRed: "#FF6E6E",
        brightGreen: "#69FF94",
        brightYellow: "#FFFFA5",
        brightBlue: "#D6ACFF",
        brightMagenta: "#FF92DF",
        brightCyan: "#A4FFFF",
        brightWhite: "#FFFFFF"
      },
      allowProposedApi: true,
    });

    terminalRegistry.set(props.id, term);
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalElement);

    resizeObserver = new ResizeObserver(() => {
      if (fitAddon && term) {
        try {
          fitAddon.fit();
          const { rows, cols } = term;
          resizeTerminal(props.id, rows, cols).catch(() => {});
        } catch (e) {}
      }
    });
    resizeObserver.observe(terminalElement);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch (e) {}

    const dataListener = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      writeToStdin(props.id, bytes).catch(console.error);
    });

    onCleanup(() => {
      resizeObserver?.disconnect();
      dataListener.dispose();
      terminalRegistry.delete(props.id);
      term?.dispose();
    });
  });

  createEffect(() => {
    if (!term) return;
    term.options.fontSize = settingsStore.terminalFontSize;
    try {
      fitAddon?.fit();
      term.refresh(0, Math.max(0, term.rows - 1));
    } catch {
      // Ignore occasional refresh race conditions.
    }
  });

  createEffect(() => {
    if (props.isActive && fitAddon && term) {
      setTimeout(() => {
        try {
          fitAddon?.fit();
          const { rows, cols } = term!;
          resizeTerminal(props.id, rows, cols).catch(() => {});
          term?.refresh(0, (term?.rows || 1) - 1);
          term?.focus();
        } catch (e) {}
      }, 50);
    }
  });

  createEffect(() => {
    const session = sessionStore.sessions[props.id];
    if (session && term && lastWrittenIndex === 0) {
      if (session.buffer.length > 0) {
        term.write(session.buffer);
        term.scrollToBottom();
      }
      lastWrittenIndex = session.buffer.length;
      term.focus();
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
