import { useState } from "react";
import { createRoot } from "react-dom/client";
import PinMappingSection from "../src/pages/dashboard/PinMappingSection";
import TestbenchSection from "../src/pages/dashboard/TestbenchSection";
import { getBoardById } from "../src/data/boards";
import { DEFAULT_SETTINGS } from "../src/data/settings";
import type { ProjectFile } from "../src/pages/dashboard/types";
import { createPinMappingConstraints, findPorts, getPinOptions } from "../src/pages/dashboard/pinMappingUtils";
import "../src/App.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "black-ice";
document.documentElement.dataset.reduceMotion = query.has("reduce-motion") ? "true" : "false";
const board = getBoardById(query.get("board") ?? "icebreaker")!;
const design = `module top (
  input logic core_clk,
  input logic reset_n,
  input logic [5:3] data,
  output logic [8:9] leds,
  output logic [4:4] ready
);
  always @(posedge core_clk or negedge reset_n)
    if (!reset_n) begin leds <= 0; ready <= 0; end
    else begin leds <= data[4:3]; ready <= 1; end
endmodule`;

export function Fixture() {
  const [view, setView] = useState(query.get("view") ?? "pins");
  const [files, setFiles] = useState<ProjectFile[]>([{ name: "top.sv", content: design }]);
  const [status, setStatus] = useState("No files created or saved");
  const [created, setCreated] = useState("");
  return <main style={{ background: "var(--ui-page-bg)", color: "var(--ui-text)", minHeight: "100vh" }}>
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 12 }}>
      <strong>Pin / testbench UI fixture</strong>
      <button onClick={() => setView("pins")}>Pin Mapping fixture</button>
      <button onClick={() => setView("testbench")}>Testbench fixture</button>
      <button onClick={() => {
        const pin = getPinOptions(board).find(item => item.type === "led");
        if (!pin) return;
        const name = `constraints.${board.constraintsFile}`;
        const content = createPinMappingConstraints(board, findPorts([{ name: "top.sv", content: design }]), { "ready[4]": pin.key });
        setFiles(current => [...current.filter(file => file.name !== name), { name, content }]);
        setStatus("Saved fixture: ready[4] owns the first LED pad");
      }}>Seed conflicting LED</button>
      <button onClick={() => { document.documentElement.dataset.theme = "ice"; }}>Ice</button>
      <button onClick={() => { document.documentElement.dataset.theme = "black-ice"; }}>Black Ice</button>
      <button onClick={() => { document.documentElement.dataset.reduceMotion = document.documentElement.dataset.reduceMotion === "true" ? "false" : "true"; }}>Toggle Reduce Motion</button>
      <output role="status">{status}</output>
    </header>
    <div className="ui-borderless-workspace ui-workspace-dot-grid" style={{ padding: "0 20px" }}>
      {view === "pins" ? <PinMappingSection board={board} files={files} defaultMode="advanced" topLevelFileName="top.sv"
        onSaveMappings={async (name, content) => {
          setFiles(current => [...current.filter(file => file.name !== name), { name, content }]);
          setStatus(`Saved ${name}`);
          return true;
        }} /> : <TestbenchSection board={board} files={files} projectName="QoL Fixture" topLevelFileName="top.sv" settings={DEFAULT_SETTINGS}
        onCreateTestbench={(name, content) => {
          setFiles(current => [...current, { name, content }]);
          setCreated(content);
          setStatus(`Created ${name}`);
        }} onOpenFile={name => setStatus(`Opened ${name}`)} />}
    </div>
    {created && <details style={{ padding: 20 }}><summary>Last created scaffold</summary><pre id="created-scaffold">{created}</pre></details>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
