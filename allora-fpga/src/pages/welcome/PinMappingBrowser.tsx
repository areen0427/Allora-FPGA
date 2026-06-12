import { useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { getBoardById } from "../../data/boards";
import type { BoardDefinition } from "../../data/boards";
import type { BoardCatalogItem } from "../../data/boardSupport";

type PinMappingBrowserProps = {
  boards: BoardCatalogItem[];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
};

export function PinMappingBrowser({ boards, selectedBoardId, onSelectBoard }: PinMappingBrowserProps) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredBoards = normalizedSearch ? boards.filter((board) => matchesBoardSearch(board, normalizedSearch)) : boards;
  const selectedBoard = selectedBoardId ? getBoardById(selectedBoardId) : null;
  const resourceGroups = selectedBoard ? getResourceGroupsForBrowser(selectedBoard) : [];

  return (
    <>
      <header className="welcome-page-header pin-browser-header">
        <div>
          <div className="welcome-eyebrow">Pin Mapping Browser</div>
          <h1 className="welcome-title">Board Pinouts</h1>
          <p className="welcome-subtitle">Browse pin mappings for boards that are not fully supported.</p>
        </div>
      </header>

      <div className="pin-browser-layout">
        <PinMappingBoardList
          boards={filteredBoards}
          search={search}
          selectedBoardId={selectedBoardId}
          onSearchChange={setSearch}
          onSelectBoard={onSelectBoard}
        />

        {selectedBoard ? (
          <PinMappingDetail board={selectedBoard} resourceGroups={resourceGroups} />
        ) : (
          <PinMappingEmptyState />
        )}
      </div>
    </>
  );
}

function PinMappingBoardList({
  boards,
  search,
  selectedBoardId,
  onSearchChange,
  onSelectBoard,
}: {
  boards: BoardCatalogItem[];
  search: string;
  selectedBoardId: string | null;
  onSearchChange: (search: string) => void;
  onSelectBoard: (boardId: string | null) => void;
}) {
  return (
    <div className="pin-browser-sidebar">
      <label className="board-search-field pin-browser-search">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search boards"
          type="search"
        />
      </label>

      <div className="pin-board-list">
        {boards.map((board) => {
          const isSelected = Boolean(
            selectedBoardId &&
              (board.id === selectedBoardId ||
                ("variants" in board && board.variants.some((variant) => variant.id === selectedBoardId)))
          );

          return (
            <button
              key={board.id}
              type="button"
              className={isSelected ? "pin-board-item selected" : "pin-board-item"}
              onClick={() => onSelectBoard("variants" in board ? board.variants[0].id : board.id)}
            >
              <div className="pin-board-item-name">{board.name}</div>
              <div className="pin-board-item-meta">
                {"variants" in board
                  ? `${board.vendor} · ${board.variants.length} variants`
                  : `${board.vendor} · ${board.family} · ${board.device}`}
              </div>
            </button>
          );
        })}

        {boards.length === 0 ? <div className="pin-browser-empty-list">No boards match your search.</div> : null}
      </div>
    </div>
  );
}

