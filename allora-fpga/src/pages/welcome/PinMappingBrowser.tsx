import { useId, useState } from "react";
import "../../styles/pin-browser-welcome.css";
import { Cable, Database, Info, List, Map as MapIcon, Search } from "lucide-react";
import BoardResourceSummary from "../../components/BoardResourceSummary";
import { getBoardById } from "../../data/boards";
import type { BoardDefinition } from "../../data/boards";
import { boardVariantsHaveSamePinMappings } from "../../data/boardSupport";
import type {
  BoardCatalogItem,
  VariantBoardCatalogItem,
} from "../../data/boardSupport";
import {
  getPinTypeColor,
  getResourceGroupsForBrowser,
  type PinBrowserResourceGroup,
} from "../../data/pinResourceGroups";
import { VariantSelectorPopup } from "./VariantSelectorPopup";
import { WelcomeOutputMapper } from "./WelcomeOutputMapper";

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
  const [variantSelection, setVariantSelection] = useState<{
    board: VariantBoardCatalogItem;
    anchor: HTMLButtonElement;
  } | null>(null);
  const variantPopupId = useId();
  const normalizedSearch = search.trim().toLowerCase();
  const filteredBoards = normalizedSearch
    ? boards.filter((board) => matchesBoardSearch(board, normalizedSearch))
    : boards;
  const selectedBoard = selectedBoardId ? getBoardById(selectedBoardId) : null;
  const selectedVariantGroup = selectedBoardId
    ? boards.find(
        (board): board is VariantBoardCatalogItem =>
          "variants" in board &&
          board.variants.some((variant) => variant.id === selectedBoardId),
      )
    : undefined;
  const showSharedVariantMappingNote = Boolean(
    selectedVariantGroup &&
      selectedVariantGroup.variants.length > 1 &&
      boardVariantsHaveSamePinMappings(selectedVariantGroup),
  );
  const resourceGroups = selectedBoard
    ? getResourceGroupsForBrowser(selectedBoard)
    : [];

  function handleSelectBoard(
    board: BoardCatalogItem,
    anchor: HTMLButtonElement,
  ) {
    if ("variants" in board) {
      if (
        board.variants.length > 1 &&
        !boardVariantsHaveSamePinMappings(board)
      ) {
        setVariantSelection({ board, anchor });
        return;
      }
      onSelectBoard(board.variants[0]?.id ?? null);
      return;
    }

    onSelectBoard(board.id);
  }

  return (
    <>
      <div className="pin-browser-shell">
        <PinMappingBoardList
          boards={filteredBoards}
          search={search}
          selectedBoardId={selectedBoardId}
          activeVariantBoardId={variantSelection?.board.id ?? null}
          variantPopupId={variantPopupId}
          onSearchChange={setSearch}
          onSelectBoard={handleSelectBoard}
        />

        <div className="pin-browser-workspace ui-borderless-workspace ui-workspace-dot-grid">
          {selectedBoard ? (
            <PinMappingDetail
              key={selectedBoard.id}
              board={selectedBoard}
              resourceGroups={resourceGroups}
              showSharedVariantMappingNote={showSharedVariantMappingNote}
            />
          ) : (
            <PinMappingEmptyState />
          )}
        </div>
      </div>

      {variantSelection ? (
        <VariantSelectorPopup
          id={variantPopupId}
          board={variantSelection.board}
          anchor={variantSelection.anchor}
          selectedBoardId={selectedBoardId}
          onClose={() => setVariantSelection(null)}
          onSelectVariant={(boardId) => {
            setVariantSelection(null);
            onSelectBoard(boardId);
          }}
        />
      ) : null}
    </>
  );
}

