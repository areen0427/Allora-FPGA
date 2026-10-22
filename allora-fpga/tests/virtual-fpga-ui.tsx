import { useState } from "react";
import { createRoot } from "react-dom/client";
import VirtualFpgaSection from "../src/pages/dashboard/VirtualFpgaSection";
import { getBoardById, REAL_BOARDS, VIRTUAL_BOARD } from "../src/data/boards";
import { DEFAULT_SETTINGS } from "../src/data/settings";
import { defaultVirtualFpgaConfig, writeVirtualFpgaConfig, type RtlPort } from "../src/lib/virtualFpga";
import type { ProjectFile } from "../src/pages/dashboard/types";
import "../src/App.css";
import "../src/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "ice";
document.documentElement.dataset.reduceMotion = query.has("reduce-motion") ? "true" : "false";
const ports: RtlPort[] = [
  { name: "clk", width: 1, direction: "input" },
  { name: "reset_n", width: 1, direction: "input" },
  { name: "switches_with_a_long_signal_name", width: 32, direction: "input" },
  { name: "buttons", width: 32, direction: "input" },
  { name: "leds_with_a_long_signal_name", width: 32, direction: "output" },
];
let snapshot = { simTimePs: 0, values: Object.fromEntries(ports.map(port => [port.name, "0"])) };
Object.assign(window, { __TAURI__: { core: {
  invoke: async (command: string, args?: { request?: { signal?: string; value?: string | number } }) => {
    if (command === "detect_simulation_tools") return {
      yosys: { available: true, path: "/fixture/yosys", installHint: "" },
      verilator: { available: true, path: "/fixture/verilator", installHint: "" },
    };
    if (command === "discover_rtl_ports") return ports;
    if (command === "start_virtual_simulation") return { sessionId: 1, ports, state: snapshot, logs: ["Fixture compiled"], waveformPath: null };
    if (command === "stop_virtual_simulation") return null;
    if (command === "set_virtual_simulation_input") {
      const request = args?.request;
      if (request?.signal) snapshot = { ...snapshot, values: { ...snapshot.values, [request.signal]: String(request.value) } };
      return snapshot;
    }
    if (command === "step_virtual_simulation" || command === "reset_virtual_simulation") {
      snapshot = { simTimePs: snapshot.simTimePs + 40_000, values: { ...snapshot.values, leds_with_a_long_signal_name: snapshot.values.leds_with_a_long_signal_name === "0" ? "255" : "0" } };
      return { state: snapshot, trace: [snapshot] };
    }
    throw new Error(`Unexpected fixture command: ${command}`);
  },
} } });

export function Fixture() {
  const [boardId, setBoardId] = useState(query.get("board") ?? "arty-a7-35t");
  const board = getBoardById(boardId) ?? VIRTUAL_BOARD;
  const config = defaultVirtualFpgaConfig("top", board);
  const typeIndex = new Map<string, number>();
  config.peripherals = config.peripherals.map(item => {
    const index = typeIndex.get(item.type) ?? 0;
    typeIndex.set(item.type, index + 1);
    const signal = item.type === "clock" ? "clk" : item.type === "reset" ? "reset_n"
      : item.type === "switch" ? "switches_with_a_long_signal_name" : item.type === "led" ? "leds_with_a_long_signal_name" : "buttons";
    return { ...item, signal, ...(["led", "switch", "button"].includes(item.type) ? { bit: index } : {}) };
  });
  const files: ProjectFile[] = [
    { name: "top.sv", content: "module top(input clk, input reset_n, input [31:0] switches_with_a_long_signal_name, input [31:0] buttons, output [31:0] leds_with_a_long_signal_name); endmodule" },
    { name: "allora-project.json", content: writeVirtualFpgaConfig("{}", config) },
  ];
  return <main className="dashboard-main ui-borderless-workspace ui-workspace-dot-grid" style={{ minHeight: "100vh", backgroundColor: "var(--ui-page-bg)", color: "var(--ui-text)" }}>
    <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 12 }}>
      <strong>Virtual FPGA fixture</strong>
      <select aria-label="Fixture board" value={boardId} onChange={event => setBoardId(event.target.value)}>
        <option value={VIRTUAL_BOARD.id}>{VIRTUAL_BOARD.name}</option>
        {REAL_BOARDS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button onClick={() => { document.documentElement.dataset.theme = "ice"; }}>Ice</button>
      <button onClick={() => { document.documentElement.dataset.theme = "black-ice"; }}>Black Ice</button>
    </header>
    <VirtualFpgaSection key={board.id} board={board} files={files} topLevelFileName="top.sv" settings={DEFAULT_SETTINGS} onConfigChange={() => {}} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