function PinMappingDetail({
  board,
  resourceGroups,
}: {
  board: BoardDefinition;
  resourceGroups: PinBrowserResourceGroup[];
}) {
  return (
    <div className="dashboard-glass-card pin-detail-panel">
      <div>
        <h2>{board.name}</h2>
        <p>{board.vendor} · {board.family} · {board.device}</p>
      </div>

      <div className="pin-summary-list">
        <PinSummaryPill label="Pins" value={String(board.pins.length)} />
        <PinSummaryPill label="Clocks" value={String(board.clocks.length)} />
        <PinSummaryPill label="Constraints" value={`.${board.constraintsFile}`} />
      </div>

      <div className="pin-group-scroll">
        {resourceGroups.map((group) => (
          <div key={group.title} className="pin-group-card">
            <div className="pin-group-header">
              <div>
                <div className="pin-group-title">{group.title}</div>
                <div className="pin-group-detail">{group.detail}</div>
              </div>
              <span className="pin-group-count">{group.pins.length}</span>
            </div>

            <div className="pin-grid">
              {group.pins.map((pin) => {
                const color = getPinTypeColor(pin.type);

                return (
                  <div key={pin.key} className="pin-tile">
                    <span className="pin-tile-symbol" style={{ background: color.background, color: color.color }}>
                      {pin.symbol}
                    </span>
                    <span className="pin-tile-pin" title={pin.pin}>{pin.pin}</span>
                    <span className="pin-tile-detail" title={pin.detail ?? pin.name}>{pin.detail ?? pin.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PinMappingEmptyState() {
  return (
    <div className="dashboard-glass-card pin-browser-empty-state">
      <MapIcon size={40} strokeWidth={1.5} />
      <div>Select a board to view its pin mapping</div>
      <p>Choose a board from the list on the left to see all available I/O pins, clocks, and board resources.</p>
    </div>
  );
}

function matchesBoardSearch(board: BoardCatalogItem, normalizedSearch: string) {
  return (
    board.name.toLowerCase().includes(normalizedSearch) ||
    board.vendor.toLowerCase().includes(normalizedSearch) ||
    ("device" in board && board.device.toLowerCase().includes(normalizedSearch))
  );
}

type PinBrowserResourceGroup = {
  title: string;
  detail: string;
  pins: Array<{
    key: string;
    name: string;
    pin: string;
    type: string;
    symbol: string;
    detail?: string;
  }>;
};

function getResourceGroupsForBrowser(board: BoardDefinition): PinBrowserResourceGroup[] {
  const groups = new Map<string, PinBrowserResourceGroup>();

  function addPin(groupTitle: string, groupDetail: string, pin: PinBrowserResourceGroup["pins"][number]) {
    const group = groups.get(groupTitle) ?? { title: groupTitle, detail: groupDetail, pins: [] };
    group.pins.push(pin);
    groups.set(groupTitle, group);
  }

  board.clocks
    .filter((clock) => clock.pin)
    .forEach((clock) =>
      addPin("Clocks", "Clock sources", {
        key: `clock:${clock.name}`,
        name: clock.name,
        pin: clock.pin ?? "",
        type: "clock",
        symbol: "CLK",
        detail: `${Math.round(clock.frequency / 1_000_000)} MHz`,
      })
    );

  board.pins.forEach((pin) => {
    const title = getResourceGroupTitle(pin);
    addPin(title, pin.group ?? getPinTypeLabel(pin.type), {
      key: `pin:${pin.name}:${pin.pin}`,
      name: pin.name,
      pin: pin.pin,
      type: pin.type,
      symbol: getResourceSymbol(pin),
      detail: pin.signal ?? pin.group ?? pin.name,
    });
  });

  return Array.from(groups.values()).sort((a, b) => getResourceOrder(a.title) - getResourceOrder(b.title));
}

function getResourceGroupTitle(pin: { type: string; group?: string; signal?: string }) {
  if (pin.type === "led") return "LEDs";
  if (pin.type === "button") return "Buttons / Reset";
  if (pin.type === "uart") return "UART";
  if (pin.type === "spi" || pin.type === "flash") return "SPI / Flash";
  if (pin.type === "i2c") return "I2C";
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) return "USB / Special";
  if (pin.type === "gpio") return pin.group ?? "GPIO";
  return pin.group ?? "Other";
}

function getResourceOrder(title: string) {
  const order = ["Clocks", "LEDs", "Buttons / Reset", "UART", "SPI / Flash", "I2C", "GPIO", "USB / Special"];
  const index = order.indexOf(title);
  return index === -1 ? 100 : index;
}

function getResourceSymbol(pin: { type: string; activeLow?: boolean; group?: string; signal?: string }) {
  if (pin.type === "clock") return "CLK";
  if (pin.type === "led") return "LED";
  if (pin.type === "button") return pin.activeLow ? "RST" : "BTN";
  if (pin.type === "uart") return "URT";
  if (pin.type === "spi" || pin.type === "flash") return "SPI";
  if (pin.type === "i2c") return "I2C";
  if (pin.group?.toLowerCase().includes("usb") || pin.signal?.toLowerCase().includes("usb")) return "USB";
  if (pin.type === "gpio") return "IO";
  return "PIN";
}

function getPinTypeLabel(type: string) {
  if (type === "led") return "User outputs";
  if (type === "button") return "User inputs";
  if (type === "uart") return "Serial";
  if (type === "spi" || type === "flash") return "Serial bus";
  if (type === "i2c") return "Two-wire bus";
  if (type === "gpio") return "General I/O";
  return "Board resources";
}

function getPinTypeColor(type: string) {
  if (type === "clock") return { background: "#eff6ff", color: "#2563eb" };
  if (type === "led") return { background: "#fef3c7", color: "#b45309" };
  if (type === "button") return { background: "#fee2e2", color: "#b91c1c" };
  if (type === "uart" || type === "spi" || type === "flash" || type === "i2c") return { background: "#f0fdf4", color: "#15803d" };
  if (type === "unknown") return { background: "#f5f3ff", color: "#6d28d9" };
  return { background: "#f8fafc", color: "#475569" };
}

function PinSummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="pin-summary-pill">
      <div className="pin-summary-pill-label">{label}</div>
      <div className="pin-summary-pill-value">{value}</div>
    </div>
  );
}
