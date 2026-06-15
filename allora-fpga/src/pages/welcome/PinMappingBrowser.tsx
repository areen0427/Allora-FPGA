import { useState } from "react";
import { Cpu, Map as MapIcon } from "lucide-react";
import BoardDiagram from "../../components/BoardDiagram";
import { getBoardById } from "../../data/boards";
import type { BoardDefinition } from "../../data/boards";
import type { BoardCatalogItem } from "../../data/boardSupport";
import {
  getPinTypeColor,
  getResourceGroupsForBrowser,
  type PinBrowserResourceGroup,
} from "../../data/pinResourceGroups";

type PinMappingBrowserProps = {
  boards: BoardCatalogItem[];
  selectedBoardId: string | null;
  onSelectBoard: (boardId: string | null) => void;
};

export function PinMappingBrowser({
  boards,
  selectedBoardId,
  onSelectBoard,
}: PinMappingBrowserProps) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredBoards = normalizedSearch
    ? boards.filter((board) => matchesBoardSearch(board, normalizedSearch))
    : boards;
  const selectedBoard = selectedBoardId ? getBoardById(selectedBoardId) : null;
  const resourceGroups = selectedBoard
    ? getResourceGroupsForBrowser(selectedBoard)
    : [];

  return (
    <div className="pin-browser-shell">
      <div className="welcome-eyebrow pin-browser-eyebrow">
        Pin Mapping Browser
      </div>
      <header className="pin-browser-heading">
        <h1 className="welcome-title">Board Pinouts</h1>
        <p className="welcome-subtitle">Browse pin mappings for boards.</p>
      </header>

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
              ("variants" in board &&
                board.variants.some(
                  (variant) => variant.id === selectedBoardId,
                ))),
          );

          return (
            <button
              key={board.id}
              type="button"
              className={
                isSelected ? "pin-board-item selected" : "pin-board-item"
              }
              onClick={() =>
                onSelectBoard(
                  "variants" in board ? board.variants[0].id : board.id,
                )
              }
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

        {boards.length === 0 ? (
          <div className="pin-browser-empty-list">
            No boards match your search.
          </div>
        ) : null}
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
  const [viewMode, setViewMode] = useState<"pinout" | "diagram">("pinout");

  return (
    <div className="dashboard-glass-card pin-detail-panel">
      <div className="pin-detail-header">
        <div>
          <h2>{board.name}</h2>
          <p>
            {board.vendor} · {board.family} · {board.device}
          </p>
        </div>

        <div
          className="pin-browser-view-toggle"
          role="group"
          aria-label="Board pinout view"
        >
          <button
            type="button"
            className={
              viewMode === "pinout"
                ? "pin-browser-view-button active"
                : "pin-browser-view-button"
            }
            aria-pressed={viewMode === "pinout"}
            onClick={() => setViewMode("pinout")}
          >
            <MapIcon size={15} />
            Pinout
          </button>
          <button
            type="button"
            className={
              viewMode === "diagram"
                ? "pin-browser-view-button active"
                : "pin-browser-view-button"
            }
            aria-pressed={viewMode === "diagram"}
            onClick={() => setViewMode("diagram")}
          >
            <Cpu size={15} />
            Board Diagram
          </button>
        </div>
      </div>

      <div className="pin-summary-list">
        <PinSummaryPill label="Pins" value={String(board.pins.length)} />
        <PinSummaryPill label="Clocks" value={String(board.clocks.length)} />
        <PinSummaryPill
          label="Constraints"
          value={`.${board.constraintsFile}`}
        />
      </div>

      {viewMode === "pinout" ? (
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
                      <span
                        className="pin-tile-symbol"
                        style={{
                          background: color.background,
                          color: color.color,
                        }}
                      >
                        {pin.symbol}
                      </span>
                      <span className="pin-tile-pin" title={pin.pin}>
                        {pin.pin}
                      </span>
                      <span
                        className="pin-tile-detail"
                        title={pin.detail ?? pin.name}
                      >
                        {pin.detail ?? pin.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pin-diagram-panel">
          <BoardDiagram key={board.id} board={board} />
        </div>
      )}
    </div>
  );
}

function PinMappingEmptyState() {
  return (
    <div className="dashboard-glass-card pin-browser-empty-state">
      <MapIcon size={40} strokeWidth={1.5} />
      <div>Select a board to view its pin mapping</div>
      <p>
        Choose a board from the list on the left to see all available I/O pins,
        clocks, and board resources.
      </p>
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

function PinSummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="pin-summary-pill">
      <div className="pin-summary-pill-label">{label}</div>
      <div className="pin-summary-pill-value">{value}</div>
    </div>
  );
}
