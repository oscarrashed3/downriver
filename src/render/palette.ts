// Chapter One's palette as named tokens. Change a color here and it changes everywhere it is used.
// Rule of thumb: warm, sunlit tops; cool blue-violet shadows; saturated but never neon.

export const PEAKS = {
  meadowLow: '#90b85c',     // sunlit valley grass
  meadowMid: '#559262',     // shaded slopes
  heights: '#7d8a8a',       // high bare ground
  rock: '#8c8a9c',          // cliffs, tinted toward the sky
  bank: '#bfae84',          // river shingle
  moss: '#6f9a4a',          // moss on rock
  dab: '#b4cc72',           // painted dabs of brighter grass
  path: '#c9a66b',          // worn footpaths
  snow: '#f7f9ff',
  ice: '#b4e2f7',
  water: '#86dcf2',
  waterDeep: '#2f86b8',
  sunlight: '#ffe8c4',      // morning sun
  skyAmbient: '#9cc4f0',    // the blue that fills shadows
  haze: '#bcdcf0',          // distance fog by day
  skyTop: '#1d5fc8',
  skyHorizon: '#b4def2',
} as const;

export const LIGHT = {
  nightAmbient: '#24506a',
  duskAmbient: '#b07890',
  groundBounce: '#3f5a8a',  // cool blue bounce light in shadow, never grey
  rimDay: '#ffe2b0',
  rimDusk: '#ffb07a',
  rimNight: '#9fb6ff',
  sunsetSun: '#ff9f62',
  nightFog: '#163a46',
  duskFog: '#f0b8a8',
  moon: '#9fb0ff',
  ink: '#2a2438',           // outline color
} as const;

export const CLOUDS = {
  top: '#fff7ea',           // sunlit cumulus
  belly: '#a9bad8',         // cool shaded underside
  dusk: '#ffb29a',
} as const;

export const PEOPLE = {
  rillCoat: '#c4693a', rillScarf: '#3f86b8', rillSkin: '#f2c8a2', rillHair: '#3b2a22',
  ysoldeCoat: '#5d5a8a', ysoldeShawl: '#c8a86a',
  torCoat: '#4f7a5a', torCap: '#3d6a8a',
  bramCoat: '#7a5236', bramHat: '#8a6a3a',
  nimaCoat: '#d0584a', nimaScarf: '#f2c84a',
  odoCoat: '#3f5a7a',
} as const;

export const UI = {
  paper: '#efe2c0',
  paperInk: '#2b2540',
  caption: '#fff8ea',
  homeLight: '#ffe696',
} as const;
