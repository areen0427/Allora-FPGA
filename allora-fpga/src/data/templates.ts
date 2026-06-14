import type { BoardDefinition, BoardPin } from "./boardTypes";

/**
 * Project templates. Every template generates HDL whose ports are already
 * matched to the selected board's resources, so the constraints file is
 * written automatically and the project builds out of the box.
 */

export type TemplateLanguage = "Verilog" | "SystemVerilog" | "VHDL";

export type TemplateMapping = {
  port: string;
  pin: string;
};

export type TemplateResult = {
  source: string;
  mappings: TemplateMapping[];
};

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  languages: TemplateLanguage[];
  /** Returns null when the board supports this template, otherwise the reason. */
  unavailableReason: (board: BoardDefinition) => string | null;
  /** Not defined for "blinky", which uses the classic starter generator. */
  generate?: (options: { board: BoardDefinition; topModule: string }) => TemplateResult;
};

// ── Board resource helpers ───────────────────────────────────────────────

function getClock(board: BoardDefinition) {
  return board.clocks.find((clock) => clock.pin) ?? null;
}

function getUserButton(board: BoardDefinition): BoardPin | null {
  const preferred = board.buttons.find((button) => {
    const text = `${button.name} ${button.signal ?? ""} ${button.group ?? ""}`.toLowerCase();
    return !/rst|reset|pwr|power/.test(text);
  });
  return preferred ?? board.buttons[0] ?? null;
}

function getUartTx(board: BoardDefinition): BoardPin | null {
  return (
    board.pins.find((pin) => {
      if (pin.type !== "uart") return false;
      const text = `${pin.name} ${pin.signal ?? ""}`.toLowerCase();
      return text.includes("tx");
    }) ?? null
  );
}

// ── Constraint generation ────────────────────────────────────────────────

