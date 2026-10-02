import type { ReactNode, RefObject } from "react";
import { ArrowLeft, Settings } from "lucide-react";
import alloraIcon from "../../../src-tauri/icons/128x128.png";

export type WelcomeView = "home" | "pin-mapping" | "chat";

type WelcomeShellProps = {
  activeView: WelcomeView;
  brandRef: RefObject<HTMLButtonElement | null>;
  showProductInfo: boolean;
  onOpenProductInfo?: () => void;
  maxWidth: string;
  newProjectRef: RefObject<HTMLElement | null>;
  onViewChange: (view: WelcomeView) => void;
  onOpenSettings: () => void;
  onBack?: () => void;
  children: ReactNode;
};

export function WelcomeShell({
  activeView,
  brandRef,
  showProductInfo,
  onOpenProductInfo,
  maxWidth,
  newProjectRef,
  onViewChange,
  onOpenSettings,
  onBack,
  children,
}: WelcomeShellProps) {
  return (
    <div className="glass-page welcome-page">
      <aside className="home-rail welcome-rail">
        <button
          ref={brandRef}
          type="button"
          className="welcome-rail-logo"
          title={onOpenProductInfo ? "Product information" : "Home"}
          aria-label={onOpenProductInfo ? "Product information" : "Home"}
          aria-expanded={onOpenProductInfo ? showProductInfo : undefined}
          aria-controls={onOpenProductInfo ? "welcome-product-info" : undefined}
          aria-current={activeView === "home" ? "page" : undefined}
          onClick={() => {
            if (onOpenProductInfo) {
              onOpenProductInfo();
              return;
            }
            onViewChange("home");
            newProjectRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <img src={alloraIcon} alt="" />
        </button>

        {onBack && (
          <RailButton filled label={activeView === "chat" ? "Back to Build" : "Back to welcome"} onClick={onBack}>
            <ArrowLeft size={20} />
          </RailButton>
        )}

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
  filled,
  active,
  label,
  onClick,
  children,
}: {
  filled?: boolean;
  active?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`welcome-rail-button${filled ? " filled" : ""}`}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
