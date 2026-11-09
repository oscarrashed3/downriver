// The ripple system: one river state carried from world to world.
// Upstream choices change the starting conditions of every world below.

export interface RiverState {
  /** 0..1 how much water the spring sends down. Driven by the Spring Peaks snowpack. */
  flow: number;
  /** 0..1 mud in the water (erosion in the Ember Pines, later). */
  sediment: number;
  /** 0..1 water temperature stress. */
  warmth: number;
  /** 0..1 salt intrusion (Endless Sea, later). */
  salinity: number;
  /** Trust of key characters, carried downstream: they remember you. */
  trust: Record<string, number>;
  /** Did the journey loop close at least once? */
  loopComplete: boolean;
}

export function createRiverState(): RiverState {
  return { flow: 0.3, sediment: 0.5, warmth: 0.6, salinity: 0.4, trust: {}, loopComplete: false };
}

/** How each world sees the river arriving at it. Flow thins a little in each world it crosses. */
export function flowArrivingAt(state: RiverState, worldIndex: number): number {
  const loss = 0.04 * worldIndex;
  return Math.max(0.05, state.flow - loss * (1 - state.flow));
}

/** Visual river width multiplier for a given flow (thin trickle to a full river). */
export function riverWidthFor(flow: number): number {
  return 0.35 + 0.9 * flow;
}

/** River "health" drives color, sound and the drop's glow. */
export function riverHealth(state: RiverState, worldIndex: number): number {
  const f = flowArrivingAt(state, worldIndex);
  // Mud washes out of the forest (world 1) and shows in every world below it.
  return Math.min(1, Math.max(0, 0.15 + 0.85 * f - 0.2 * state.sediment * (worldIndex >= 2 ? 1 : 0)));
}
