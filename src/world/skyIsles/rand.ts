// The Sky Isles' own random numbers. World 2 never draws from the shared prop generator (props.ts P.rand), so
// nothing built here can ever shift World 1's layout. Park-Miller, like every other generator in the game.

/** A fresh generator: () => number in (0, 1). Same seed, same sequence. */
export function skyRng(seed: number): () => number {
  let s = (Math.floor(Math.abs(seed) * 7919) + 101) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** A number between a and b. */
export const between = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** One of the items. */
export const pickOf = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
