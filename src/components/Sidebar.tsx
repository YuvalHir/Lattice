interface SidebarProps {
  onLaunch: () => void;
}

const HexagonLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L20.6603 7V17L12 22L3.33975 17V7L12 2Z" stroke="var(--accent-primary)" stroke-width="1.5"/>
    <path d="M12 2V22" stroke="var(--border-main)" stroke-width="1"/>
    <path d="M3.33975 7L20.6603 17" stroke="var(--border-main)" stroke-width="1"/>
    <path d="M3.33975 17L20.6603 7" stroke="var(--border-main)" stroke-width="1"/>
  </svg>
);

export const Sidebar = (props: SidebarProps) => {
  return (
    <aside class="sidebar">
      <div class="sidebar-logo">
        <HexagonLogo />
      </div>
      
      <div style={{ display: "flex", "flex-direction": "column", gap: "0.75rem", "align-items": "center" }}>
        {/* PRIMARY ACTION: NEW SESSION */}
        <button
          onClick={props.onLaunch}
          title="New Sessions"
          style={{
            width: "36px",
            height: "36px",
            background: "var(--accent-primary)",
            border: "none",
            "border-radius": "4px",
            cursor: "pointer",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            transition: "all 0.2s ease",
            color: "#000",
            "margin-bottom": "0.5rem"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = "0 0 10px rgba(88, 166, 255, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>

        <button
          title="Explorer"
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
            color: "var(--text-muted)"
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>

        <button
          title="Search"
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
            color: "var(--text-muted)"
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
      </div>

      <div style={{ "margin-top": "auto", opacity: 0.3, "padding-bottom": "1rem" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </div>
    </aside>
  );
};
