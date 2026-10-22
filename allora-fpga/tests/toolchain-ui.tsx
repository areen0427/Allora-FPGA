import { createRoot } from "react-dom/client";
import ProjectSetup from "../src/pages/ProjectSetup";
import { REAL_BOARDS } from "../src/data/boards";
import { DEFAULT_SETTINGS } from "../src/data/settings";
import "../src/App.css";

const query = new URLSearchParams(location.search);
let checks = 0;
if (!query.has("browser")) Object.assign(window, { __TAURI__: { core: {
  invoke: async (command: string, args: { request: { commands: string[] } }) => {
    if (command !== "detect_toolchain_tools") throw new Error(`Unexpected fixture call: ${command}`);
    if (query.has("error")) throw new Error("Fixture detection failed");
    checks += 1;
    return args.request.commands.map((tool, index) => ({
      command: tool,
      available: query.has("ready") || checks > 1 || index === 0,
      path: `/fixture/bin/${tool}`,
    }));
  },
} } });
const board = REAL_BOARDS.find((item) => item.id === query.get("board")) ?? REAL_BOARDS.find((item) => item.family === "ECP5")!;
createRoot(document.getElementById("root")!).render(
  <ProjectSetup board={board} settings={{ ...DEFAULT_SETTINGS, projectLocationMode: "documents" }} onBack={() => {}} onCreateProject={() => { document.title = "Fixture project created"; }} />,
);
