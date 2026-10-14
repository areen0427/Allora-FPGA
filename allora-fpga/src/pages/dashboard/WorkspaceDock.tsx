import { useBackSwipe } from "../../hooks/useBackSwipe";
import type { MouseEventHandler } from "react";
import { Home, PanelLeftOpen, MapPinned, Binary, Zap, Gauge, Settings, ArrowLeft } from "lucide-react";
import AiDesignStudioIcon from "../../components/AiDesignStudioIcon";
import SidebarButton from "./SidebarButton";
import { FloatingDockNav } from "../../components/ui/floating-dock-navigation";
import type { DashboardSection } from "./types";
import PeripheralWorkbenchIcon from "../../components/PeripheralWorkbenchIcon";
import MemoryAssetStudioIcon from "../../components/MemoryAssetStudioIcon";
import RegisterBuilderIcon from "../../components/RegisterBuilderIcon";
import EditorIcon from "../../components/EditorIcon";
import TestbenchIcon from "../../components/TestbenchIcon";
import SynthesisIcon from "../../components/SynthesisIcon";
import ProgramIcon from "../../components/ProgramIcon";

type WorkspaceDockProps = {
  activeSection: DashboardSection;
  explorerCollapsed?: boolean;
  saving?: boolean;
  onSectionChange: (section: DashboardSection) => void;
  onExpandExplorer?: () => void;
  onHome: () => void;
  onChat: () => void;
  onBack: () => void;
  backLabel?: string;
  onSettings: () => void;
  onUsage: MouseEventHandler<HTMLButtonElement>;
};

export function WorkspaceDock({ activeSection, explorerCollapsed, saving, onSectionChange, onExpandExplorer, onHome, onChat, onBack, backLabel = "Back to project setup", onSettings, onUsage }: WorkspaceDockProps) {
  useBackSwipe(saving ? undefined : onBack);
  return (
        <div className="dashboard-activity-rail-slot">
          <div className="dashboard-activity-rail">
            <div className="activity-rail-top">
              <button
                type="button"
                aria-label="Go to home page"
                title="Home"
                disabled={saving}
                onClick={onHome}
                className="activity-home-button"
              >
                <Home size={18} color="white" strokeWidth={2.2} />
              </button>
              {explorerCollapsed ? (
                <button
                  type="button"
                  className="explorer-expand-button"
                  aria-label="Open explorer"
                  title="Open explorer"
                  onClick={onExpandExplorer}
                >
                  <PanelLeftOpen size={18} />
                </button>
              ) : null}
            </div>
            <FloatingDockNav className="activity-rail-nav" aria-label="Dashboard sections">
              <SidebarButton
                label="Editor"
                icon={<EditorIcon size={19} />}
                active={activeSection === "editor"}
                onClick={() => onSectionChange("editor")}
              />
              <SidebarButton
                label="Testbench"
                icon={<TestbenchIcon size={19} />}
                active={activeSection === "testbench"}
                onClick={() => onSectionChange("testbench")}
              />
              <SidebarButton
                label="Synthesis"
                icon={<SynthesisIcon size={19} />}
                active={activeSection === "synthesis"}
                onClick={() => onSectionChange("synthesis")}
              />
              <SidebarButton
                label="Pin Mapping"
                icon={<MapPinned size={19} />}
                active={activeSection === "pin-mapping"}
                onClick={() => onSectionChange("pin-mapping")}
              />
              <SidebarButton
                label="Bitstream"
                icon={<Binary size={19} />}
                active={activeSection === "bitstream" || activeSection === "health"}
                onClick={() => onSectionChange("bitstream")}
              />
              <SidebarButton
                label="Program"
                icon={<ProgramIcon size={19} />}
                active={activeSection === "programming" || activeSection === "serial"}
                onClick={() => onSectionChange("programming")}
              />
              <div className="activity-rail-divider" role="separator" aria-label="Design Tools" />
              <SidebarButton label="Peripheral Workbench" icon={<PeripheralWorkbenchIcon size={19} />} active={activeSection === "peripheral-workbench"} onClick={() => onSectionChange("peripheral-workbench")} />
              <SidebarButton label="Memory Asset Studio" icon={<MemoryAssetStudioIcon size={19} />} active={activeSection === "memory-asset-studio"} onClick={() => onSectionChange("memory-asset-studio")} />
              <SidebarButton label="Register Builder" icon={<RegisterBuilderIcon size={19} />} active={activeSection === "register-builder"} onClick={() => onSectionChange("register-builder")} />
              <SidebarButton label="Virtual" icon={<Zap size={19} />} active={activeSection === "virtual-fpga"} onClick={() => onSectionChange("virtual-fpga")} />
            </FloatingDockNav>
            <FloatingDockNav className="activity-rail-nav activity-rail-bottom" aria-label="Workspace actions">
              <SidebarButton
                label="AI Design Studio"
                icon={<AiDesignStudioIcon size={22} />}
                active={activeSection === "chat"}
                disabled={saving}
                onClick={onChat}
              />
              <SidebarButton
                label="Resource usage"
                icon={<Gauge size={18} />}
                active={false}
                onClick={onUsage}
              />
              <SidebarButton
                label="Settings"
                icon={<Settings size={18} />}
                active={false}
                onClick={onSettings}
              />
              <SidebarButton
                label={backLabel}
                icon={<ArrowLeft size={18} />}
                active={false}
                disabled={saving}
                onClick={onBack}
              />
            </FloatingDockNav>
          </div>
        </div>
  );
}
