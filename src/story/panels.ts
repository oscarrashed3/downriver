// Painted story panels drawn in code: the storm that carried Nilo off, and the postman's letters.
// Ink lines over flat washes, in the same comic-book spirit as the in-game finish pass.

const W = 640, H = 400;
const INK = '#1c1626';

function rng(seed: number) { let s = seed * 48271 + 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function poly(x: CanvasRenderingContext2D, pts: number[][], fill: string | null, stroke: string | null = INK, w = 2.2) {
  x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); }
  if (stroke) { x.strokeStyle = stroke; x.lineWidth = w; x.lineJoin = 'round'; x.stroke(); }
}

function grad(x: CanvasRenderingContext2D, stops: [number, string][]) {
  const g = x.createLinearGradient(0, 0, 0, H);
  for (const [k, c] of stops) g.addColorStop(k, c);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

/** A cumulus bank: overlapping puffs, outlined only on the outside (stroke every puff, then fill over the strokes). */
function cloudBank(x: CanvasRenderingContext2D, y: number, col: string, belly: string, r: () => number) {
  const puffs: number[][] = [];
  for (let cx = -30; cx < W + 60;) { const rad = 34 + r() * 46; puffs.push([cx, y + (r() - 0.3) * 34 - rad * 0.3, rad]); cx += rad * 1.15; }
  for (let cx = -30; cx < W + 60;) { const rad = 40 + r() * 30; puffs.push([cx, y + 50 + r() * 20, rad]); cx += rad * 1.3; }
  const g = x.createLinearGradient(0, y - 80, 0, y + 90); g.addColorStop(0, col); g.addColorStop(1, belly);
  const body = (fill: boolean) => {
    for (const [cx, cy, rad] of puffs) { x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); if (fill) x.fill(); else x.stroke(); }
    x.beginPath(); x.rect(-40, y + 50, W + 80, 120); if (fill) x.fill(); else x.stroke();
  };
  x.strokeStyle = INK; x.lineWidth = 5; body(false);
  x.fillStyle = g; body(true);
  // a few inner crease lines, like ink on a comic cloud
  x.strokeStyle = 'rgba(20,14,30,0.35)'; x.lineWidth = 1.5;
  for (const [cx, cy, rad] of puffs.slice(0, 8)) { x.beginPath(); x.arc(cx + rad * 0.2, cy + rad * 0.25, rad * 0.6, 0.2, 1.4); x.stroke(); }
}

function rain(x: CanvasRenderingContext2D, r: () => number, alpha = 0.35) {
  x.strokeStyle = `rgba(200,215,255,${alpha})`; x.lineWidth = 1.2;
  for (let i = 0; i < 260; i++) { const a = r() * W, b = r() * H; x.beginPath(); x.moveTo(a, b); x.lineTo(a - 8, b + 26); x.stroke(); }
}

function hatch(x: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, gap = 6, alpha = 0.35) {
  x.save(); x.beginPath(); x.rect(x0, y0, w, h); x.clip();
  x.strokeStyle = `rgba(20,14,30,${alpha})`; x.lineWidth = 1;
  for (let k = -h; k < w; k += gap) { x.beginPath(); x.moveTo(x0 + k, y0 + h); x.lineTo(x0 + k + h, y0); x.stroke(); }
  x.restore();
}

function lightning(x: CanvasRenderingContext2D, sx: number, sy: number, r: () => number) {
  x.strokeStyle = '#fffbe8'; x.lineWidth = 4; x.shadowColor = '#cfe0ff'; x.shadowBlur = 24;
  x.beginPath(); x.moveTo(sx, sy);
  let px = sx, py = sy;
  for (let i = 0; i < 9; i++) { px += (r() - 0.5) * 50; py += 22 + r() * 18; x.lineTo(px, py); }
  x.stroke(); x.shadowBlur = 0;
}

function paperBoat(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  poly(x, [[-40, 0], [40, 0], [26, 16], [-26, 16]], '#f2ead6');
  poly(x, [[-14, 0], [0, -34], [14, 0]], '#e4dac2');
  x.restore();
}

/** A tiny hooded traveler, clinging to the boat. */
function nilo(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  poly(x, [[-9, 0], [9, 0], [7, -18], [0, -26], [-7, -18]], '#c8a47c');
  x.fillStyle = '#2a1c20'; x.beginPath(); x.arc(0, -16, 5, 0, 7); x.fill();
  x.fillStyle = '#ffc85a'; x.fillRect(-3, -17, 2, 2); x.fillRect(1, -17, 2, 2);
  x.restore();
}

