import { onMount, onCleanup, createEffect } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { sessionStore } from "../store/sessionStore";
import { settingsStore, getCurrentTheme } from "../store/settingsStore";
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
  let webglAddon: WebglAddon | undefined;
  let lastWrittenIndex = 0;
  let lastRows = 0;
  let lastCols = 0;
  let wasActive = false;
  let viewportRecoverTimer: number | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const syncTerminalSize = () => {
    if (!fitAddon || !term) return;
    fitAddon.fit();
    const { rows, cols } = term;
    if (rows !== lastRows || cols !== lastCols) {
      lastRows = rows;
      lastCols = cols;
      resizeTerminal(props.id, rows, cols).catch(() => {});
    }
  };

  const recoverViewport = () => {
    if (!term) return;
    syncTerminalSize();
    term.refresh(0, Math.max(0, term.rows - 1));
    term.scrollToBottom();
  };

  const enableWebglIfNeeded = () => {
    if (!term || webglAddon) return;
    try {
      webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch {
      webglAddon = undefined;
    }
  };

  const disableWebglIfNeeded = () => {
    if (!webglAddon) return;
    try {
      webglAddon.dispose();
    } catch {
      // Ignore disposal races.
    }
    webglAddon = undefined;
  };

  const scheduleViewportRecover = (delay = 30) => {
    if (viewportRecoverTimer !== undefined) return;
    viewportRecoverTimer = window.setTimeout(() => {
      viewportRecoverTimer = undefined;
      try {
        recoverViewport();
      } catch {
        // Ignore recover races when terminal is being disposed.
      }
    }, delay);
  };

  onMount(() => {
    if (!terminalElement) {
      console.error(`[TerminalWrapper] Critical Error: No DOM element found for session ${props.id}`);
      return;
    }

    const currentTheme = getCurrentTheme();
    const tc = currentTheme.colors;

    term = new Terminal({
      cursorBlink: true,
      fontSize: settingsStore.terminalFontSize,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: tc.terminalBg,
        foreground: tc.terminalFg,
        cursor: tc.terminalCursor,
        selectionBackground: tc.terminalSelection,
        black: tc.terminalBlack,
        red: tc.terminalRed,
        green: tc.terminalGreen,
        yellow: tc.terminalYellow,
        blue: tc.terminalBlue,
        magenta: tc.terminalMagenta,
        cyan: tc.terminalCyan,
        white: tc.terminalWhite,
        brightBlack: tc.terminalBrightBlack,
        brightRed: tc.terminalBrightRed,
        brightGreen: tc.terminalBrightGreen,
        brightYellow: tc.terminalBrightYellow,
        brightBlue: tc.terminalBrightBlue,
        brightMagenta: tc.terminalBrightMagenta,
        brightCyan: tc.terminalBrightCyan,
        brightWhite: tc.terminalBrightWhite,
      },
      allowProposedApi: true,
    });

    terminalRegistry.set(props.id, term);
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalElement);

    resizeObserver = new ResizeObserver(() => {
      try {
        syncTerminalSize();
      } catch (e) {}
    });
    resizeObserver.observe(terminalElement);

    // Keep startup lightweight; activate WebGL only for active terminals.
    if (props.isActive) {
      enableWebglIfNeeded();
    }

    // Bolt ⚡: Reuse TextEncoder instance to prevent unnecessary garbage collection and allocations on every keystroke
    const textEncoder = new TextEncoder();
    const dataListener = term.onData((data) => {
      const bytes = Array.from(textEncoder.encode(data));
      writeToStdin(props.id, bytes).catch(console.error);
      scheduleViewportRecover(40);
    });

    const handleWindowFocus = () => scheduleViewportRecover(30);
    const handleWindowResize = () => scheduleViewportRecover(30);
    const handleForcedReflow = () => {
      scheduleViewportRecover(0);
      scheduleViewportRecover(60);
      scheduleViewportRecover(180);
    };
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("terminal-force-reflow", handleForcedReflow);

    onCleanup(() => {
      if (viewportRecoverTimer !== undefined) {
        clearTimeout(viewportRecoverTimer);
      }
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("terminal-force-reflow", handleForcedReflow);
      resizeObserver?.disconnect();
      disableWebglIfNeeded();
      dataListener.dispose();
      terminalRegistry.delete(props.id);
      term?.dispose();
    });
  });

  createEffect(() => {
    if (!term) return;
    term.options.fontSize = settingsStore.terminalFontSize;
    try {
      syncTerminalSize();
      term.refresh(0, Math.max(0, term.rows - 1));
    } catch {
      // Ignore occasional refresh race conditions.
    }
  });

  createEffect(() => {
    if (props.isActive && fitAddon && term) {
      enableWebglIfNeeded();
      const recoverDelays = [0, 50, 140, 260];
      recoverDelays.forEach((delay) =>
        setTimeout(() => {
          try {
            recoverViewport();
            term?.focus();
          } catch (e) {}
        }, delay)
      );
      setTimeout(() => {
        try {
          // Signal all mounted terminals to run a synchronized reflow pass.
          window.dispatchEvent(new Event("terminal-force-reflow"));
        } catch (e) {}
      }, 20);
    } else if (!props.isActive) {
      // Release GPU contexts for hidden tabs to avoid browser context limits.
      disableWebglIfNeeded();
    }
  });

  createEffect(() => {
    const session = sessionStore.sessions[props.id];
    if (session && term) {
      // Catch up once when switching back from an inactive workspace.
      if (props.isActive && !wasActive && lastWrittenIndex < session.buffer.length) {
        const missed = session.buffer.slice(lastWrittenIndex);
        term.write(missed);
        term.scrollToBottom();
        lastWrittenIndex = session.buffer.length;
      } else if (props.isActive) {
        // Active terminals are streamed live via init.ts direct-pipe path.
        // Here we only keep index in sync to avoid duplicate rendering.
        lastWrittenIndex = session.buffer.length;
      }
    }
    wasActive = props.isActive;
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
