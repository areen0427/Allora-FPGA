import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, FolderOpen } from "lucide-react";
import { REAL_BOARDS, type BoardDefinition } from "../../data/boards";
import { getBoardCapabilities } from "../../data/boardCapabilities";
import { WorkspaceTitle } from "../../components/ui/WorkspaceTitle";
import { getPinOptions } from "./pinMappingUtils";
import type { DashboardSection, ProjectFile } from "./types";
import {
  boardMigrationApi,
  clockParameterOptions,
  migrationEligibility,
  migrationPinProblems,
  planBoardMigration,
  readMigrationReport,
  type MigrationChoices,
  type MigrationIssue,
  type MigrationPlan,
  type MigrationSnapshot,
} from "../../lib/boardMigration";
import { hasTauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../hooks/utils";
import {
  pickProjectParentDirectory,
  writeProjectFile,
} from "../../lib/projectWorkspace";
import { createProject } from "../../data/projects";
import { getBuildPreflight } from "../../lib/buildPreflight";
import {
  validateMigration,
  type MigrationCheck,
} from "../../lib/migrationValidation";

type Props = {
  active: boolean;
  board: BoardDefinition;
  files: ProjectFile[];
  projectPath?: string;
  topLevelFileName: string | null;
  onSave: () => Promise<boolean>;
  onReload: () => Promise<unknown>;
  onOpenCopy: (path: string, section: DashboardSection) => Promise<void>;
  onNavigate: (section: DashboardSection, file?: string, line?: number) => void;
};

function Issues({
  issues,
  onOpen,
  reviewed = false,
}: {
  issues: MigrationIssue[];
  onOpen: (issue: MigrationIssue) => void;
  reviewed?: boolean;
}) {
  return (
    <ul className="migration-issues">
      {issues.map((issue) => (
        <li key={issue.id} data-level={issue.level}>
          <span>
            {issue.level === "info"
              ? "Information"
              : reviewed
                ? "Reviewed item"
                : issue.level === "blocked"
                  ? "Unavailable"
                  : "Needs your review"}
          </span>
          <p>{issue.message}</p>
          {(issue.file || issue.port) && (
            <button
              className="ui-text-action"
              type="button"
              onClick={() => onOpen(issue)}
            >
              {issue.file
                ? `${issue.file}${issue.line ? `:${issue.line}` : ""}`
                : `Review ${issue.port}`}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function BoardMigrationSection({
  active,
  board,
  files,
  projectPath,
  topLevelFileName,
  onSave,
  onReload,
  onOpenCopy,
  onNavigate,
}: Props) {
  const metadataFile = files.find(
    (file) => file.name === "allora-project.json",
  );
  const report = readMigrationReport(metadataFile?.content);
  let savedTop = "";
  try {
    savedTop = JSON.parse(metadataFile?.content ?? "").topModule ?? "";
  } catch {
    /* Inspection supplies the error. */
  }
  const [newMigration, setNewMigration] = useState(!report);
  const [targetId, setTargetId] = useState("");
  const [topModule, setTopModule] = useState(savedTop);
  const [snapshot, setSnapshot] = useState<MigrationSnapshot | null>(null);
  const [choices, setChoices] = useState<MigrationChoices>({});
  const [phase, setPhase] = useState<
    "idle" | "analyzing" | "copying" | "validating" | "reviewing"
  >("idle");
  const [error, setError] = useState("");
  const [createdPath, setCreatedPath] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [previewFirst, setPreviewFirst] = useState(false);
  const [checks, setChecks] = useState<MigrationCheck[]>([]);
  const [checkedRevision, setCheckedRevision] = useState("");
  const sequence = useRef(0);
  const alive = useRef(true);
  const visible = useRef(active);
  useEffect(() => {
    visible.current = active;
  }, [active]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const target = REAL_BOARDS.find((candidate) => candidate.id === targetId);
  const plan = useMemo(
    () =>
      snapshot && target
        ? planBoardMigration(snapshot, board, target, choices)
        : null,
    [snapshot, board, target, choices],
  );
  const busy = phase !== "idle";
  const revision = JSON.stringify(
    files
      .filter((file) => !file.path?.replaceAll("\\", "/").includes("/build/"))
      .map((file) => [file.path ?? file.name, file.content]),
  );
  const shownChecks = checkedRevision === revision ? checks : [];
  const available = Boolean(projectPath && hasTauriInvoke());
  const sortedBoards = [...REAL_BOARDS]
    .filter((item) => item.id !== board.id)
    .filter((item) => {
      const capabilities = getBoardCapabilities(item);
      return (
        capabilities.programming.supported &&
        capabilities.synthesisDiagram.supported &&
        capabilities.bitstream.supported
      );
    })
    .sort(
      (a, b) =>
        Number(Boolean(migrationEligibility(a))) -
          Number(Boolean(migrationEligibility(b))) ||
        a.name.localeCompare(b.name),
    );

  async function createCopy(
    source: MigrationSnapshot,
    proposal: MigrationPlan,
    operation = sequence.current,
  ) {
    if (proposal.blocked) return;
    setPhase("copying");
    const result = await boardMigrationApi.createCopy(
      source,
      proposal,
      parentDirectory,
    );
    // Registration survives navigation while the native copy completes.
    const metadata = JSON.parse(
      proposal.patches.find(
        (patch) => patch.relativePath === "allora-project.json",
      )!.content,
    );
    createProject({
      name: metadata.name,
      boardId: metadata.boardId,
      projectKind: "hardware",
      projectPath: result.projectPath,
      language: metadata.language,
      files: [],
      lastExecutionTarget: "build",
    });
    if (!alive.current || operation !== sequence.current) return;
    setCreatedPath(result.projectPath);
    setPhase("idle");
    if (visible.current)
      await onOpenCopy(result.projectPath, "board-migration");
  }

  async function migrate() {
    if (!projectPath || !target) return;
    const operation = ++sequence.current;
    setError("");
    setPhase("analyzing");
    setSnapshot(null);
    setChoices({});
    setCreatedPath("");
    try {
      if (!(await onSave()))
        throw new Error(
          "Save the source project successfully before migration.",
        );
      if (operation !== sequence.current || !alive.current) return;
      const result = await boardMigrationApi.inspect(
        projectPath,
        topModule || undefined,
      );
      if (operation !== sequence.current || !alive.current) return;
      setSnapshot(result);
      const proposal = planBoardMigration(result, board, target);
      if (proposal.automatic && visible.current && !previewFirst)
        await createCopy(result, proposal, operation);
      else setPhase("idle");
    } catch (failure) {
      if (operation === sequence.current && alive.current) {
        setError(getErrorMessage(failure));
        setPhase("idle");
      }
    }
  }

  async function continueMigration() {
    if (!snapshot || !plan) return;
    setError("");
    try {
      await createCopy(snapshot, plan);
    } catch (failure) {
      if (alive.current) {
        setPhase("idle");
        setError(getErrorMessage(failure));
      }
    }
  }

  async function finishReview() {
    if (!projectPath || !acknowledged) return;
    setPhase("reviewing");
    setError("");
    try {
      if (!(await onSave()))
        throw new Error("Save the project before completing its review.");
      const current = await boardMigrationApi.inspect(projectPath);
      if (current.portError) throw new Error(current.portError);
      const pinProblems = migrationPinProblems(current, board);
      if (pinProblems.length) throw new Error(pinProblems.join("\n"));
      const currentFiles = current.files
        .filter((file) => file.content !== null)
        .map((file) => ({
          name: file.relativePath.startsWith("src/")
            ? file.relativePath.slice(4)
            : file.relativePath.split("/").at(-1)!,
          path: `${projectPath}/${file.relativePath}`,
          content: file.content!,
        }));
      const problems = getBuildPreflight({
        board,
        files: currentFiles,
        topLevelFileName,
        nativeAvailable: true,
        yosysAvailable: true,
      }).filter(
        (check) => check.id !== "migration" && check.state === "blocked",
      );
      if (problems.length)
        throw new Error(problems.map((check) => check.detail).join("\n"));
      const metadata = JSON.parse(
        current.files.find(
          (file) => file.relativePath === "allora-project.json",
        )!.content!,
      );
      metadata.boardMigration = {
        ...metadata.boardMigration,
        requiresReview: false,
        reviewedAt: new Date().toISOString(),
      };
      await writeProjectFile(
        `${projectPath}/allora-project.json`,
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
      await onReload();
      setAcknowledged(false);
    } catch (failure) {
      if (alive.current) setError(getErrorMessage(failure));
    } finally {
      if (alive.current) setPhase("idle");
    }
  }

  async function runValidation() {
    if (!projectPath) return;
    setPhase("validating");
    setError("");
    setChecks([]);
    setCheckedRevision(revision);
    try {
      if (!(await onSave()))
        throw new Error("Save the migrated project before validation.");
      await validateMigration(projectPath, board, (value) => {
        if (alive.current) setChecks(value);
      });
    } catch (failure) {
      if (alive.current) {
        setError(getErrorMessage(failure));
        setChecks([]);
      }
    } finally {
      if (alive.current) setPhase("idle");
    }
  }

  const openIssue = (issue: MigrationIssue) => {
    const archived =
      issue.file && report
        ? `.allora-migration/${report.sourceFingerprint.slice(0, 16)}/${issue.file}.txt`
        : undefined;
    const path =
      archived && files.some((file) => file.path?.endsWith(`/${archived}`))
        ? archived
        : issue.file;
    onNavigate(
      issue.port && !path ? "pin-mapping" : "editor",
      path,
      issue.line,
    );
  };

  return (
    <section
      className="board-migration-section ui-workspace-panel"
      aria-busy={busy}
    >
      <WorkspaceTitle section="board-migration" />
      <div className="migration-layout ui-workspace-columns">
        <div className="migration-main">
          {report && (
            <section className="migration-summary">
              <h2>
                {report.requiresReview
                  ? "Continue your migration"
                  : "Migration summary"}
              </h2>
              <p>
                {report.sourceBoardName} → {board.name}
              </p>
              <p>
                {report.requiresReview
                  ? "The migrated copy contains the safe automatic changes. Resolve the items below, then complete your review."
                  : "The project copy is ready for validation. You can edit its files and pin assignments at any time."}
              </p>
              <div className="ui-compact-button-group migration-actions">
                <button type="button" onClick={() => onNavigate("pin-mapping")}>
                  Edit pin mapping
                </button>
                <button type="button" onClick={() => onNavigate("editor")}>
                  Edit project
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setNewMigration((value) => !value)}
                >
                  Start another migration
                </button>
              </div>
              <details>
                <summary>Files changed and preserved content</summary>
                <ul>
                  {report.changes.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
                <p>
                  HDL, testbenches, binary assets, design-tool manifests,
                  generated design sources and other project files were copied
                  with their folder structure. Source constraints are preserved
                  under .allora-migration. Excluded caches and repository
                  metadata:{" "}
                  {report.excluded.length
                    ? report.excluded.join(", ")
                    : "none found"}
                  .
                </p>
              </details>
              <details>
                <summary>
                  Assignments created by migration ({report.mappings.length})
                </summary>
                <ul className="migration-checks">
                  {report.mappings.map((row) => (
                    <li key={row.port.name}>
                      <strong>{row.port.name}</strong>
                      <p>
                        {row.source} →{" "}
                        {getPinOptions(board).find(
                          (option) => option.key === row.target,
                        )?.label ?? "Unmapped"}
                        {row.invert ? " · polarity adapter" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
              <details open={report.requiresReview}>
                <summary>
                  {report.requiresReview
                    ? "Items requiring manual review"
                    : "Migration decisions"}
                </summary>
                <Issues
                  issues={report.issues}
                  onOpen={openIssue}
                  reviewed={!report.requiresReview}
                />
              </details>
              {report.requiresReview && (
                <div className="migration-review-complete">
                  <label>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      disabled={busy}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />{" "}
                    I have resolved the migration issues in this copy.
                  </label>
                  <button
                    type="button"
                    className="ui-action-button"
                    disabled={!acknowledged || busy || !available}
                    onClick={() => void finishReview()}
                  >
                    Complete manual review
                  </button>
                </div>
              )}
              <h3>Validation</h3>
              <p>
                Simulation, synthesis, build, timing and physical testing are
                reported separately. Local tools must be installed.
              </p>
              <div className="ui-compact-button-group migration-actions">
                <button
                  type="button"
                  className="ui-action-button"
                  disabled={busy || report.requiresReview || !available}
                  onClick={() => void runValidation()}
                >
                  Run validation
                </button>
                <button type="button" onClick={() => onNavigate("testbench")}>
                  Testbench
                </button>
                <button type="button" onClick={() => onNavigate("bitstream")}>
                  Build and timing
                </button>
              </div>
              {shownChecks.length ? (
                <ul className="migration-checks">
                  {shownChecks.map((check) => (
                    <li key={check.name} data-state={check.state}>
                      <strong>
                        {check.name}: {check.state}
                      </strong>
                      <p>{check.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Validation has not run for this revision in this session.
                  Physical hardware has not been tested.
                </p>
              )}
            </section>
          )}

          {newMigration && (
            <>
              <section className="migration-setup">
                <h2>Migration setup</h2>
                {!available && (
                  <p className="migration-error">
                    Open a saved project in the desktop app to create a migrated
                    copy.
                  </p>
                )}
                <div className="migration-fields">
                  <label>
                    Destination board
                    <select
                      value={targetId}
                      disabled={busy || Boolean(createdPath)}
                      onChange={(event) => {
                        setTargetId(event.target.value);
                        setSnapshot(null);
                        setChoices({});
                        setError("");
                      }}
                    >
                      <option value="">Choose the New Board</option>
                      {sortedBoards.length === 0 && (
                        <option disabled value="">
                          No boards support both programming and builds
                        </option>
                      )}
                      {sortedBoards.map((item) => {
                        const reason = migrationEligibility(item);
                        return (
                          <option
                            key={item.id}
                            value={item.id}
                            title={reason ? `Migration unavailable: ${reason}` : item.name}
                            disabled={Boolean(reason)}
                          >
                            {item.name}
                            {reason ? " — migration unavailable" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label>
                    Top module
                    <input
                      value={topModule}
                      disabled={busy || Boolean(createdPath)}
                      onChange={(event) => {
                        setTopModule(event.target.value);
                        setSnapshot(null);
                      }}
                      spellCheck={false}
                    />
                  </label>
                </div>
                {target && (
                  <small>
                    {target.name} · {target.device} · {target.package}
                  </small>
                )}
                <div className="migration-actions ui-compact-button-group">
                  <button
                    type="button"
                    className="ui-action-button"
                    disabled={
                      !available ||
                      !target ||
                      !topModule.trim() ||
                      busy ||
                      Boolean(createdPath)
                    }
                    onClick={() => void migrate()}
                  >
                    <ArrowRightLeft size={16} />{" "}
                    {snapshot ? "Analyze again" : "Migrate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || Boolean(createdPath)}
                    onClick={() =>
                      void pickProjectParentDirectory()
                        .then((path) => {
                          if (path) setParentDirectory(path);
                        })
                        .catch((failure) => setError(getErrorMessage(failure)))
                    }
                  >
                    <FolderOpen size={15} /> Copy location
                  </button>
                  {phase === "analyzing" && (
                    <button
                      type="button"
                      onClick={() => {
                        sequence.current++;
                        setPhase("idle");
                      }}
                    >
                      Cancel analysis
                    </button>
                  )}
                </div>
                <small>
                  The copy will be created{" "}
                  {parentDirectory
                    ? `in ${parentDirectory}`
                    : "beside this project"}
                  . The source project stays available.
                </small>
                <label className="migration-clock-choice">
                  <input
                    type="checkbox"
                    checked={previewFirst}
                    disabled={busy}
                    onChange={(event) => setPreviewFirst(event.target.checked)}
                  />{" "}
                  Review proposed changes before creating a copy, even when
                  everything can be migrated automatically
                </label>
              </section>
              {plan && snapshot && (
                <section className="migration-proposal">
                  <h2>
                    {createdPath
                      ? "Project copy created"
                      : plan.blocked
                        ? "This destination is unavailable"
                        : plan.automatic
                          ? "Ready to create the migrated copy"
                          : "Automatic migration needs your help"}
                  </h2>
                  {!createdPath && (
                    <p>
                      {plan.automatic
                        ? "Every analyzed requirement has a verified migration. Review the changes or create the copy."
                        : "Review the exact issues below. Safe assignments are retained, and you can take over in a separate project copy."}
                    </p>
                  )}
                  <Issues issues={plan.issues} onOpen={openIssue} />
                  {plan.mappings.length > 0 && (
                    <div className="migration-table-scroll">
                      <table className="migration-table">
                        <thead>
                          <tr>
                            <th scope="col">Port</th>
                            <th scope="col">Source assignment</th>
                            <th scope="col">Destination assignment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.mappings.map((row) => (
                            <tr key={row.port.name}>
                              <th scope="row">
                                {row.port.name}
                                <small>{row.port.direction}</small>
                              </th>
                              <td>{row.source}</td>
                              <td>
                                <select
                                  aria-label={`Destination for ${row.port.name}`}
                                  value={row.target}
                                  disabled={busy || Boolean(createdPath)}
                                  onChange={(event) =>
                                    setChoices((value) => ({
                                      ...value,
                                      mappings: {
                                        ...value.mappings,
                                        [row.port.name]: event.target.value,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">Unmapped</option>
                                  {target &&
                                    getPinOptions(target).map((option) => (
                                      <option
                                        key={option.key}
                                        value={option.key}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                </select>
                                <small>{row.reason}</small>
                                {plan.issues.some(
                                  (issue) =>
                                    issue.id === `clock-rate:${row.port.name}`,
                                ) && (
                                  <>
                                    <label className="migration-clock-choice">
                                      <input
                                        type="checkbox"
                                        disabled={busy || Boolean(createdPath)}
                                        checked={
                                          choices.keepCycles?.[row.port.name] ??
                                          false
                                        }
                                        onChange={(event) =>
                                          setChoices((value) => ({
                                            ...value,
                                            keepCycles: {
                                              ...value.keepCycles,
                                              [row.port.name]:
                                                event.target.checked,
                                            },
                                            clockParameters: {
                                              ...value.clockParameters,
                                              [row.port.name]: "",
                                            },
                                          }))
                                        }
                                      />{" "}
                                      Preserve cycle counts and accept the
                                      changed real-time rate
                                    </label>
                                    {clockParameterOptions(snapshot).length >
                                      0 && (
                                      <label className="migration-clock-choice">
                                        Time-based parameter
                                        <select
                                          aria-label={`Clock parameter for ${row.port.name}`}
                                          disabled={
                                            busy || Boolean(createdPath)
                                          }
                                          value={
                                            choices.clockParameters?.[
                                              row.port.name
                                            ] ?? ""
                                          }
                                          onChange={(event) =>
                                            setChoices((value) => ({
                                              ...value,
                                              keepCycles: {
                                                ...value.keepCycles,
                                                [row.port.name]: false,
                                              },
                                              clockParameters: {
                                                ...value.clockParameters,
                                                [row.port.name]:
                                                  event.target.value,
                                              },
                                            }))
                                          }
                                        >
                                          <option value="">
                                            Review manually
                                          </option>
                                          {clockParameterOptions(snapshot).map(
                                            (option) => (
                                              <option
                                                key={option.key}
                                                value={option.key}
                                              >
                                                Update {option.name} in{" "}
                                                {option.file} ({option.value}{" "}
                                                Hz)
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </label>
                                    )}
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <details>
                    <summary>Preview file changes</summary>
                    {plan.patches.map((patch) => (
                      <details
                        key={patch.relativePath}
                        className="migration-file-diff"
                      >
                        <summary>{patch.relativePath}</summary>
                        <h4>Before</h4>
                        <pre>
                          {snapshot.files.find(
                            (file) => file.relativePath === patch.relativePath,
                          )?.content ?? "New file"}
                        </pre>
                        <h4>After</h4>
                        <pre>{patch.content}</pre>
                      </details>
                    ))}
                    <p>
                      Original constraint files will be archived with a .txt
                      suffix so they remain readable and inactive.
                    </p>
                  </details>
                  {createdPath ? (
                    <div>
                      <p>{createdPath}</p>
                      <button
                        type="button"
                        className="ui-action-button"
                        onClick={() =>
                          void onOpenCopy(createdPath, "board-migration").catch(
                            (failure) => setError(getErrorMessage(failure)),
                          )
                        }
                      >
                        Open migrated project
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ui-action-button"
                      disabled={plan.blocked || busy}
                      onClick={() => void continueMigration()}
                    >
                      {plan.automatic
                        ? "Create migrated copy"
                        : "Continue manually in a project copy"}
                    </button>
                  )}
                </section>
              )}
            </>
          )}
          {busy && (
            <p role="status">
              {phase === "analyzing"
                ? "Saving and analyzing the project…"
                : phase === "copying"
                  ? "Creating the migrated project copy…"
                  : phase === "reviewing"
                    ? "Checking your manual review…"
                    : "Running local validation…"}
            </p>
          )}
          {error && (
            <p role="alert" className="migration-error">
              {error}
            </p>
          )}
        </div>
        <aside className="ui-workspace-aside ui-workspace-framed migration-aside">
          <h2>Current board</h2>
          <strong>{board.name}</strong>
          <p>{board.device}</p>
        </aside>
      </div>
    </section>
  );
}
