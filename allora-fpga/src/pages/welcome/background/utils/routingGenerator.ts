import { createSeededRandom } from "./seededRandom";

export type RoutePoint = readonly [number, number, number];
export type RouteSide = "simulation" | "build" | "shared";
export type RouteStrength = "dark" | "soft" | "active";

export type PcbRoute = {
  id: number;
  points: RoutePoint[];
  side: RouteSide;
  strength: RouteStrength;
  speed: number;
  phase: number;
};

const BOARD_Y = 0.035;

export function generateRoutingNetwork(seed = 0xa1104a, count = 112) {
  const random = createSeededRandom(seed);
  const routes: PcbRoute[] = [];

  for (let index = 0; index < count; index += 1) {
    const side: RouteSide =
      index % 11 === 0 ? "shared" : index % 2 === 0 ? "simulation" : "build";
    const direction = index % 8;
    const lane = Math.floor(index / 8);
    const pinOffset = ((index % 26) - 12.5) * 0.092;
    const jitter = (random() - 0.5) * 0.12;
    let points: RoutePoint[];

    if (direction < 3) {
      const sign = side === "build" ? 1 : -1;
      const startX = sign * 1.43;
      const startZ = pinOffset;
      const escapeX = sign * (1.95 + (lane % 4) * 0.12);
      const bendZ = startZ - 0.52 - lane * 0.23 + jitter;
      const endX = sign * (7.4 + (lane % 6) * 0.48);
      points = [
        [startX, BOARD_Y, startZ],
        [escapeX, BOARD_Y, startZ],
        [escapeX + sign * 0.46, BOARD_Y, bendZ],
        [endX, BOARD_Y, bendZ],
      ];
    } else if (direction < 6) {
      const sign = side === "build" ? 1 : -1;
      const startX = pinOffset;
      const startZ = -1.43;
      const laneX = sign * (0.75 + (lane % 9) * 0.34);
      const turnZ = -2.15 - lane * 0.31 + jitter;
      points = [
        [startX, BOARD_Y, startZ],
        [startX, BOARD_Y, -1.88],
        [laneX, BOARD_Y, turnZ],
        [laneX, BOARD_Y, -11.5 - (lane % 5) * 1.2],
      ];
    } else {
      const sign = side === "build" ? 1 : -1;
      const startX = pinOffset;
      const startZ = 1.43;
      const laneX = sign * (0.65 + (lane % 8) * 0.37);
      const turnZ = 2.15 + lane * 0.2 + jitter;
      points = [
        [startX, BOARD_Y, startZ],
        [startX, BOARD_Y, 1.9],
        [laneX, BOARD_Y, turnZ],
        [laneX, BOARD_Y, 5.8 + (lane % 4) * 0.75],
      ];
    }

    const roll = random();
    const strength: RouteStrength = roll < 0.7 ? "dark" : roll < 0.9 ? "soft" : "active";
    routes.push({
      id: index,
      points,
      side,
      strength,
      speed: 0.055 + random() * 0.075,
      phase: random(),
    });
  }

  return routes;
}

export function sampleRoute(points: RoutePoint[], progress: number): RoutePoint {
  const lengths: number[] = [];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const length = Math.hypot(
      current[0] - previous[0],
      current[1] - previous[1],
      current[2] - previous[2],
    );
    lengths.push(length);
    total += length;
  }

  let distance = (((progress % 1) + 1) % 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index]) {
      const start = points[index];
      const end = points[index + 1];
      const amount = lengths[index] === 0 ? 0 : distance / lengths[index];
      return [
        start[0] + (end[0] - start[0]) * amount,
        start[1] + (end[1] - start[1]) * amount,
        start[2] + (end[2] - start[2]) * amount,
      ];
    }
    distance -= lengths[index];
  }

  return points[points.length - 1];
}