function PinMappingBoardList({
  boards,
  search,
  selectedBoardId,
  activeVariantBoardId,
  variantPopupId,
  onSearchChange,
  onSelectBoard,
}: {
  boards: BoardCatalogItem[];
  search: string;
  selectedBoardId: string | null;
  activeVariantBoardId: string | null;
  variantPopupId: string;
  onSearchChange: (search: string) => void;
  onSelectBoard: (
    board: BoardCatalogItem,
    anchor: HTMLButtonElement,
  ) => void;
}) {
  return (
    <div className="pin-browser-sidebar">
      <label className="board-search-field pin-browser-search ui-search-control">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Pin Mapping Browser"
          aria-label="Search boards"
          type="search"
        />
      </label>

      <div
        className="pin-board-list ui-button-group ui-selection-group ui-quiet-selection-group"
        role="group"
        aria-label="Available boards"
      >
        {boards.map((board) => {
          const isSelected = Boolean(
            selectedBoardId &&
            (board.id === selectedBoardId ||
              ("variants" in board &&
                board.variants.some(
                  (variant) => variant.id === selectedBoardId,
                ))),
          );
          const hasDistinctVariantMappings = Boolean(
            "variants" in board &&
              board.variants.length > 1 &&
              !boardVariantsHaveSamePinMappings(board),
          );
          const isActive = isSelected || activeVariantBoardId === board.id;

          return (
            <button
              key={board.id}
              type="button"
              className={isActive ? "pin-board-item selected" : "pin-board-item"}
              aria-pressed={isActive}
              aria-haspopup={hasDistinctVariantMappings ? "dialog" : undefined}
              aria-expanded={
                hasDistinctVariantMappings &&
                  activeVariantBoardId === board.id
              }
              aria-controls={hasDistinctVariantMappings ? variantPopupId : undefined}
              onClick={(event) => onSelectBoard(board, event.currentTarget)}
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
  showSharedVariantMappingNote,
}: {
  board: BoardDefinition;
  resourceGroups: PinBrowserResourceGroup[];
  showSharedVariantMappingNote: boolean;
}) {
  const [viewMode, setViewMode] = useState<"catalog" | "data" | "outputs">("catalog");
  const [outputsVisited, setOutputsVisited] = useState(false);
  const aliases = resourceGroups.flatMap((group) => group.pins);
  const physicalPadCount = new Set(
    aliases
      .map((pin) => pin.pin)
      .filter((pin) => !["internal", "unknown"].includes(pin.toLowerCase())),
  ).size;

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
          className="pin-browser-view-toggle ui-compact-button-group ui-selection-group ui-quiet-selection-group"
          role="group"
          aria-label="Pin mapping sections"
        >
          <button
            type="button"
            className={
              viewMode === "catalog"
                ? "pin-browser-view-button active"
                : "pin-browser-view-button"
            }
            aria-pressed={viewMode === "catalog"}
            onClick={() => setViewMode("catalog")}
          >
            <List size={15} />
            Pin Catalog
          </button>
          <button
            type="button"
            className={
              viewMode === "data"
                ? "pin-browser-view-button active"
                : "pin-browser-view-button"
            }
            aria-pressed={viewMode === "data"}
            onClick={() => setViewMode("data")}
          >
            <Database size={15} />
            Board Data
          </button>
          <button
            type="button"
            className={
              viewMode === "outputs"
                ? "pin-browser-view-button active"
                : "pin-browser-view-button"
            }
            aria-pressed={viewMode === "outputs"}
            onClick={() => {
              setOutputsVisited(true);
              setViewMode("outputs");
            }}
          >
            <Cable size={15} />
            Map Outputs
          </button>
        </div>
      </div>

      {showSharedVariantMappingNote ? (
        <div className="pin-variant-mapping-note" role="status">
          <Info size={16} aria-hidden="true" />
          <p>All variants of this board share the same pin mappings.</p>
        </div>
      ) : null}

      <div className="pin-summary-list">
        <PinSummaryPill label="Physical pads" value={String(physicalPadCount)} />
        <PinSummaryPill label="Pin aliases" value={String(aliases.length)} />
        <PinSummaryPill label="Clocks" value={String(board.clocks.length)} />
        <PinSummaryPill
          label="Constraints"
          value={`.${board.constraintsFile}`}
        />
      </div>

      {viewMode === "catalog" ? (
        <PinCatalogView board={board} resourceGroups={resourceGroups} />
      ) : viewMode === "data" ? (
        <BoardDataView board={board} />
      ) : null}
      {outputsVisited ? (
        <WelcomeOutputMapper
          board={board}
          resourceGroups={resourceGroups}
          hidden={viewMode !== "outputs"}
        />
      ) : null}
    </div>
  );
}

function PinCatalogView({
  board,
  resourceGroups,
}: {
  board: BoardDefinition;
  resourceGroups: PinBrowserResourceGroup[];
}) {
  const [search, setSearch] = useState("");
  const aliases = resourceGroups.flatMap((group) =>
    group.pins.map((pin) => ({
      ...pin,
      groupTitle: group.title,
      groupDetail: group.detail,
      metadata: findAliasMetadata(board, pin.key),
    })),
  );
  const pads = new Map<string, typeof aliases>();
  for (const alias of aliases) {
    const noPackagePad = ["internal", "unknown"].includes(alias.pin.toLowerCase());
    const key = noPackagePad ? "No package pad listed" : alias.pin;
    const group = pads.get(key) ?? [];
    group.push(alias);
    pads.set(key, group);
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visiblePads = [...pads.entries()]
    .map(([pad, entries]) => {
      const filteredEntries = normalizedSearch
        ? entries.filter((entry) =>
            `${pad} ${entry.name} ${entry.type} ${entry.groupTitle} ${entry.detail ?? ""} ${entry.metadata.ioStandard ?? ""} ${entry.metadata.polarity} ${entry.metadata.sourceLabel}`
              .toLowerCase()
              .includes(normalizedSearch),
          )
        : entries;
      return [pad, filteredEntries] as const;
    })
    .filter(([, entries]) => entries.length > 0)
    .sort(([left], [right]) => {
      if (left === "No package pad listed") return 1;
      if (right === "No package pad listed") return -1;
      return left.localeCompare(right, undefined, { numeric: true });
    });
  const visibleAliasCount = visiblePads.reduce(
    (total, [, entries]) => total + entries.length,
    0,
  );

  return (
    <div className="pin-catalog-view">
      <div className="pin-catalog-toolbar">
        <label className="pin-catalog-search ui-search-control">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search pad, alias, interface, or I/O standard"
            type="search"
            aria-label="Search board pin catalog"
          />
        </label>
        <span>{visiblePads.length} pads · {visibleAliasCount} aliases</span>
      </div>

      <div className="pin-catalog-pad-list">
        {visiblePads.map(([pad, entries]) => (
          <section className="pin-catalog-pad-card" key={pad}>
            <header className="pin-catalog-pad-heading">
              <div>
                <span>{pad === "No package pad listed" ? "Logical signals" : "Package pad"}</span>
                <h3>{pad}</h3>
              </div>
              <span className="pin-catalog-alias-count">
                {entries.length} alias{entries.length === 1 ? "" : "es"}
              </span>
            </header>
            <div className="pin-catalog-alias-list">
              {entries.map((entry) => {
                const color = getPinTypeColor(entry.type);
                return (
                  <article className="pin-catalog-alias-row" key={entry.key}>
                    <div className="pin-catalog-alias-name">
                      <span
                        className="pin-tile-symbol"
                        style={{ background: color.background, color: color.color }}
                      >
                        {entry.symbol}
                      </span>
                      <div>
                        <strong>{entry.name}</strong>
                        <span>
                          {entry.groupTitle === entry.groupDetail
                            ? entry.groupTitle
                            : `${entry.groupTitle} · ${entry.groupDetail}`}
                        </span>
                      </div>
                    </div>
                    <div className="pin-catalog-alias-facts">
                      <span><b>I/O standard</b>{entry.metadata.ioStandard ?? "Not documented"}</span>
                      <span><b>Polarity</b>{entry.metadata.polarity}</span>
                      <span className="pin-catalog-source-fact">
                        <b>Source</b>
                        {entry.metadata.sourceUrl ? (
                          <a href={entry.metadata.sourceUrl} target="_blank" rel="noreferrer">{entry.metadata.sourceLabel}</a>
                        ) : (
                          <span>Board profile</span>
                        )}
                      </span>
                    </div>
                    {entry.detail && !isDuplicateAliasDetail(entry.name, entry.detail) ? (
                      <p className="pin-catalog-alias-detail">{entry.detail}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {visiblePads.length === 0 ? (
          <div className="pin-catalog-empty">No package pads or aliases match that search.</div>
        ) : null}
      </div>
    </div>
  );
}

function isDuplicateAliasDetail(alias: string, detail: string) {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(alias) === normalize(detail);
}

function findAliasMetadata(board: BoardDefinition, key: string) {
  const clock = board.clocks.find((item) => `clock:${item.name}` === key);
  if (clock) {
    return {
      ioStandard: clock.ioStandard,
      polarity: "Not applicable",
      sourceUrl: clock.sourceUrl,
      sourceLabel:
        board.sources?.find((source) => source.url === clock.sourceUrl)?.label ??
        "Clock source",
    };
  }
  const pin = [...board.pins, ...board.leds, ...board.buttons].find(
    (item) => `pin:${item.name}:${item.pin}` === key,
  );
  return {
    ioStandard: pin?.ioStandard,
    polarity:
      pin?.type === "led" || pin?.type === "button"
        ? pin.activeLow === true
          ? "Active low"
          : pin.activeLow === false
            ? "Active high"
            : "Not documented"
        : "Not applicable",
    sourceUrl: pin?.sourceUrl,
    sourceLabel:
      board.sources?.find((source) => source.url === pin?.sourceUrl)?.label ??
      "Pin source",
  };
}

function BoardDataView({ board }: { board: BoardDefinition }) {
  return (
    <div className="pin-board-data-view">
      <section className="pin-board-identity-card ui-workspace-framed" aria-label="Board identity">
        <div className="pin-board-identity-heading">
          <div>
            <span>Board identity</span>
            <h3>{board.name}</h3>
          </div>
          <span className={board.identityUnresolved ? "pin-board-identity-status unresolved" : "pin-board-identity-status"}>
            {board.identityUnresolved ? "Needs verification" : "Board profile"}
          </span>
        </div>
        <dl className="pin-board-identity-grid">
          <div><dt>Vendor</dt><dd>{board.vendor}</dd></div>
          <div><dt>FPGA family</dt><dd>{board.family || "Not verified"}</dd></div>
          <div><dt>Device</dt><dd>{board.device || "Not verified"}</dd></div>
          <div><dt>Package</dt><dd>{board.package || "Not verified"}</dd></div>
          <div><dt>Catalog device ID</dt><dd>{board.fpgaId || "Not verified"}</dd></div>
          <div><dt>Constraint profile</dt><dd>.{board.constraintsFile}</dd></div>
          <div><dt>Build toolchain</dt><dd>{board.toolchain.synth || "Not specified"}</dd></div>
        </dl>
        {board.verificationNotes?.length ? (
          <ul className="pin-board-verification-notes">
            {board.verificationNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        ) : null}
      </section>
      <BoardResourceSummary board={board} />
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
    <div className="pin-summary-pill ui-metric">
      <div className="pin-summary-pill-label">{label}</div>
      <div className="pin-summary-pill-value">{value}</div>
    </div>
  );
}
