import { useState } from "react";
import {
  Check,
  CircleAlert,
  CircleX,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { PreflightCheck } from "../lib/buildPreflight";

export function BuildPreflight({
  checks,
  onNavigate,
  collapsible = false,
}: {
  checks: PreflightCheck[];
  onNavigate?: (destination: "editor" | "pin-mapping") => void;
  collapsible?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const blockers = checks.filter((check) => check.state === "blocked").length;
  const warnings = checks.filter((check) => check.state === "warning").length;
  const expanded = !collapsible || showDetails || blockers > 0;
  return (
    <div className={`build-preflight${collapsible ? " compact" : ""}`}>
      <div className="build-preflight-summary">
        <strong>Build preflight</strong>
        <span className={blockers ? "blocked" : "ready"}>
          {blockers
            ? `${blockers} blocker${blockers === 1 ? "" : "s"}`
            : warnings
              ? `${warnings} ${warnings === 1 ? "advisory" : "advisories"}`
              : "Ready to build"}
        </span>
        {collapsible && blockers === 0 ? (
          <button
            type="button"
            className="build-preflight-toggle"
            aria-expanded={expanded}
            onClick={() => setShowDetails((current) => !current)}
          >
            {expanded ? "Hide checks" : "Show checks"}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {expanded ? (
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
      ) : null}
    </div>
  );
}
