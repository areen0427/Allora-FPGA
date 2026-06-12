import { BOARDS, getBoardById } from "./boards";
import { getBoardCapabilities } from "./boardCapabilities";
import type { BoardDefinition } from "./boards";

export type BoardCatalogItem = (typeof BOARDS)[number];
export type VariantBoardCatalogItem = Extract<BoardCatalogItem, { variants: unknown }>;

export function getBoardDefinitions(board: BoardCatalogItem): BoardDefinition[] {
  return "variants" in board
    ? board.variants
        .map((variant) => getBoardById(variant.id))
        .filter((variantBoard): variantBoard is BoardDefinition => Boolean(variantBoard))
    : [board];
}

export function boardSupportsBuildFlow(board: BoardCatalogItem): boolean {
  return getBoardDefinitions(board).some((boardDefinition) => {
    const capabilities = getBoardCapabilities(boardDefinition);
    return capabilities.synthesisDiagram.supported && capabilities.bitstream.supported;
  });
}

export function boardHasPinMappingData(board: BoardCatalogItem): boolean {
  return getBoardDefinitions(board).some(
    (boardDefinition) =>
      boardDefinition.pins.length > 0 ||
      boardDefinition.clocks.some((clock) => Boolean(clock.pin))
  );
}

export function sortBoardsByName(boards: BoardCatalogItem[]): BoardCatalogItem[] {
  return [...boards].sort((a, b) => a.name.localeCompare(b.name));
}

export function getBuildSupportedBoards(): BoardCatalogItem[] {
  return sortBoardsByName(BOARDS.filter(boardSupportsBuildFlow));
}

export function getPinMappingOnlyBoards(): BoardCatalogItem[] {
  return sortBoardsByName(BOARDS.filter((board) => !boardSupportsBuildFlow(board) && boardHasPinMappingData(board)));
}
