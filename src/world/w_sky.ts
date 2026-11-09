// World 2, The Sky Isles (bright midday, wind). A chain of floating islands above a sea of cloud: the river runs
// along their tops, pours off each one and crosses the gaps on stone aqueducts. Sailtown, Windmill Isle, the
// Sail-mender's Isle, the Chime Garden and Whale's Rest; the fox waits on a little drifting islet.
// Everything is built by skyIsles/world.ts (SkyWorld) from the plan in skyIsles/layout.ts; this file hooks it in.
import type { Planet } from './planet';
import type { Kit, Flat } from './content';
import { SkyWorld } from './skyIsles/world';
import { SPOTS } from './skyIsles/layout';

/** Degrees of longitude offset that are `m` R-metres from the river at this latitude (layout.ts uses metres). */
const lonOf = (lat: number, m: number, R = 58) => m / (R * Math.PI / 180 * Math.max(0.05, Math.sin(lat * Math.PI / 180)));

/** Where the fox waits (river lat, lon offset in degrees): on the drifting islet, tangled in a kite string. */
export const FOX_SPOT = { lat: SPOTS.fox.lat, lon: lonOf(SPOTS.fox.lat, SPOTS.fox.off) } as const;

// The islands are their own height function (skyIsles/terrain.ts): nothing to flatten.
export function prepareSky(_p: Planet, _f: Flat) {}

export function populateSky(k: Kit) {
  const { p, c, npc, lm } = k;
  const R = p.R;
  const w = new SkyWorld(p, k.scene);
  c.refs.skyWorld = w;
  // the planet's own skin is only the map's model here: the islands are drawn by SkyWorld
  p.terrain.visible = false;
  Object.assign(c.refs, w.dressing.refs);

  const at = (s: { lat: number; off: number }) => [s.lat, lonOf(s.lat, s.off, R)] as const;
  lm('Landing Isle', ...at(SPOTS.signpost), 'pole');
  lm('Sailtown', ...at(SPOTS.sailSquare), 'hut');
  lm('Windmill Isle', ...at(SPOTS.windmillTop), 'tower');
  lm("The sail-mender's isle", ...at(SPOTS.menderHut), 'hut');
  lm('The Chime Garden', ...at(SPOTS.workshop), 'stone');
  lm("Whale's Rest", ...at(SPOTS.whalesRest), 'cloud');

  // the windfolk (Lark, Zephy, Gran Wren, the sail-mender and the chime-maker) are placed by story/skyChapter.ts
  void npc;
}