export function createConstraintLines(
  board: BoardDefinition,
  topModule: string,
  mappings: TemplateMapping[]
) {
  const lines = [`# ${board.name} constraints for ${topModule}`];

  for (const { port, pin } of mappings) {
    if (board.constraintsFile === "xdc") {
      const portRef = port.includes("[") ? `{${port}}` : port;
      lines.push(`set_property PACKAGE_PIN ${pin.split("/")[0]} [get_ports ${portRef}]`);
      lines.push(`set_property IOSTANDARD LVCMOS33 [get_ports ${portRef}]`);
    } else if (board.constraintsFile === "pcf") {
      lines.push(`set_io ${port} ${pin}`);
    } else if (board.constraintsFile === "lpf") {
      lines.push(`LOCATE COMP "${port}" SITE "${pin}";`);
      lines.push(`IOBUF PORT "${port}" IO_TYPE=LVCMOS33;`);
    } else if (board.constraintsFile === "cst") {
      lines.push(`IO_LOC "${port}" ${pin};`);
    } else {
      lines.push(`# ${port} -> ${pin}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ── Template sources ─────────────────────────────────────────────────────

function generateCounter({ board, topModule }: { board: BoardDefinition; topModule: string }): TemplateResult {
  const clock = getClock(board);
  const leds = board.leds.slice(0, 8);
  const width = leds.length;
  const high = 25;
  const low = 26 - width;

  const source = [
    `module ${topModule} (`,
    `  input  wire clk,`,
    `  output wire [${width - 1}:0] led`,
    ");",
    "",
    "  reg [25:0] counter = 26'd0;",
    "",
    "  always @(posedge clk) begin",
    "    counter <= counter + 26'd1;",
    "  end",
    "",
    `  assign led = counter[${high}:${low}];`,
    "",
    "endmodule",
    "",
  ].join("\n");

  const mappings: TemplateMapping[] = [];
  if (clock?.pin) mappings.push({ port: "clk", pin: clock.pin });
  leds.forEach((led, index) => {
    mappings.push({ port: `led[${index}]`, pin: led.pin });
  });

  return { source, mappings };
}

function generatePwmBreathe({ board, topModule }: { board: BoardDefinition; topModule: string }): TemplateResult {
  const clock = getClock(board);
  const led = board.leds[0];

  const source = [
    `module ${topModule} (`,
    "  input  wire clk,",
    "  output wire led",
    ");",
    "",
    "  reg [15:0] prescaler = 16'd0;",
    "  reg [7:0]  duty = 8'd0;",
    "  reg        rising = 1'b1;",
    "  reg [7:0]  pwm = 8'd0;",
    "",
    "  always @(posedge clk) begin",
    "    prescaler <= prescaler + 16'd1;",
    "    if (prescaler == 16'd0) begin",
    "      if (rising) begin",
    "        duty <= duty + 8'd1;",
    "        if (duty == 8'd254) rising <= 1'b0;",
    "      end else begin",
    "        duty <= duty - 8'd1;",
    "        if (duty == 8'd1) rising <= 1'b1;",
    "      end",
    "    end",
    "    pwm <= pwm + 8'd1;",
    "  end",
    "",
    "  assign led = (pwm < duty);",
    "",
    "endmodule",
    "",
  ].join("\n");

  const mappings: TemplateMapping[] = [];
  if (clock?.pin) mappings.push({ port: "clk", pin: clock.pin });
  if (led) mappings.push({ port: "led", pin: led.pin });

  return { source, mappings };
}

function generateButtonToggle({ board, topModule }: { board: BoardDefinition; topModule: string }): TemplateResult {
  const clock = getClock(board);
  const button = getUserButton(board);
  const led = board.leds[0];
  const pressedExpression = button?.activeLow ? "~btn" : "btn";

  const source = [
    `module ${topModule} (`,
    "  input  wire clk,",
    "  input  wire btn,",
    "  output reg  led",
    ");",
    "",
    `  wire pressed = ${pressedExpression};`,
    "",
    "  reg [15:0] debounce = 16'd0;",
    "  reg stable = 1'b0;",
    "  reg stable_prev = 1'b0;",
    "",
    "  initial led = 1'b0;",
    "",
    "  always @(posedge clk) begin",
    "    if (pressed == stable) begin",
    "      debounce <= 16'd0;",
    "    end else begin",
    "      debounce <= debounce + 16'd1;",
    "      if (&debounce) stable <= pressed;",
    "    end",
    "",
    "    stable_prev <= stable;",
    "    if (stable && !stable_prev) led <= ~led;",
    "  end",
    "",
    "endmodule",
    "",
  ].join("\n");

  const mappings: TemplateMapping[] = [];
  if (clock?.pin) mappings.push({ port: "clk", pin: clock.pin });
  if (button) mappings.push({ port: "btn", pin: button.pin });
  if (led) mappings.push({ port: "led", pin: led.pin });

  return { source, mappings };
}

function generateUartHello({ board, topModule }: { board: BoardDefinition; topModule: string }): TemplateResult {
  const clock = getClock(board);
  const tx = getUartTx(board);
  const clockHz = clock?.frequency ?? 12_000_000;
  const message = "Hello from Allora!\r\n";

  const messageCase = [...message].map((character, index) => {
    const code = character.charCodeAt(0);
    const display = code < 32 ? `8'h${code.toString(16).padStart(2, "0").toUpperCase()}` : `"${character}"`;
    return `      5'd${index}: message_byte = ${display};`;
  });

  const source = [
    `module ${topModule} (`,
    "  input  wire clk,",
    "  output wire tx",
    ");",
    "",
    `  localparam [31:0] CLK_HZ = 32'd${clockHz};`,
    "  localparam [31:0] BAUD = 32'd115200;",
    "  localparam [15:0] DIV = CLK_HZ / BAUD;",
    `  localparam [4:0] MSG_LEN = 5'd${message.length};`,
    "",
    "  function [7:0] message_byte(input [4:0] index);",
    "    case (index)",
    ...messageCase,
    "      default: message_byte = 8'h0A;",
    "    endcase",
    "  endfunction",
    "",
    "  reg [15:0] baud_count = 16'd0;",
    "  reg [3:0]  bit_index = 4'd0;",
    "  reg [9:0]  shifter = 10'h3FF;",
    "  reg        sending = 1'b0;",
    "  reg [4:0]  char_index = 5'd0;",
    "  reg [24:0] pause = 25'd0;",
    "",
    "  assign tx = shifter[0];",
    "",
    "  always @(posedge clk) begin",
    "    if (sending) begin",
    "      if (baud_count == DIV - 16'd1) begin",
    "        baud_count <= 16'd0;",
    "        shifter <= {1'b1, shifter[9:1]};",
    "        if (bit_index == 4'd9) begin",
    "          bit_index <= 4'd0;",
    "          sending <= 1'b0;",
    "        end else begin",
    "          bit_index <= bit_index + 4'd1;",
    "        end",
    "      end else begin",
    "        baud_count <= baud_count + 16'd1;",
    "      end",
    "    end else if (char_index < MSG_LEN) begin",
    "      shifter <= {1'b1, message_byte(char_index), 1'b0};",
    "      char_index <= char_index + 5'd1;",
    "      sending <= 1'b1;",
    "      baud_count <= 16'd0;",
    "    end else begin",
    "      pause <= pause + 25'd1;",
    "      if (&pause) begin",
    "        char_index <= 5'd0;",
    "        pause <= 25'd0;",
    "      end",
    "    end",
    "  end",
    "",
    "endmodule",
    "",
  ].join("\n");

  const mappings: TemplateMapping[] = [];
  if (clock?.pin) mappings.push({ port: "clk", pin: clock.pin });
  if (tx) mappings.push({ port: "tx", pin: tx.pin });

  return { source, mappings };
}

// ── Catalog ──────────────────────────────────────────────────────────────

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blinky",
    name: "Blinky",
    description: "A counter that blinks the first user LED. The classic hardware hello-world.",
    languages: ["Verilog", "SystemVerilog", "VHDL"],
    unavailableReason: () => null,
  },
  {
    id: "counter",
    name: "Binary Counter",
    description: "Counts up on the board's LED bank so you can watch the bits ripple.",
    languages: ["Verilog", "SystemVerilog"],
    unavailableReason: (board) => {
      if (!getClock(board)) return "No clock pin in the board database.";
      if (board.leds.length < 2) return "Needs at least two LEDs.";
      return null;
    },
    generate: generateCounter,
  },
  {
    id: "pwm-breathe",
    name: "PWM Breathing LED",
    description: "Fades an LED up and down with a PWM triangle wave.",
    languages: ["Verilog", "SystemVerilog"],
    unavailableReason: (board) => {
      if (!getClock(board)) return "No clock pin in the board database.";
      if (board.leds.length < 1) return "Needs at least one LED.";
      return null;
    },
    generate: generatePwmBreathe,
  },
  {
    id: "button-toggle",
    name: "Button Debounce",
    description: "Debounces a push button and toggles an LED on each press.",
    languages: ["Verilog", "SystemVerilog"],
    unavailableReason: (board) => {
      if (!getClock(board)) return "No clock pin in the board database.";
      if (board.buttons.length < 1) return "Needs a user button.";
      if (board.leds.length < 1) return "Needs at least one LED.";
      return null;
    },
    generate: generateButtonToggle,
  },
  {
    id: "uart-hello",
    name: "UART Hello",
    description: "Transmits \"Hello from Allora!\" at 115200 baud — pair it with the Serial monitor.",
    languages: ["Verilog", "SystemVerilog"],
    unavailableReason: (board) => {
      const clock = getClock(board);
      if (!clock) return "No clock pin in the board database.";
      if (!clock.frequency) return "Clock frequency is unknown.";
      if (!getUartTx(board)) return "No UART TX pin in the board database.";
      return null;
    },
    generate: generateUartHello,
  },
];

export function getTemplateById(id: string) {
  return PROJECT_TEMPLATES.find((template) => template.id === id);
}

export function getTemplateUnavailableReason(
  template: ProjectTemplate,
  board: BoardDefinition,
  language: TemplateLanguage
) {
  if (!template.languages.includes(language)) {
    return `Not available for ${language}.`;
  }
  return template.unavailableReason(board);
}
