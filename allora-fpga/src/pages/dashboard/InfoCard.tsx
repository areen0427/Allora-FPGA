import type { CSSProperties, ReactNode } from "react";

type InfoCardProps = {
  title: string;
  children: ReactNode;
  style?: CSSProperties;
};

export default function InfoCard({ title, children, style }: InfoCardProps) {
  return (
    <div
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
          marginBottom: "22px",
          fontSize: "24px",
          letterSpacing: "-0.03em",
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: "18px" }}>
      <div
        style={{
          fontSize: "13px",
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
          marginTop: "5px",
          fontSize: "19px",
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
