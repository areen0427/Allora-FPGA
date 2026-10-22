import { Check, CircleAlert, RefreshCw } from "lucide-react";
import type { BoardDefinition } from "../data/boards";
import { getBoardCapabilities } from "../data/boardCapabilities";
import { useToolchainReadiness } from "../hooks/useToolchainReadiness";

/** The same local detection and installation guidance before and after creation. */
export default function ToolchainWizard({ board }: { board: BoardDefinition }) {
  const { requirements, tools, checking, nativeAvailable, error, recheck } = useToolchainReadiness(board);
  const capabilities = getBoardCapabilities(board);
  const missing = requirements.filter((requirement) =>
    tools.find((tool) => tool.command === requirement.command)?.available === false,
  ).length;
  const allDetected = requirements.length > 0 && requirements.every((requirement) =>
    tools.find((tool) => tool.command === requirement.command)?.available,
  );
  const summary = requirements.length === 0 ? "No tool checks configured" : !nativeAvailable ? "Desktop check required"
    : checking ? "Checking local tools…"
      : error ? "Detection unavailable"
        : allDetected ? "Tools detected"
          : missing ? `${missing} missing tool${missing === 1 ? "" : "s"}` : "Detection incomplete";

  return (
    <div className="toolchain-wizard">
      <div className="toolchain-wizard-toolbar">
        <strong className={allDetected ? "toolchain-status-ready" : "toolchain-status-pending"} role="status" aria-live="polite">{summary}</strong>
        <button type="button" className="ui-button ui-button-secondary" disabled={!nativeAvailable || checking} onClick={recheck}>
          <RefreshCw size={14} aria-hidden="true" /> Recheck
        </button>
      </div>
      <p className="toolchain-wizard-copy">{board.name} · {capabilities.toolchain}.</p>
      {!nativeAvailable ? <p className="toolchain-wizard-copy">Open Allora’s desktop app to detect installed tools. Installation directions are available below.</p> : null}
      {error ? <p className="toolchain-wizard-error" role="alert">{error}</p> : null}
      {!capabilities.bitstream.supported ? <p className="toolchain-wizard-warning">{capabilities.bitstream.detail} Installing tools does not add an app build runner.</p> : null}
      <div className="toolchain-wizard-tools">
        {requirements.map((requirement) => {
          const detected = tools.find((tool) => tool.command === requirement.command);
          const available = detected?.available === true;
          const state = !nativeAvailable ? "Not checked" : checking ? "Checking…" : error || !detected ? "Not checked" : available ? "Detected" : "Missing";
          const Icon = available ? Check : CircleAlert;
          return (
            <div className="toolchain-wizard-tool" key={requirement.command}>
              <div className="toolchain-wizard-tool-heading">
                <strong>{requirement.label}</strong>
                <span className={available ? "toolchain-status-ready" : "toolchain-status-pending"}><Icon size={14} aria-hidden="true" /> {state}</span>
              </div>
              <p>{requirement.purpose}</p>
              {available ? <code className="toolchain-wizard-path">{detected.path}</code> : <>
                <p>{requirement.installHint}</p>
                <a href={requirement.downloadUrl} target="_blank" rel="noreferrer">Download / installation guide</a>
              </>}
            </div>
          );
        })}
      </div>
      {capabilities.programming.supported && !requirements.some((tool) => tool.purpose.includes("Programming")) ? <p className="toolchain-wizard-copy">Automatic detection is not configured for this board’s programmer. Check its adapter and installation instructions before programming.</p> : null}
      {!capabilities.programming.supported && <p className="toolchain-wizard-copy">No app programmer is configured for this board. A detected programming tool does not verify the adapter or connected hardware.</p>}
      <p className="toolchain-wizard-copy">After installing, make the executables available on PATH (or in Allora’s supported tool locations), then Recheck. You can create a project while tools are missing.</p>
    </div>
  );
}
