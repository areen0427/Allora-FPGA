export function formatSynthesisFlow(flow: string) {
  if (flow === "yosys-nextpnr") return "Yosys + NextPNR";
  if (flow === "gowin") return "Gowin";
  if (flow === "vivado") return "Vivado";
  if (flow === "quartus") return "Quartus";
  return flow;
}