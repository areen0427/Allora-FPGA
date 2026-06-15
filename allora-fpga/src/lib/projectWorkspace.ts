import type { BoardDefinition } from "../data/boards";
import { createConstraintLines, getTemplateById } from "../data/templates";
import { invokeTauri } from "./tauri";
import type { ProjectFile } from "../pages/dashboard/types";

type WorkspaceFileRecord = {
  relativePath: string;
  absolutePath: string;
};

type CreateProjectWorkspaceResponse = {
  projectId: string;
  projectPath: string;
  files: WorkspaceFileRecord[];
};

type ReadProjectWorkspaceResponse = {
  files: Array<{
    relativePath: string;
    absolutePath: string;
    content: string;
    binary: boolean;
  }>;
};

export async function createProjectWorkspace({
  projectName,
  board,
  language,
  parentDirectory,
  templateId,
}: {
  projectName: string;
  board: BoardDefinition;
  language: "Verilog" | "SystemVerilog" | "VHDL";
  parentDirectory?: string | null;
  templateId?: string;
}) {
  const starterFiles = buildStarterFiles({
    projectName,
    board,
    language,
    templateId,
  });
  const folderName = sanitizeFolderName(projectName);
  const response = await invokeTauri<CreateProjectWorkspaceResponse>(
    "create_project_workspace",
    {
      request: {
        projectName,
        folderName,
        parentDirectory,
        files: starterFiles.map((file) => ({
          relativePath: file.relativePath,
          content: file.content,
        })),
      },
    },
  );

  const files: ProjectFile[] = response.files.map((writtenFile) => {
    const starterFile = starterFiles.find(
      (file) => file.relativePath === writtenFile.relativePath,
    );

    return {
      name:
        writtenFile.relativePath.split("/").pop() ?? writtenFile.relativePath,
      content: starterFile?.content ?? "",
      path: writtenFile.absolutePath,
    };
  });

  return {
    projectId: response.projectId,
    projectPath: response.projectPath,
    files,
    activeFileName: files[0]?.name ?? null,
  };
}

export async function writeProjectFile(path: string, content: string) {
  await invokeTauri("write_project_file", {
    request: {
      path,
      content,
    },
  });
}

export async function pickProjectParentDirectory() {
  return invokeTauri<string | null>("pick_project_parent_directory");
}

export async function pickExistingProjectDirectory() {
  return invokeTauri<string | null>("pick_existing_project_directory");
}

export async function renameProjectFile(fromPath: string, toPath: string) {
  await invokeTauri("rename_project_file", {
    request: {
      fromPath,
      toPath,
    },
  });
}

export async function deleteProjectFile(path: string) {
  await invokeTauri("delete_project_file", {
    request: { path },
  });
}

export async function readProjectWorkspace(projectPath: string) {
  const response = await invokeTauri<ReadProjectWorkspaceResponse>(
    "read_project_workspace",
    {
      request: {
        projectPath,
      },
    },
  );

  return response.files.map((file) => ({
    name: file.relativePath.split("/").pop() ?? file.relativePath,
    path: file.absolutePath,
    content: file.content,
    isBinary: file.binary,
  }));
}

export function buildProjectFilePath(projectPath: string, fileName: string) {
  return `${projectPath}/src/${fileName}`;
}

function buildStarterFiles({
  projectName,
  board,
  language,
  templateId,
}: {
  projectName: string;
  board: BoardDefinition;
  language: "Verilog" | "SystemVerilog" | "VHDL";
  templateId?: string;
}) {
  const topModule = sanitizeModuleName(projectName || "top");
  const sourceExtension =
    language === "SystemVerilog" ? "sv" : language === "VHDL" ? "vhd" : "v";
  const sourceRelativePath = `src/${topModule}.${sourceExtension}`;
  const constraintsRelativePath = `constraints/constraints.${board.constraintsFile}`;
  const projectRelativePath = "allora-project.json";

  // "blinky" (and anything unknown) falls back to the classic starter, which
  // also covers VHDL. Other templates generate Verilog pre-wired to the board.
  const template = templateId ? getTemplateById(templateId) : undefined;
  let sourceContent = createStarterSource({ topModule, board, language });
  let constraintsContent = createConstraintsTemplate(board, topModule);

  if (template?.id === "empty") {
    sourceContent = createEmptySource({ topModule, language });
    constraintsContent = createEmptyConstraints(board, topModule);
  } else if (template?.generate && language !== "VHDL") {
    const generated = template.generate({ board, topModule });
    sourceContent = generated.source;
    constraintsContent = createConstraintLines(
      board,
      topModule,
      generated.mappings,
    );
  }

  return [
    {
      relativePath: sourceRelativePath,
      content: sourceContent,
    },
    {
      relativePath: constraintsRelativePath,
      content: constraintsContent,
    },
    {
      relativePath: projectRelativePath,
      content: JSON.stringify(
        {
          name: projectName,
          boardId: board.id,
          boardName: board.name,
          language,
          topModule,
          template: template?.id ?? "blinky",
        },
        null,
        2,
      ),
    },
  ];
}

