import type { ReactNode } from "react";

type SidebarButtonProps = {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  comingSoon?: boolean;
};

export default function SidebarButton({
  label,
  icon,
  active,
  onClick,
  comingSoon = false,
}: SidebarButtonProps) {
  return (
    <button
      type="button"
      aria-label={comingSoon ? `${label} (Coming soon)` : label}
      title={comingSoon ? `${label} (Coming soon)` : label}
      className={`sidebarNavButton${active ? " active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {comingSoon && <small className="sidebar-coming-soon">Coming soon</small>}
    </button>
  );
}
