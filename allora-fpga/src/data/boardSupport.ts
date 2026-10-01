import { BOARDS, getBoardById } from "./boards";
import { getBoardCapabilities } from "./boardCapabilities";
import type { BoardCatalogItem, BoardDefinition } from "./boards";

export type { BoardCatalogItem } from "./boards";
export type VariantBoardCatalogItem = Extract<
  BoardCatalogItem,
  { variants: unknown }
>;

export function getBoardDefinitions(
  board: BoardCatalogItem,
): BoardDefinition[] {
  return "variants" in board
    ? board.variants
        .map((variant) => getBoardById(variant.id))
        .filter((variantBoard): variantBoard is BoardDefinition =>
          Boolean(variantBoard),
        )
    : [board];
}

export function boardSupportsBuildFlow(board: BoardCatalogItem): boolean {
  return getBoardDefinitions(board).some((boardDefinition) => {
    const capabilities = getBoardCapabilities(boardDefinition);
    return (
      capabilities.synthesisDiagram.supported &&
      capabilities.bitstream.supported
    );
  });
}

export function boardHasPinMappingData(board: BoardCatalogItem): boolean {
  return getBoardDefinitions(board).some(
    (boardDefinition) =>
      boardDefinition.pins.length > 0 ||
      boardDefinition.clocks.some((clock) => Boolean(clock.pin)),
  );
}

export function sortBoardsByName(
  boards: BoardCatalogItem[],
): BoardCatalogItem[] {
  return [...boards].sort((a, b) => a.name.localeCompare(b.name));
}

export function getBuildSupportedBoards(): BoardCatalogItem[] {
  return selectCatalogBoards(
    (board) => getBoardCapabilities(board).bitstream.supported,
  );
}

// Keep unresolved open-toolchain targets discoverable, while their capability
// checks continue to block building. Filter mixed families per variant.
export function getBuildCatalogBoards(): BoardCatalogItem[] {
  return selectCatalogBoards(
    (board) => board.synthesisFlow === "yosys-nextpnr",
  );
}

export function getPinMappingOnlyBoards(): BoardCatalogItem[] {
  return selectCatalogBoards(
    (board) =>
      board.synthesisFlow !== "yosys-nextpnr" && boardHasPinMappingData(board),
  );
}

function selectCatalogBoards(
  predicate: (board: BoardDefinition) => boolean,
): BoardCatalogItem[] {
  return sortBoardsByName(
    BOARDS.flatMap((board): BoardCatalogItem[] => {
      if (!("variants" in board)) return predicate(board) ? [board] : [];
      const variants = board.variants.filter((variant) => {
        const definition = getBoardById(variant.id);
        return definition && predicate(definition);
      });
      return variants.length ? [{ ...board, variants }] : [];
    }),
  );
}

export function countBoardVariants(boards: BoardCatalogItem[]): number {
  return new Set(boards.flatMap(getBoardDefinitions).map((board) => board.id))
    .size;
}

export function matchesBoardSearch(
  board: BoardCatalogItem,
  query: string,
): boolean {
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const text = normalize(
    [
      board.id,
      board.name,
      board.vendor,
      board.device,
      ...getBoardDefinitions(board).flatMap((definition) => [
        definition.id,
        definition.name,
        definition.family,
        definition.device,
        definition.fpgaId,
        definition.package,
      ]),
    ].join(" "),
  );
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}
