// The Walking Town's own random numbers. World 3 never draws from the shared prop generator (props.ts P.rand), so
// nothing built here can shift World 1's or World 2's layout. Park-Miller, like every other generator in the game.

/** A fresh generator: () => number in (0, 1). Same seed, same sequence. */
export function townRng(seed: number): () => number {
  let s = (Math.floor(Math.abs(seed) * 7919) + 211) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** A number between a and b. */
export const between = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** One of the items. */
export const pickOf = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
