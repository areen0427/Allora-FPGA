import type { CSSProperties, ReactNode } from "react";

type InfoCardProps = {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  compact?: boolean;
};

export default function InfoCard({ title, children, style, compact = false }: InfoCardProps) {
  return (
    <div
      className="dashboard-glass-card"
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "24px",
        padding: "28px",
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
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
          color: "#64748b",
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
          color: "#0f172a",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}
