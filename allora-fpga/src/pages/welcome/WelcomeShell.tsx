import type { ReactNode, RefObject } from "react";
import { Cpu, Home, Settings } from "lucide-react";

export type WelcomeView = "home" | "pin-mapping";

type WelcomeShellProps = {
  activeView: WelcomeView;
  maxWidth: string;
  newProjectRef: RefObject<HTMLElement | null>;
  onViewChange: (view: WelcomeView) => void;
  onOpenSettings: () => void;
  children: ReactNode;
};

export function WelcomeShell({
  activeView,
  maxWidth,
  newProjectRef,
  onViewChange,
  onOpenSettings,
  children,
}: WelcomeShellProps) {
  return (
    <div className="glass-page welcome-page">
      <aside className="home-rail welcome-rail">
        <div className="welcome-rail-logo" aria-hidden="true">
          <Cpu size={20} color="white" strokeWidth={2.2} />
        </div>

        <RailButton
          active={activeView === "home"}
          label="Home"
          onClick={() => {
            onViewChange("home");
            newProjectRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <Home size={20} />
        </RailButton>

        <div className="welcome-rail-spacer" />

        <RailButton filled label="Settings" onClick={onOpenSettings}>
          <Settings size={20} />
        </RailButton>
      </aside>

      <main className="welcome-main">
        <div className="welcome-content" style={{ maxWidth }}>
          {children}
        </div>
      </main>
    </div>
  );
}

function RailButton({
  active,
  filled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  filled?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`welcome-rail-button${active ? " active" : ""}${filled ? " filled" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
