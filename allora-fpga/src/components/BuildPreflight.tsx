import { Check, CircleAlert, CircleX, ChevronRight } from "lucide-react";
import type { PreflightCheck } from "../lib/buildPreflight";

export function BuildPreflight({
  checks,
  onNavigate,
}: {
  checks: PreflightCheck[];
  onNavigate?: (destination: "editor" | "pin-mapping") => void;
}) {
  const blockers = checks.filter((check) => check.state === "blocked").length;
  return (
    <div className="build-preflight">
      <div className="build-preflight-summary">
        <strong>Build preflight</strong>
        <span className={blockers ? "blocked" : "ready"}>
          {blockers
            ? `${blockers} blocker${blockers === 1 ? "" : "s"}`
            : "No blockers found"}
        </span>
      </div>
      <div className="build-preflight-list">
        {checks.map((check) => {
          const Icon =
            check.state === "ready"
              ? Check
              : check.state === "blocked"
                ? CircleX
                : CircleAlert;
          const content = (
            <>
              <Icon size={16} aria-hidden="true" />
              <span>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
              {check.destination && onNavigate ? (
                <ChevronRight size={15} aria-hidden="true" />
              ) : null}
            </>
          );
          return check.destination && onNavigate ? (
            <button
              key={check.id}
              type="button"
              className={`build-preflight-item ${check.state}`}
              onClick={() => onNavigate(check.destination!)}
            >
              {content}
            </button>
          ) : (
            <div
              key={check.id}
              className={`build-preflight-item ${check.state}`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
