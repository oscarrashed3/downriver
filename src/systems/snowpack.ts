// Spring Peaks systems puzzle: the snowpack is the mountain's water jar.
// Real-world practices modelled here:
//  - Snow fences on windward ridges catch drifting snow (used across mountain regions).
//  - Ice stupas: winter water piped into tall ice cones that melt slowly into spring (Ladakh).
// Two valid solutions with different tradeoffs: fences need Skyreading and only work where
// the wind delivers snow; stupas work anywhere near the outflow but borrow winter water from
// the lower meadow, which upsets the goatherd unless you talk to him first.

export type SiteKind = 'fence' | 'stupa';

export interface Site {
  id: string;
  kind: SiteKind;
  /** For fences: 1 = squarely windward, 0 = sheltered (almost useless). */
  windExposure: number;
  built: boolean;
}

export interface SnowpackState {
  /** 0..1 snow stored at the end of winter. */
  snowpack: number;
  /** Number of winters simulated. */
  winters: number;
  sites: Site[];
  /** History for Ysolde's stones: glacier reach after each winter (0..1). */
  history: number[];
}

export const SNOWPACK_START = 0.3;
export const SNOWPACK_HEALED = 0.7;

export function createSnowpack(): SnowpackState {
  return {
    snowpack: SNOWPACK_START,
    winters: 0,
    history: [0.62, 0.55, 0.49, 0.42, 0.36, SNOWPACK_START],
    sites: [
      { id: 'fence-north-ridge', kind: 'fence', windExposure: 1.0, built: false },
      { id: 'fence-saddle', kind: 'fence', windExposure: 0.9, built: false },
      { id: 'fence-east-shoulder', kind: 'fence', windExposure: 0.85, built: false },
      { id: 'fence-lee-hollow', kind: 'fence', windExposure: 0.1, built: false },
      { id: 'fence-south-bowl', kind: 'fence', windExposure: 0.15, built: false },
      { id: 'stupa-west', kind: 'stupa', windExposure: 0, built: false },
      { id: 'stupa-east', kind: 'stupa', windExposure: 0, built: false },
    ],
  };
}

/** How much one built site adds to the snowpack held into spring. */
export function siteContribution(site: Site): number {
  if (!site.built) return 0;
  if (site.kind === 'fence') return 0.16 * site.windExposure;
  return 0.2;
}

/** Snowpack the next winter will leave, given what has been built. */
export function projectedSnowpack(s: SnowpackState): number {
  const added = s.sites.reduce((a, site) => a + siteContribution(site), 0);
  return Math.min(1, SNOWPACK_START + added);
}

/** Let one winter pass. Returns the new snowpack. */
export function passWinter(s: SnowpackState): number {
  s.winters += 1;
  s.snowpack = projectedSnowpack(s);
  s.history.push(s.snowpack);
  return s.snowpack;
}

export function isHealed(s: SnowpackState): boolean {
  return s.snowpack >= SNOWPACK_HEALED - 1e-6;
}

/** Spring flow sent downstream from a snowpack value. */
export function springFlowFrom(snowpack: number): number {
  return Math.min(1, Math.max(0.1, snowpack * 1.15));
}
