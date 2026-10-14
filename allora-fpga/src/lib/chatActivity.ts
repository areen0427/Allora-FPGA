/** Ambient labels describe deliberation; named hardware operations require real tool activity. */
export const DESIGN_ACTIVITY_VERBS = [
  "Elaborating", "Tracing signals", "Resolving dependencies", "Mapping the design",
  "Connecting the dots", "Balancing paths", "Exploring architectures", "Reading the netlist",
  "Following the clock", "Unpacking the problem", "Aligning edges", "Checking assumptions",
  "Considering constraints", "Decoding intent", "Organizing logic", "Sketching the datapath",
  "Shaping the control flow", "Reasoning through states", "Examining boundaries", "Following fanout",
  "Looking for hazards", "Connecting modules", "Weighing tradeoffs", "Following the pipeline",
  "Tuning the approach", "Resolving the hierarchy", "Inspecting interfaces", "Thinking in cycles",
  "Untangling signals", "Reviewing the architecture", "Finding a critical path", "Planning the next edge",
  "Crossing domains", "Counting cycles", "Reading between the bits", "Working through timing",
  "Exploring the state space", "Lining up the bits", "Unrolling the possibilities", "Checking the handshakes",
  "Tracing the reset", "Sorting the dependencies", "Connecting the buses", "Examining the registers",
  "Studying the waveform", "Reviewing the signal flow", "Reasoning about latency", "Measuring the tradeoffs",
  "Following the enable", "Looking for a simpler circuit", "Thinking through the pipeline", "Bringing the design into focus",
  "Examining corner cases", "Checking the bit widths", "Resolving the next step", "Planning the datapath",
  "Exploring the logic", "Reviewing the clock domains", "Aligning the interfaces", "Walking the hierarchy",
] as const;

const TOOL_ACTIVITY: [RegExp, string][] = [
  [/program|flash/, "Programming hardware"],
  [/generate_synthesis|synthesiz/, "Synthesizing"],
  [/build_bitstream|place_and_route|nextpnr/, "Routing and packing"],
  [/simulate_testbench|compile_simulator|run_simulation/, "Simulating"],
  [/lint|verify|validate|check_/, "Verifying"],
  [/set_pin|constraint/, "Mapping pins"],
  [/configure_simulator/, "Connecting peripherals"],
  [/discover_design_ports/, "Discovering ports"],
  [/apply_file|write_file|edit_file|patch/, "Wiring the design"],
  [/read_file|list_files|inspect_project/, "Inspecting the design"],
  [/create_project|configure_project/, "Configuring the project"],
  [/get_job_result|wait/, "Monitoring the run"],
  [/spawn_agent|collab.*spawn/, "Delegating a task"],
  [/send_input|send_message/, "Coordinating agents"],
  [/board|toolchain|device/, "Checking the target"],
  [/search|find|rg/, "Tracing references"],
];

export function activityLabel(toolName?: string, index = 0): string {
  if (toolName) {
    const name = toolName.toLowerCase();
    const match = TOOL_ACTIVITY.find(([pattern]) => pattern.test(name));
    if (match) return match[1];
    return `Running ${toolName.replace(/^mcp__allora__|^allora[._]/, "").replaceAll("_", " ")}`;
  }
  const position = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return DESIGN_ACTIVITY_VERBS[position % DESIGN_ACTIVITY_VERBS.length];
}
