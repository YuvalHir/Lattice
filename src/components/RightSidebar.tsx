import { sessionStore, toggleSourceControl } from "../store/sessionStore";

export const RightSidebar = () => {
  return (
    <div class="right-sidebar">
      <div style={{ display: "flex", "flex-direction": "column", gap: "12px", "align-items": "center" }}>
        {/* SOURCE CONTROL TOGGLE */}
        <button
          onClick={() => toggleSourceControl()}
          title="Source Control"
          style={{
            width: "36px",
            height: "36px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            transition: "all 0.2s ease",
            color: sessionStore.isSourceControlOpen ? "var(--accent-primary)" : "var(--text-muted)",
            opacity: sessionStore.isSourceControlOpen ? 1 : 0.6
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M6 9v7a3 3 0 0 0 3 3h3"></path>
            <line x1="18" y1="9" x2="18" y2="15"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};
