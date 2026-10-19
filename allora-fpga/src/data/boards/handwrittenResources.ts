import type { BoardDefinition, BoardPin, BoardClock } from "../boardTypes";
import { getVerifiedPlatform } from "./verifiedPlatformData";

// Keep saved-project aliases while adding resources from the reviewed source.
// LED/button aliases describe one physical channel, so do not count them twice.
// GPIO aliases may intentionally expose alternate functions of the same pad.
export function enrichHandwrittenBoard(
  board: BoardDefinition,
  platform: string,
  options: { excludedClocks?: string[] } = {},
): BoardDefinition {
  const data = getVerifiedPlatform(platform);
  if (!data || data.pins.length === 0) return board;
  const sourceSignals = new Map<string, number>();
  for (const pin of data.pins) {
    if (pin.signal)
      sourceSignals.set(pin.signal, (sourceSignals.get(pin.signal) ?? 0) + 1);
  }
  const canonicalSignal = (value?: string) =>
    value?.replace(/^uart_/, "serial_").replaceAll("[", "").replaceAll("]", "");
  const pins: BoardPin[] = board.pins.map((original) => {
    const pin: BoardPin = /(?:user_sw|user_dip_btn)(?:_|$)/.test(original.name)
      ? { ...original, type: "gpio", group: "Switches" }
      : original;
    const matching =
      data.pins.find(
        (candidate) =>
          candidate.name === pin.name && candidate.type === pin.type,
      ) ??
      data.pins.find(
        (candidate) =>
          canonicalSignal(candidate.signal) === canonicalSignal(pin.signal) &&
          pin.signal &&
          sourceSignals.get(candidate.signal ?? "") === 1 &&
          candidate.type === pin.type,
      ) ??
      data.pins.find(
        (candidate) => candidate.pin === pin.pin && candidate.type === pin.type,
      );
    return matching
      ? {
          ...matching,
          ...pin,
          pin: matching.pin,
          ioStandard: pin.sourceUrl
            ? (pin.ioStandard ?? matching.ioStandard)
            : (matching.ioStandard ?? pin.ioStandard),
          verified: pin.verified && matching.verified,
        }
      : { ...pin };
  });
  for (const raw of data.pins) {
    const pin = { ...raw };
    if (
      options.excludedClocks?.some(
        (clock) =>
          pin.signal === clock ||
          pin.name === clock ||
          pin.name.startsWith(`${clock}_`),
      )
    ) {
      pin.verified = false;
    }
    // A switch remains a switch in the diagram through its group, not a momentary button.
    if (/(?:user_sw|user_dip_btn)(?:_|$)/.test(pin.name)) {
      pin.type = "gpio";
      pin.group = "Switches";
    }
    if (/^alnum_led_/.test(pin.name)) {
      pin.type = "gpio";
      pin.group = "Alphanumeric display";
    }
    if (pin.signal && (sourceSignals.get(pin.signal) ?? 0) > 1)
      pin.signal = pin.name;
    const sameControl =
      (pin.type === "led" || pin.type === "button") &&
      pins.some(
        (candidate) => candidate.pin === pin.pin && candidate.type === pin.type,
      );
    const sameName = pins.some((candidate) => candidate.name === pin.name);
    const sameFunction = pins.some(
      (candidate) =>
        candidate.pin === pin.pin &&
        candidate.type === pin.type &&
        candidate.signal === pin.signal,
    );
    if (!sameControl && !sameName && !sameFunction) pins.push(pin);
  }
  const uniqueControls = (type: "led" | "button") =>
    pins.filter(
      (pin, index) =>
        pin.type === type &&
        pins.findIndex(
          (candidate) => candidate.type === type && candidate.pin === pin.pin,
        ) === index,
    );
  const firstClock = board.clocks[0];
  const sourceClocks = [data.clock, ...(data.additionalClocks ?? [])].filter(
    (clock): clock is BoardClock =>
      clock !== null && !options.excludedClocks?.includes(clock.name),
  );
  // Retain the selected clock's frequency/name if the source offers it. A
  // platform's preferred clock may differ from an existing project's default.
  const primaryClock =
    sourceClocks.find(
      (clock) =>
        clock.pin === firstClock?.pin &&
        clock.frequency === firstClock?.frequency,
    ) ??
    sourceClocks.find(
      (clock) =>
        clock.name === firstClock?.name &&
        clock.frequency === firstClock?.frequency,
    ) ??
    sourceClocks.find((clock) => clock.frequency === firstClock?.frequency) ??
    sourceClocks[0];
  const clocks = primaryClock
    ? [
        {
          ...firstClock,
          ...primaryClock,
          name: firstClock?.name ?? primaryClock.name,
          ...(firstClock?.sourceUrl
            ? {
                sourceUrl: firstClock.sourceUrl,
                ioStandard: firstClock.ioStandard ?? primaryClock.ioStandard,
              }
            : {}),
        },
        ...board.clocks.slice(1),
      ]
    : board.clocks;
  for (const clock of sourceClocks) {
    if (
      !clocks.some(
        (existing) =>
          existing.pin === clock.pin && existing.frequency === clock.frequency,
      )
    )
      clocks.push(clock);
  }
  return {
    ...board,
    pins,
    clocks,
    leds: uniqueControls("led"),
    buttons: uniqueControls("button"),
    sources: [...(board.sources ?? []), data.source],
    verificationNotes: [...(board.verificationNotes ?? []), ...data.notes],
  };
}
