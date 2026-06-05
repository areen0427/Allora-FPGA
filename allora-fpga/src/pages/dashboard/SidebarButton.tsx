type SidebarButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

export default function SidebarButton({
  label,
  active,
  onClick,
}: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: "12px",
        padding: "10px 12px",
        textAlign: "left",
        fontSize: "14px",
        fontWeight: 700,
        cursor: "pointer",
        background: active
          ? "linear-gradient(90deg, #dbeafe 0%, rgba(219,234,254,0.55) 56%, rgba(219,234,254,0) 100%)"
          : "transparent",
        color: active ? "#2563eb" : "#475569",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}
