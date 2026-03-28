interface SidebarProps {
  onLaunch: () => void;
}

export const Sidebar = (props: SidebarProps) => {
  return (
    <aside class="sidebar glass-panel">
      <div class="logo" style={{ 
        color: "var(--primary)", 
        "font-weight": "600", 
        "font-size": "1.5rem",
        "margin-bottom": "2rem" 
      }}>
        A
      </div>
      
      <div class="presets-list" style={{ 
        display: "flex", 
        "flex-direction": "column", 
        gap: "1rem",
        width: "100%",
        padding: "0 10px",
        "align-items": "center"
      }}>
        <button
          onClick={props.onLaunch}
          title="Deploy New Swarm"
          style={{
            width: "44px",
            height: "44px",
            background: "rgba(0, 229, 255, 0.1)",
            border: "1px solid var(--primary)",
            "border-radius": "12px",
            cursor: "pointer",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            transition: "all 0.2s ease",
            color: "var(--primary)",
            "font-size": "1.5rem",
            "font-weight": "bold"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 229, 255, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 229, 255, 0.1)";
          }}
        >
          +
        </button>
      </div>
    </aside>
  );
};
