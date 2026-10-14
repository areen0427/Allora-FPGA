import { Activity, Binary, CircleDot, MapPinned, Usb, Zap } from "lucide-react";
import AiDesignStudioIcon from "../AiDesignStudioIcon";
import EditorIcon from "../EditorIcon";
import TestbenchIcon from "../TestbenchIcon";
import SynthesisIcon from "../SynthesisIcon";
import ProgramIcon from "../ProgramIcon";
import PeripheralWorkbenchIcon from "../PeripheralWorkbenchIcon";
import MemoryAssetStudioIcon from "../MemoryAssetStudioIcon";
import RegisterBuilderIcon from "../RegisterBuilderIcon";
import type { DashboardSection } from "../../pages/dashboard/types";

const pages = {
  editor: { title: "Editor", icon: EditorIcon },
  testbench: { title: "Testbench", icon: TestbenchIcon },
  synthesis: { title: "Synthesis", icon: SynthesisIcon },
  "pin-mapping": { title: "Pin Mapping", icon: MapPinned },
  bitstream: { title: "Bitstream", icon: Binary },
  programming: { title: "FPGA Programming", icon: ProgramIcon },
  health: { title: "Build Health", icon: Activity },
  serial: { title: "Serial Monitor", icon: Usb },
  "virtual-fpga": { title: "Virtual FPGA", icon: Zap },
  "peripheral-workbench": { title: "Peripheral Workbench", icon: PeripheralWorkbenchIcon },
  "memory-asset-studio": { title: "Memory Asset Studio", icon: MemoryAssetStudioIcon },
  "register-builder": { title: "Register Builder", icon: RegisterBuilderIcon },
  chat: { title: "AI Design Studio", icon: AiDesignStudioIcon },
};

export function WorkspaceTitle({ section, title }: { section?: DashboardSection; title?: string }) {
  const page = section ? pages[section] : undefined;
  const Icon = page?.icon ?? CircleDot;
  return (
    <h1 className="ui-workspace-title">
      <span className={`ui-workspace-title-icon${section === "chat" ? " ui-workspace-title-icon-ai" : ""}`} aria-hidden="true"><Icon size={section === "chat" ? 28 : 24} /></span>
      <span>{title ?? page?.title}</span>
    </h1>
  );
}
