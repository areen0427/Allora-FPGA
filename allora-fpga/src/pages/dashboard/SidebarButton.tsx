import type { ReactNode } from "react";

type SidebarButtonProps = {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
};

export default function SidebarButton({
  label,
  icon,
  active,
  onClick,
}: SidebarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`sidebarNavButton${active ? " active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
