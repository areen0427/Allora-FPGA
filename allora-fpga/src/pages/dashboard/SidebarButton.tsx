import type { MouseEventHandler, ReactNode } from "react";
import { useDockScale } from "../../components/ui/floating-dock-context";

type SidebarButtonProps = {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  comingSoon?: boolean;
};

export default function SidebarButton({
  label,
  icon,
  active,
  onClick,
  disabled = false,
  comingSoon = false,
}: SidebarButtonProps) {
  const scale = useDockScale(label);

  return (
    <button
      type="button"
      aria-label={comingSoon ? `${label} (Coming soon)` : label}
      aria-current={active ? "page" : undefined}
      data-dock-label={label}
      className={`sidebarNavButton${active ? " active" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="dock-icon" style={{ transform: `scale(${scale})` }}>
        {icon}
      </span>
      <span>{label}</span>
      {comingSoon && <small className="sidebar-coming-soon">Coming soon</small>}
    </button>
  );
}
