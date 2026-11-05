// The keepsake flashback, painted in code: four small watercolor panels of one summer afternoon.

const W = 640, H = 400;

function wash(x: CanvasRenderingContext2D, color: string, pts: [number, number][], alpha = 0.85) {
  x.globalAlpha = alpha;
  x.fillStyle = color;
  x.beginPath();
  pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
  x.closePath(); x.fill();
  x.globalAlpha = 1;
}

function blob(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha = 0.6) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.globalAlpha = alpha; x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
}

/** Paper grain and soft vignette over everything, so the panels read as paintings, not renders. */
function paper(x: CanvasRenderingContext2D, seed: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 2600; i++) {
    x.globalAlpha = 0.05 + rnd() * 0.05;
    x.fillStyle = rnd() > 0.5 ? '#ffffff' : '#7a6448';
    x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  x.globalAlpha = 1;
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(255,240,210,0)'); v.addColorStop(1, 'rgba(120,80,40,0.45)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}

function sky(x: CanvasRenderingContext2D, top: string, bottom: string) {
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

function stream(x: CanvasRenderingContext2D, y: number) {
  wash(x, '#7fbfd8', [[0, y], [W * 0.3, y - 14], [W * 0.6, y + 6], [W, y - 10], [W, y + 60], [W * 0.55, y + 74], [W * 0.2, y + 58], [0, y + 70]]);
  x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const sx = 40 + i * 68, sy = y + 22 + (i % 3) * 12; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 14, sy - 4, sx + 30, sy); x.stroke(); }
}

function boat(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  wash(x, '#b07a48', [[cx - 40 * s, cy], [cx + 44 * s, cy], [cx + 28 * s, cy + 16 * s], [cx - 26 * s, cy + 16 * s]], 1);
  x.strokeStyle = '#6a4a2a'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy - 46 * s); x.stroke();
  wash(x, '#f6ecd6', [[cx + 2 * s, cy - 44 * s], [cx + 30 * s, cy - 6 * s], [cx + 2 * s, cy - 6 * s]], 1);
}

function hand(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  x.fillStyle = color;
  x.beginPath(); x.ellipse(cx, cy, r * 1.3, r, -0.3, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(cx - r * 0.9 + i * r * 0.6, cy - r * 0.9, r * 0.28, r * 0.6, 0, 0, Math.PI * 2); x.fill(); }
}

export function keepsakePanel(i: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  if (i === 0) {
    // A stream behind a house, the summer you were small.
    sky(x, '#f6d8a8', '#fff3dc');
    blob(x, 520, 80, 90, '#fff6c8', 0.9);
    wash(x, '#9cc070', [[0, 230], [200, 200], [420, 215], [W, 190], [W, H], [0, H]]);
    wash(x, '#e8d6b8', [[90, 120], [230, 120], [230, 215], [90, 215]], 1);
    wash(x, '#b0603e', [[70, 125], [160, 60], [250, 125]], 1);
    wash(x, '#5d5a8a', [[140, 160], [172, 160], [172, 215], [140, 215]], 1);
    blob(x, 380, 160, 70, '#4f9a5c', 0.8); blob(x, 420, 130, 60, '#6fae5a', 0.8);
    stream(x, 280);
    boat(x, 470, 300, 0.6);
  } else if (i === 1) {
    // Hands carving: an old hand guiding a small one.
    sky(x, '#f2dcb8', '#e8c89a');
    blob(x, 320, 200, 260, '#fff2d0', 0.6);
    wash(x, '#c8945a', [[180, 230], [470, 210], [480, 250], [190, 270]], 1);
    for (let k = 0; k < 6; k++) { x.strokeStyle = 'rgba(120,80,40,0.5)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(200 + k * 45, 238 - k * 3); x.lineTo(230 + k * 45, 236 - k * 3); x.stroke(); }
    hand(x, 260, 290, 34, '#e6b894');
    hand(x, 360, 300, 22, '#f2c8a2');
    x.strokeStyle = '#8a8a9a'; x.lineWidth = 5; x.beginPath(); x.moveTo(380, 280); x.lineTo(440, 240); x.stroke();
    for (let k = 0; k < 8; k++) wash(x, '#e8c89a', [[300 + k * 20, 330 + (k % 2) * 8], [310 + k * 20, 322], [314 + k * 20, 334]], 1);
  } else if (i === 2) {
    // It floats.
    sky(x, '#bfe0ee', '#eaf6f2');
    wash(x, '#8ab868', [[0, 140], [W, 120], [W, 180], [0, 200]]);
    stream(x, 190);
    wash(x, '#7fbfd8', [[0, 240], [W, 230], [W, H], [0, H]]);
    boat(x, 320, 250, 1.4);
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 3;
    for (let k = 1; k < 4; k++) { x.beginPath(); x.ellipse(320, 278, 70 * k, 10 * k, 0, 0, Math.PI * 2); x.stroke(); }
  } else {
    // Let it go. It knows the way.
    sky(x, '#f4c890', '#fde8c8');
    blob(x, 320, 140, 150, '#fff0b8', 0.9);
    wash(x, '#a8b878', [[0, 200], [W, 180], [W, 230], [0, 250]]);
    wash(x, '#86c4d8', [[0, 250], [W * 0.4, 230], [W, 240], [W, H], [0, H]]);
    boat(x, 420, 250, 0.45);
    // Two figures on the bank, one tall and one small, waving.
    wash(x, '#5d5a8a', [[150, 330], [190, 330], [182, 230], [158, 230]], 1);
    blob(x, 170, 216, 18, '#eccdb6', 1);
    wash(x, '#c4693a', [[210, 330], [236, 330], [232, 270], [214, 270]], 1);
    blob(x, 223, 260, 13, '#f2c8a2', 1);
    x.strokeStyle = '#f2c8a2'; x.lineWidth = 5; x.beginPath(); x.moveTo(232, 278); x.lineTo(252, 250); x.stroke();
  }
  paper(x, i + 1);
  return c;
}