/** The keeper: a tall hooded silhouette with a lantern, black against the flash. */
function keeper(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.fillStyle = INK;
  x.beginPath();
  x.moveTo(-26, 0); x.lineTo(-18, -70); x.quadraticCurveTo(-20, -104, 0, -112); x.quadraticCurveTo(20, -104, 18, -70);
  x.lineTo(30, 0); x.closePath(); x.fill();
  // coat flapping in the wind
  x.beginPath(); x.moveTo(18, -60); x.quadraticCurveTo(48, -40, 60, -10); x.lineTo(30, -6); x.closePath(); x.fill();
  // arm and lantern
  x.lineWidth = 7; x.strokeStyle = INK; x.beginPath(); x.moveTo(-14, -70); x.lineTo(-40, -52); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.moveTo(-40, -52); x.lineTo(-40, -42); x.stroke();
  const g = x.createRadialGradient(-40, -34, 1, -40, -34, 40); g.addColorStop(0, 'rgba(255,214,140,0.95)'); g.addColorStop(1, 'rgba(255,214,140,0)');
  x.fillStyle = g; x.beginPath(); x.arc(-40, -34, 40, 0, 7); x.fill();
  x.fillStyle = '#ffe3a0'; x.fillRect(-46, -42, 12, 14);
  x.restore();
}

function grain(x: CanvasRenderingContext2D, r: () => number, dark = false) {
  for (let i = 0; i < 2600; i++) {
    x.globalAlpha = 0.04 + r() * 0.05;
    x.fillStyle = r() > 0.5 ? '#ffffff' : dark ? '#000000' : '#6a5440';
    x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  x.globalAlpha = 1;
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, dark ? 'rgba(4,6,20,0.6)' : 'rgba(100,70,40,0.4)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}

/** Three storm panels: the boat caught in the sky, the keeper in a lightning flash, the fall through cloud. */
export function stormPanel(i: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const r = rng(i + 3);
  if (i === 0) {
    grad(x, [[0, '#0c1230'], [0.6, '#24305a'], [1, '#3a4670']]);
    cloudBank(x, 70, '#3a4470', '#161c3a', r);
    cloudBank(x, 300, '#4a5482', '#1c2244', r);
    // the wind as ink swirls
    x.strokeStyle = 'rgba(220,230,255,0.55)'; x.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const y = 140 + k * 20; x.beginPath(); x.moveTo(20, y); x.bezierCurveTo(200, y - 40, 380, y + 40, 620, y - 10); x.stroke(); }
    paperBoat(x, 330, 200, 1.3, -0.35);
    nilo(x, 330, 196, 1.3);
    rain(x, r);
    grain(x, r, true);
  } else if (i === 1) {
    grad(x, [[0, '#dfe8ff'], [0.5, '#9aaee8'], [1, '#2a3460']]);
    lightning(x, 470, 0, r);
    cloudBank(x, 40, '#cdd8f8', '#7080b8', r);
    // a crag far off, the keeper standing on it
    poly(x, [[0, H], [0, 300], [120, 280], [220, 240], [300, 252], [380, 300], [460, 330], [W, 340], [W, H]], '#141020');
    keeper(x, 250, 244, 0.9);
    hatch(x, 0, 300, W, 100, 7, 0.5);
    rain(x, r, 0.5);
    grain(x, r, true);
  } else {
    grad(x, [[0, '#2a3260'], [0.45, '#8ca0d8'], [1, '#f4e8d2']]);
    // falling through the cloud sea; far below, peaks in morning light
    cloudBank(x, 120, '#e8ecff', '#9aa8d8', r);
    poly(x, [[0, H], [80, 330], [150, 300], [220, 340], [320, 270], [420, 330], [520, 300], [W, 350], [W, H]], '#7a9ad0');
    poly(x, [[290, 290], [320, 270], [352, 292], [336, 288], [320, 296], [304, 288]], '#ffffff', INK, 1.5);
    paperBoat(x, 360, 150, 0.7, 0.8);
    nilo(x, 300, 110, 0.9);
    grain(x, r);
  }
  return c;
}

/** The postman's letter, on cream paper, in the keeper's slanted hand. */
export function letterPanel(lines: string[], sign: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const r = rng(41);
  x.fillStyle = '#2a2436'; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W / 2, H / 2); x.rotate(-0.025);
  poly(x, [[-250, -170], [250, -170], [250, 170], [-250, 170]], '#f4ead2', INK, 2);
  x.fillStyle = 'rgba(160,120,80,0.12)'; for (let i = 0; i < 40; i++) { x.beginPath(); x.arc((r() - 0.5) * 480, (r() - 0.5) * 320, 6 + r() * 30, 0, 7); x.fill(); }
  // a fold crease and a wax seal of a little lantern
  x.strokeStyle = 'rgba(120,90,60,0.35)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-250, 0); x.lineTo(250, 0); x.stroke();
  x.fillStyle = '#b8483a'; x.beginPath(); x.arc(200, 128, 18, 0, 7); x.fill();
  x.fillStyle = '#f2c060'; x.fillRect(196, 120, 8, 12);
  x.fillStyle = '#2e2440'; x.font = 'italic 19px Georgia, serif'; x.textAlign = 'left';
  let y = -128;
  for (const ln of lines) {
    const words = ln.split(' '); let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > 440) { x.fillText(cur, -220, y); y += 28; cur = w; } else cur = t; }
    if (cur) { x.fillText(cur, -220, y); y += 28; }
    y += 12;
  }
  x.textAlign = 'right'; x.fillText(sign, 220, 132);
  x.restore();
  grain(x, r);
  return c;
}
