// Loaded only behind both Vite DEV and an explicit marketing opt-in.
type Command = {
  action: string;
  target?: "simulate" | "build";
  name?: string;
  path?: string;
  value?: string;
  ms?: number;
  cycles?: number;
};
type AppActions = {
  home: () => void;
  open: (path: string, target: "simulate" | "build") => Promise<void>;
  theme: (theme: "ice" | "black-ice") => void;
};
let actions: AppActions | null = null;
let started = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalized = (text: string | null) =>
  (text ?? "").replace(/\s+/g, " ").trim();
function button(name: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].filter(
    (el) =>
      el.getClientRects().length &&
      (el.getAttribute("aria-label") === name ||
        normalized(el.textContent) === name),
  );
  if (found.length !== 1)
    throw new Error(
      `Expected one visible button '${name}', found ${found.length}`,
    );
  if (found[0].disabled) throw new Error(`Button '${name}' is disabled`);
  return found[0];
}
function selectValue(label: string, value: string) {
  const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (el) => el.getClientRects().length && el.getAttribute("aria-label") === label,
  );
  if (!select) throw new Error(`Missing visible select '${label}'`);
  if (![...select.options].some((option) => option.value === value))
    throw new Error(`Option '${value}' is unavailable for '${label}'`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
async function until(
  test: () => boolean,
  description: string,
  timeout = 90000,
) {
  const start = Date.now();
  while (!test()) {
    const error = document.querySelector(".vfpga-error");
    if (error) throw new Error(normalized(error.textContent));
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${description}`);
    await sleep(100);
  }
}
function signalValues() {
  return Object.fromEntries(
    [...document.querySelectorAll(".vfpga-signal-table > div")].flatMap(
      (row) => {
        const name = normalized(
          row.querySelector(".signal-name")?.textContent ?? null,
        );
        return name
          ? [[name, normalized(row.querySelector("code")?.textContent ?? null)]]
          : [];
      },
    ),
  );
}
function status() {
  return {
    title: document.title,
    values: signalValues(),
    simulator: normalized(
      document.querySelector(".vfpga-status")?.textContent ?? null,
    ),
    signals: normalized(
      document.querySelector(".vfpga-signal-table")?.textContent ?? null,
    ),
    leds: [...document.querySelectorAll(".vfpga-led")].map((el) => ({
      text: normalized(el.textContent),
      active: el.classList.contains("on"),
    })),
    text: document.body.innerText.slice(0, 16000),
  };
}
async function execute(command: Command) {
  if (!actions) throw new Error("Application is not ready");
  switch (command.action) {
    case "status":
      return status();
    case "home":
      // Keep the welcome shot independent of timestamps/recent-project cards.
      window.localStorage.removeItem("allora-fpga-projects");
      window.localStorage.removeItem("allora-fpga-last-opened-project");
      actions.home();
      break;
    case "open-project":
      if (!command.path) throw new Error("Project path required");
      await actions.open(command.path, command.target ?? "simulate");
      break;
    case "theme":
      if (command.value !== "ice" && command.value !== "black-ice")
        throw new Error("Unsupported theme");
      actions.theme(command.value);
      break;
    case "open-file":
      if (!command.name) throw new Error("File name required");
      {
        const files = [...document.querySelectorAll<HTMLElement>(".project-tree-file")].filter(
          (element) =>
            element.getClientRects().length &&
            normalized(element.querySelector(".project-tree-file-name")?.textContent ?? null) === command.name,
        );
        if (files.length !== 1)
          throw new Error(`Expected one visible project file '${command.name}', found ${files.length}`);
        files[0].click();
      }
      break;
    case "enter":
      button(
        command.target === "build" ? "Build" : "Simulate",
        document.querySelector('[aria-label="Execution target"]') ?? document,
      ).click();
      break;
    case "section": {
      const allowed = [
        "Editor",
        "Virtual",
        "Testbench",
        "Synthesis",
        "Pins",
        "Health",
        "Bitstream",
        "Program",
        "Serial",
      ];
      if (!allowed.includes(command.name ?? ""))
        throw new Error("Unsupported demo section");
      button(command.name!).click();
      break;
    }
    case "compile":
      button("Compile & Start").click();
      await until(
        () =>
          document.querySelector(".vfpga-status")?.textContent?.trim() ===
          "ready",
        "Verilator ready",
      );
      break;
    case "run":
    case "pause":
    case "step":
    case "reset":
    case "stop":
      button(
        command.action[0].toUpperCase() + command.action.slice(1),
        document.querySelector(".vfpga-actions")!,
      ).click();
      break;
    case "switch":
      button(
        command.name ?? "SW0",
        document.querySelector(".vfpga-switches")!,
      ).click();
      break;
    case "press": {
      const el = button(
        command.name ?? "BTN0",
        document.querySelector(".vfpga-buttons")!,
      );
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      try {
        for (let cycle = 0; cycle < (command.cycles ?? 0); cycle++) {
          button("Step", document.querySelector(".vfpga-actions")!).click();
          await sleep(220);
        }
        await sleep(command.ms ?? 350);
      } finally {
        el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      }
      break;
    }
    case "waveform":
    case "board": {
      const el = document.querySelector(
        command.action === "waveform" ? ".vfpga-waveform" : ".vfpga-board-card",
      );
      if (!el) throw new Error(`Missing ${command.action} panel`);
      el.scrollIntoView({ block: "center", behavior: "instant" });
      break;
    }
    case "collapse-explorer":
      button("Collapse explorer").click();
      break;
    case "synthesize":
      button("Run Synthesis").click();
      await sleep(160);
      await until(
        () => Boolean(document.querySelector(".synthesis-report")),
        "real synthesis report",
      );
      break;
    case "run-testbench":
      button("Run Simulation").click();
      await until(
        () => Boolean(document.querySelector(".signal-waveform-panel .wave-trace")),
        "testbench waveform",
      );
      break;
    case "map-pin":
      if (!command.name || !command.value)
        throw new Error("Pin mapping requires port and board pin");
      selectValue(`Board pin for ${command.name}`, command.value);
      break;
    case "pin-mode":
      button((command.name ?? "simple").toLowerCase()).click();
      break;
    case "save-map":
      button("Save Mapping").click();
      await until(
        () => document.body.innerText.includes("Saved"),
        "saved pin mapping",
      );
      break;
    case "generate-bitstream":
      button("Generate Bitstream").click();
      await until(
        () => document.body.innerText.includes("Bitstream generated"),
        "real bitstream artifact",
        120000,
      );
      break;
    case "select-bitstream":
      selectValue(
        "Bitstream to program",
        command.value ??
          document.querySelector<HTMLSelectElement>(
            'select[aria-label="Bitstream to program"]',
          )?.options[0]?.value ??
          "",
      );
      break;
    case "check-programmer":
      button("Check Tool").click();
      await sleep(250);
      await until(() => {
        const checking = [...document.querySelectorAll("button")].some(
          (el) => normalized(el.textContent) === "Checking...",
        );
        return !checking;
      }, "programmer tool check");
      break;
    case "detect-board":
      button("Detect Board").click();
      await sleep(250);
      await until(() => {
        const scanning = [...document.querySelectorAll("button")].some(
          (el) => normalized(el.textContent) === "Scanning...",
        );
        return !scanning;
      }, "board detection");
      break;
    case "build":
      button("Generate Bitstream").click();
      break;
    case "wait-text":
      await until(
        () => document.body.innerText.includes(command.value ?? ""),
        command.value ?? "text",
      );
      break;
    case "assert-signal":
      await until(
        () => signalValues()[command.name ?? ""] === command.value,
        `signal ${command.name} = ${command.value}`,
        5000,
      );
      break;
    case "assert-text":
      if (!document.body.innerText.includes(command.value ?? ""))
        throw new Error(`Missing expected UI text: ${command.value}`);
      break;
    default:
      throw new Error(`Unknown demo action: ${command.action}`);
  }
  await sleep(160); // Allow React commit and native model responses to paint.
  return status();
}
export function connectDemo(next: AppActions) {
  actions = next;
  if (started) return;
  started = true;
  const headers = {
    "Content-Type": "application/json",
    "x-allora-demo-token": import.meta.env.VITE_ALLORA_DEMO_TOKEN,
  };
  void (async () => {
    for (;;) {
      try {
        const item = await fetch("/__allora_demo/poll", { headers }).then((r) =>
          r.json(),
        );
        if (item) {
          let result;
          try {
            result = { id: item.id, result: await execute(item.command) };
          } catch (error) {
            result = { id: item.id, error: String(error) };
          }
          await fetch("/__allora_demo/result", {
            method: "POST",
            headers,
            body: JSON.stringify(result),
          });
        }
      } catch {
        /* Server restarts are harmless; commands have a bounded server timeout. */
      }
      await sleep(80);
    }
  })();
}
