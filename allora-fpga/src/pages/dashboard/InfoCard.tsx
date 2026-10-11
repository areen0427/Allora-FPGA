import type { CSSProperties, ReactNode } from "react";

type InfoCardProps = {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  compact?: boolean;
};

export default function InfoCard({
  title,
  children,
  style,
  compact = false,
  className,
}: InfoCardProps) {
  return (
    <div
      className={`dashboard-glass-card${className ? ` ${className}` : ""}`}
      style={{
        border: "1px solid var(--ui-border-subtle)",
        borderRadius: "var(--ui-radius-2xl)",
        padding: "28px",
        ...style,
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: compact ? "16px" : "22px",
          fontSize: compact ? "18px" : "24px",
          letterSpacing: "-0.03em",
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div style={{ marginTop: compact ? "13px" : "18px" }}>
      <div
        style={{
          fontSize: compact ? "11px" : "13px",
          fontWeight: 800,
          color: "var(--ui-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: compact ? "4px" : "5px",
          fontSize: compact ? "14px" : "19px",
          fontWeight: 750,
          color: "var(--ui-text)",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}
