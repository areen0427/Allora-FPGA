import type { CSSProperties, ReactNode } from "react";

type DashboardSurfaceCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export default function DashboardSurfaceCard({
  children,
  className = "",
  style,
}: DashboardSurfaceCardProps) {
  return (
    <div
      className={`dashboard-surface-card${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </div>
  );
}
