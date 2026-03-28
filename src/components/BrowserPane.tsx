import { createSignal } from "solid-js";
import { updateBrowserUrl } from "../store/sessionStore";

interface BrowserPaneProps {
  id: string;
  initialUrl: string;
}

const normalizeUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "https://example.com";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
};

export const BrowserPane = (props: BrowserPaneProps) => {
  const [inputUrl, setInputUrl] = createSignal(props.initialUrl);
  const [currentUrl, setCurrentUrl] = createSignal(normalizeUrl(props.initialUrl));

  const navigate = () => {
    const next = normalizeUrl(inputUrl());
    setCurrentUrl(next);
    updateBrowserUrl(props.id, next);
  };

  return (
    <div class="browser-pane">
      <div class="browser-toolbar">
        <input
          class="browser-url-input"
          value={inputUrl()}
          onInput={(e) => setInputUrl(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate();
          }}
          placeholder="http://localhost:3000"
        />
        <button class="btn-browse" onClick={navigate}>
          Go
        </button>
      </div>

      <iframe
        class="browser-frame"
        src={currentUrl()}
        title="Workspace Browser"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
};
