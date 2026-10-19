import type { BoardDefinition } from "../boardTypes";

// AMD ordering codes separate silicon, package and speed grade. Some LiteX
// records concatenate silicon/package, while Spartan-6 puts speed before package.
// Sources: AMD UG475 (7-series), UG575 (UltraScale), DS160 (Spartan-6).
const AMD_DEVICE =
  /^(?:XC|XA|XQ)(?:[2-7][ASVKZ][A-Z]*\d+[A-Z]*|(?:AU|KU|VU|ZU|U)\d+[A-Z]*)$/;
// A finite package prefix list prevents a trailing device letter from being
// swallowed by the package when a published part has no separating hyphen.
const AMD_PACKAGE_PREFIXES = [
  "CSGA",
  "CSG",
  "CLG",
  "CPG",
  "FBG",
  "FGG",
  "FFG",
  "FTGB",
  "FTG",
  "SBG",
  "TQG",
  "TQ",
  "CS",
  "FF",
  "FG",
  "FHGG",
  "FHGB",
  "FHGC",
  "FHGD",
  "FHGE",
  "FFVA",
  "FFVB",
  "FFVC",
  "FFVD",
  "FFVE",
  "FFVF",
  "FFVG",
  "FIGD",
  "FLGA",
  "FLGB",
  "FLGC",
  "FLGF",
  "FLGH",
  "FSGD",
  "FSGA",
  "FSVH",
  "SFVA",
  "SFVB",
  "SFVC",
  "SBVA",
  "SBVB",
  "SBVC",
  "UBVA",
  "FCVA",
  "FCVB",
  "VSVA",
  "VSVH",
];
const packagePattern = `(?:${AMD_PACKAGE_PREFIXES.join("|")})\\d{2,4}`;
const AMD_PACKAGE = new RegExp(`^${packagePattern}$`);
const AMD_GLUED_PART = new RegExp(
  `^((?:XC|XA|XQ)[A-Z0-9]+?)(${packagePattern})$`,
);

function parseAmdPart(rawPart: string) {
  const tokens = rawPart.trim().toUpperCase().split("-");
  if (!/^(?:XC|XA|XQ)/.test(tokens[0] ?? "")) return null;
  if (AMD_DEVICE.test(tokens[0])) {
    const packageName = tokens
      .slice(1)
      .find((token) => AMD_PACKAGE.test(token));
    if (packageName) return { device: tokens[0], packageName };
  }
  const glued = tokens[0]?.match(AMD_GLUED_PART);
  if (glued && AMD_DEVICE.test(glued[1])) {
    return { device: glued[1], packageName: glued[2] };
  }
  return null;
}

/** Normalize display labels only; preserve exact build ID and capability fields. */
export function normalizeCatalogIdentity(
  board: BoardDefinition,
): BoardDefinition {
  const parsed = parseAmdPart(board.fpgaId) ?? parseAmdPart(board.device);
  if (!parsed) {
    // A speed grade is never a package. Keep genuinely unresolved identities
    // unknown instead of presenting a plausible-looking numeric package.
    if (/^\d+(?:L)?$/i.test(board.package)) {
      return {
        ...board,
        package: "unknown",
        verificationNotes: [
          ...(board.verificationNotes ?? []),
          "The legacy package value was a numeric speed grade; package remains unresolved.",
        ],
      };
    }
    return board;
  }
  if (board.device === parsed.device && board.package === parsed.packageName)
    return board;
  return {
    ...board,
    device: parsed.device,
    package: parsed.packageName,
    verificationNotes: [
      ...(board.verificationNotes ?? []),
      `Device/package labels separated from the published AMD part (${board.fpgaId}); exact part ID preserved.`,
    ],
  };
}