function createEmptySource({
  topModule,
  language,
}: {
  topModule: string;
  language: "Verilog" | "SystemVerilog" | "VHDL";
}) {
  if (language === "VHDL") {
    return [
      "library ieee;",
      "use ieee.std_logic_1164.all;",
      "",
      `entity ${topModule} is`,
      "end entity;",
      "",
      `architecture rtl of ${topModule} is`,
      "begin",
      "end architecture;",
      "",
    ].join("\n");
  }

  return [`module ${topModule};`, "", "endmodule", ""].join("\n");
}

function createEmptyConstraints(board: BoardDefinition, topModule: string) {
  return [
    `# ${board.name} constraints for ${topModule}`,
    "# Add PACKAGE_PIN / set_io / LOCATE assignments as your design grows.",
    "",
  ].join("\n");
}

function createStarterSource({
  topModule,
  board,
  language,
}: {
  topModule: string;
  board: BoardDefinition;
  language: "Verilog" | "SystemVerilog" | "VHDL";
}) {
  const ledPin = board.leds[0];
  const clock = board.clocks[0];

  if (language === "VHDL") {
    return [
      "library ieee;",
      "use ieee.std_logic_1164.all;",
      "use ieee.numeric_std.all;",
      "",
      `entity ${topModule} is`,
      "  port (",
      `    clk : in std_logic${ledPin ? ";" : ""}`,
      ...(ledPin ? [`    led : out std_logic`] : []),
      "  );",
      `end ${topModule};`,
      "",
      `architecture rtl of ${topModule} is`,
      "  signal counter : unsigned(23 downto 0) := (others => '0');",
      "begin",
      "  process(clk)",
      "  begin",
      "    if rising_edge(clk) then",
      "      counter <= counter + 1;",
      "    end if;",
      "  end process;",
      ...(ledPin ? ["  led <= std_logic(counter(counter'high));"] : []),
      "end rtl;",
      "",
      `-- Suggested clock pin: ${clock?.name ?? "board clock"}`,
      ...(ledPin ? [`-- Suggested LED pin: ${ledPin.name}`] : []),
      "",
    ].join("\n");
  }

  return [
    `module ${topModule}(`,
    `  input  wire clk${ledPin ? "," : ""}`,
    ...(ledPin ? ["  output wire led"] : []),
    ");",
    "",
    "  reg [23:0] counter = 24'd0;",
    "",
    "  always @(posedge clk) begin",
    "    counter <= counter + 24'd1;",
    "  end",
    "",
    ...(ledPin ? ["  assign led = counter[23];", ""] : []),
    "endmodule",
    "",
    `// Suggested clock pin: ${clock?.name ?? "board clock"}`,
    ...(ledPin ? [`// Suggested LED pin: ${ledPin.name}`] : []),
    "",
  ].join("\n");
}

function createConstraintsTemplate(board: BoardDefinition, topModule: string) {
  const clock = board.clocks[0];
  const led = board.leds[0];
  const reset = findResetPin(board);

  if (board.constraintsFile === "xdc") {
    return [
      `# ${board.name} starter constraints for ${topModule}`,
      ...(clock?.pin
        ? [
            `set_property PACKAGE_PIN ${clock.pin.split("/")[0]} [get_ports clk]`,
            `set_property IOSTANDARD LVCMOS33 [get_ports clk]`,
          ]
        : []),
      ...(led?.pin
        ? [
            `set_property PACKAGE_PIN ${led.pin} [get_ports led]`,
            `set_property IOSTANDARD LVCMOS33 [get_ports led]`,
          ]
        : []),
      ...(reset?.pin
        ? [
            `set_property PACKAGE_PIN ${reset.pin} [get_ports rst]`,
            `set_property IOSTANDARD LVCMOS33 [get_ports rst]`,
          ]
        : []),
      "",
    ].join("\n");
  }

  if (board.constraintsFile === "pcf") {
    return [
      `# ${board.name} starter constraints for ${topModule}`,
      ...(clock?.pin ? [`set_io clk ${clock.pin}`] : []),
      ...(led?.pin ? [`set_io led ${led.pin}`] : []),
      ...(reset?.pin ? [`set_io rst ${reset.pin}`] : []),
      "",
    ].join("\n");
  }

  if (board.constraintsFile === "lpf") {
    return [
      `# ${board.name} starter constraints for ${topModule}`,
      ...(clock?.pin ? [`LOCATE COMP "clk" SITE "${clock.pin}";`] : []),
      ...(led?.pin ? [`LOCATE COMP "led" SITE "${led.pin}";`] : []),
      ...(reset?.pin ? [`LOCATE COMP "rst" SITE "${reset.pin}";`] : []),
      "",
    ].join("\n");
  }

  return [`# ${board.name} starter constraints for ${topModule}`, ""].join(
    "\n",
  );
}

function findResetPin(board: BoardDefinition) {
  return board.buttons.find((button) => {
    const text =
      `${button.name} ${button.signal ?? ""} ${button.group ?? ""}`.toLowerCase();
    return text.includes("rst") || text.includes("reset");
  });
}

function sanitizeModuleName(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) return "top";
  if (/^[0-9]/.test(sanitized)) return `top_${sanitized}`;
  return sanitized;
}

const invalidFolderNamePattern = new RegExp(
  `[<>:"/\\\\|?*${String.fromCharCode(0)}-${String.fromCharCode(31)}]+`,
  "g",
);

function sanitizeFolderName(value: string) {
  const sanitized = value
    .trim()
    .replace(invalidFolderNamePattern, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || "my_fpga_project";
}
