import type { BoardDefinition } from "../data/boards";
import {
  getErrorMessage,
  findTopModule,
  isTestbenchFile,
} from "../hooks/utils";
import {
  boardMigrationApi,
  migrationPinProblems,
  readMigrationConstraints,
} from "./boardMigration";
import { createTauriChannel, invokeTauri } from "./tauri";
import { writeProjectFile } from "./projectWorkspace";

export type MigrationCheck = {
  name: string;
  state: "passed" | "failed" | "skipped";
  detail: string;
};

/** Finite local verification only. Programming is a separate explicit workflow. */
export async function validateMigration(
  projectPath: string,
  board: BoardDefinition,
  onProgress: (checks: MigrationCheck[]) => void,
) {
  const snapshot = await boardMigrationApi.inspect(projectPath);
  const checks: MigrationCheck[] = [];
  const publish = (check: MigrationCheck) => {
    checks.push(check);
    onProgress([...checks]);
  };
  const textFiles = snapshot.files
    .filter((file) => file.content !== null)
    .map((file) => ({
      name: file.relativePath.replace(/^src\//, ""),
      content: file.content!,
    }));
  const hdl = textFiles.filter((file) => /\.(v|sv)$/i.test(file.name));
  const testbenches = hdl.filter(
    (file) =>
      isTestbenchFile(file, snapshot.topModule) || file.name.startsWith("sim/"),
  );
  const sources = hdl.filter((file) => !testbenches.includes(file));
  const metadata = JSON.parse(
    snapshot.files.find((file) => file.relativePath === "allora-project.json")!
      .content!,
  );
  if (metadata.boardId !== board.id)
    throw new Error("The project board changed. Reopen it before validating.");
  if (metadata.boardMigration?.requiresReview)
    throw new Error(
      "Complete the manual migration review before running validation.",
    );
  if (snapshot.portError) throw new Error(snapshot.portError);
  const pinProblems = migrationPinProblems(snapshot, board);
  if (pinProblems.length) throw new Error(pinProblems.join("\n"));
  if (testbenches.length === 1) {
    try {
      await invokeTauri("simulate_testbench", {
        onLog: createTauriChannel<string>(() => {}),
        request: {
          projectName: metadata.name,
          sourceFiles: sources,
          testbenchFile: testbenches[0],
          topModule: findTopModule([testbenches[0]]),
          projectPath,
        },
      });
      publish({
        name: "Testbench simulation",
        state: "passed",
        detail:
          "The existing testbench ran successfully. Coverage depends on its assertions.",
      });
    } catch (error) {
      publish({
        name: "Testbench simulation",
        state: "failed",
        detail: getErrorMessage(error),
      });
    }
  } else
    publish({
      name: "Testbench simulation",
      state: "skipped",
      detail: testbenches.length
        ? "Choose a testbench in Testbench to verify this design."
        : "No existing testbench. Add one in Testbench to verify behavior.",
    });
  try {
    await invokeTauri("generate_synthesis_diagram", {
      request: {
        projectName: metadata.name,
        projectPath,
        boardName: board.name,
        fpgaId: board.fpgaId,
        synthesisFlow: board.synthesisFlow,
        topModule: snapshot.topModule,
        files: sources,
      },
    });
    publish({
      name: "Synthesis",
      state: "passed",
      detail: "The destination design synthesized successfully.",
    });
  } catch (error) {
    publish({
      name: "Synthesis",
      state: "failed",
      detail: getErrorMessage(error),
    });
  }
  const constraints = snapshot.files.find(
    (file) =>
      file.relativePath === `constraints/constraints.${board.constraintsFile}`,
  );
  try {
    if (!constraints?.content)
      throw new Error("The destination constraints file is missing.");
    const parsed = readMigrationConstraints(snapshot.files, board);
    const clocks = [...parsed.assignments].flatMap(([port, pad]) =>
      board.clocks
        .filter((clock) => clock.pin === pad && clock.verified)
        .map((clock) => ({ port, clock })),
    );
    const clock = clocks.length === 1 ? clocks[0] : null;
    const result = await invokeTauri<{
      timing: {
        status: string;
        message?: string;
        achievedFrequencyMhz?: number;
        worstSlackNs?: number;
      };
      artifactPath?: string;
    }>("generate_bitstream", {
      onLog: createTauriChannel<string>(() => {}),
      request: {
        projectName: metadata.name,
        projectPath,
        boardName: board.name,
        boardFamily: board.family,
        boardPackage: board.package,
        fpgaId: board.fpgaId,
        synthesisFlow: board.synthesisFlow,
        topModule: snapshot.topModule,
        sourceFiles: sources,
        constraintFile: {
          name: `constraints.${board.constraintsFile}`,
          content: constraints.content,
        },
        outputExtension: board.family.toLowerCase().includes("ice40")
          ? "bin"
          : "bit",
        targetClockName: clock?.port ?? null,
        targetFrequencyMhz: clock ? clock.clock.frequency / 1e6 : null,
      },
    });
    publish({
      name: "Bitstream build",
      state: "passed",
      detail: result.artifactPath ?? "The destination bitstream was generated.",
    });
    const status = result.timing.status;
    publish({
      name: "Timing",
      state:
        status === "pass" ? "passed" : status === "fail" ? "failed" : "skipped",
      detail:
        result.timing.message ??
        `Timing status: ${status}. Review the Timing view for the complete result.`,
    });
  } catch (error) {
    publish({
      name: "Bitstream build",
      state: "failed",
      detail: getErrorMessage(error),
    });
    publish({
      name: "Timing",
      state: "skipped",
      detail:
        "The destination build did not produce a completed timing report.",
    });
  }
  publish({
    name: "Physical hardware",
    state: "skipped",
    detail:
      "Physical operation has not been tested. Programming requires a separate explicit action.",
  });
  const fresh = await boardMigrationApi.inspect(projectPath);
  if (fresh.fingerprint !== snapshot.fingerprint)
    throw new Error(
      "Project files changed during validation. Run validation again for the new revision.",
    );
  await writeProjectFile(
    `${projectPath}/build/board-migration-validation.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        boardId: board.id,
        fingerprint: snapshot.fingerprint,
        completedAt: new Date().toISOString(),
        checks,
      },
      null,
      2,
    ),
  );
  return checks;
}
