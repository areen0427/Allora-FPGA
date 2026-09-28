// UI-only fixture using the real example and production component. No simulator mocks.
import { useState } from "react";
import PeripheralWorkbench from "../src/pages/dashboard/PeripheralWorkbench";
import { writeWorkbench } from "../src/lib/peripheralWorkbench";
import metadata from "../../examples/peripheral-workbench/allora-project.json?raw";
import source from "../../examples/peripheral-workbench/src/workbench_demo.sv?raw";
import "../src/index.css";
export default function Fixture() {
  const [files, setFiles] = useState([
    { name: "allora-project.json", content: metadata },
    { name: "workbench_demo.sv", content: source },
  ]);
  return (
    <>
      <button
        onClick={() => {
          document.documentElement.dataset.theme =
            document.documentElement.dataset.theme === "black-ice"
              ? "ice"
              : "black-ice";
        }}
      >
        Toggle theme
      </button>
      <PeripheralWorkbench
        files={files}
        topLevelFileName="workbench_demo.sv"
        active
        onChange={(config) =>
          setFiles((current) =>
            current.map((f) =>
              f.name === "allora-project.json"
                ? { ...f, content: writeWorkbench(f.content, config) }
                : f,
            ),
          )
        }
      />
    </>
  );
}
