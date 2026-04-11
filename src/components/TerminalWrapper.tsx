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

/**
 * Global registry for scroll positions to persist across tab switches and remounts.
 */
const scrollRegistry = new Map<string, { lastWasAtBottom: boolean, savedViewportY: number }>();

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
  let isRestoringScroll = false;

  const getScrollState = () => {
    return scrollRegistry.get(props.id) || { lastWasAtBottom: true, savedViewportY: 0 };
  };

  const setScrollState = (state: { lastWasAtBottom: boolean, savedViewportY: number }) => {
    scrollRegistry.set(props.id, state);
  };

  const syncTerminalSize = () => {
    if (!fitAddon || !term || !props.isActive) return;
    try {
      fitAddon.fit();
      const { rows, cols } = term;
      if (rows <= 0 || cols <= 0) return;
      
      if (rows !== lastRows || cols !== lastCols) {
        lastRows = rows;
        lastCols = cols;
        console.log(`[TerminalWrapper] Resizing ${props.id} to ${cols}x${rows}`);
        resizeTerminal(props.id, rows, cols).catch(() => {});
      }
    } catch (e) {}
  };

  const recoverViewport = (forceBottom = false) => {
    if (!term || !props.isActive) return;
    syncTerminalSize();
    term.refresh(0, Math.max(0, term.rows - 1));
    
    const state = getScrollState();
    if (forceBottom || state.lastWasAtBottom) {
      term.scrollToBottom();
    } else {
      isRestoringScroll = true;
      term.scrollToLine(state.savedViewportY);
      // Release lock after a short delay to allow xterm.js to settle
      setTimeout(() => { isRestoringScroll = false; }, 100);
    }
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

    // Explicitly handle Ctrl+V for pasting and Ctrl+C for copying
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.code === "KeyV" && e.type === "keydown") {
        // xterm.js handles the native 'paste' event automatically when we return false
        return false;
      }
      if (e.ctrlKey && e.code === "KeyC" && e.type === "keydown") {
        const selection = term?.getSelection();
        if (selection && selection.length > 0) {
          navigator.clipboard.writeText(selection).catch(() => {});
          return false;
        }
      }
      return true;
    });

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
      const bytes = textEncoder.encode(data);
      writeToStdin(props.id, bytes).catch(console.error);
    });

    const scrollListener = term.onScroll(() => {
      if (!term || !props.isActive || isRestoringScroll) return;
      
      const buffer = term.buffer.active;
      // If the terminal is hidden, ignore scroll events as they are often 'resets' to 0
      if (!terminalElement || terminalElement.offsetHeight === 0) return;

      setScrollState({
        lastWasAtBottom: buffer.viewportY >= buffer.baseY - 1,
        savedViewportY: buffer.viewportY
      });
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
      scrollListener.dispose();
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

  // Activation Effect: Runs when props.isActive changes
  createEffect(() => {
    if (!term) return;

    if (props.isActive) {
      enableWebglIfNeeded();

      // Catch up once when switching back from an inactive workspace.
      const session = sessionStore.sessions[props.id];
      if (!wasActive && session && lastWrittenIndex < session.buffer.length) {
        const missed = session.buffer.slice(lastWrittenIndex);
        lastWrittenIndex = session.buffer.length;

        const writeAndRestore = () => {
          const state = getScrollState();
          if (state.lastWasAtBottom) {
            term?.scrollToBottom();
          } else {
            isRestoringScroll = true;
            term?.scrollToLine(state.savedViewportY);
            setTimeout(() => { isRestoringScroll = false; }, 100);
          }
        };

        if (missed.length > 0) {
          const lastChunk = missed.pop()!;
          missed.forEach(chunk => term?.write(chunk));
          // Use callback of the last chunk to ensure buffer is ready before scrolling
          term.write(lastChunk, writeAndRestore);
        } else {
          writeAndRestore();
        }
      }

      // Reduced delay pass: only two pulses to stabilize layout
      const recoverDelays = [10, 150];
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
          window.dispatchEvent(new Event("terminal-force-reflow"));
        } catch (e) {}
      }, 20);

      wasActive = true;
    } else {
      // Deactivating - capture current state before hiding if it was actually active and visible
      if (wasActive && term && terminalElement && terminalElement.offsetHeight > 0) {
        const buffer = term.buffer.active;
        setScrollState({
          lastWasAtBottom: buffer.viewportY >= buffer.baseY - 1,
          savedViewportY: buffer.viewportY
        });
      }

      disableWebglIfNeeded();
      wasActive = false;
    }
  });

  // Index Tracking Effect: Keeps background buffer in sync
  createEffect(() => {
    const session = sessionStore.sessions[props.id];
    if (session && term && props.isActive) {
      // Active terminals are streamed live via init.ts direct-pipe path.
      // Here we only keep index in sync to avoid duplicate rendering.
      lastWrittenIndex = session.buffer.length;
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
