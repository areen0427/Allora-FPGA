import type { ReactNode, RefObject } from "react";
import { Cpu, Home, Map as MapIcon, Settings } from "lucide-react";

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
        <div className="welcome-rail-logo">
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

        <RailButton
          active={activeView === "pin-mapping"}
          label="Pin Mapping"
          onClick={() => onViewChange("pin-mapping")}
        >
          <MapIcon size={20} />
        </RailButton>

        <RailButton label="Settings" onClick={onOpenSettings}>
          <Settings size={20} />
        </RailButton>

        <div className="welcome-rail-spacer" />
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
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "welcome-rail-button active" : "welcome-rail-button"}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
