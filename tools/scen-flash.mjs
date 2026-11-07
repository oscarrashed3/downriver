// Watch the screen's brightness every drawn frame through the opening, the raft, the ride to world 2 and the flight back,
// and report any sudden dark pop (a frame much darker than the frames on both sides of it) or a jump to dark.
export default async ({ page, shot, ev, key }) => {
  await ev(`(() => { const g = __game, gl = g.renderer.getContext(), px = new Uint8Array(4); window.__lum = [];
    const fadeLum = () => { const h = g.hud; const c = getComputedStyle(h.fade).backgroundColor.match(/\\d+/g).map(Number); return { a: h.fadeNow, l: (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 }; };
    const r0 = g.composer.render.bind(g.composer);
    g.composer.render = (...a) => { r0(...a); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; let s = 0;
      for (const [x, y] of [[.2,.2],[.5,.2],[.8,.2],[.2,.5],[.5,.5],[.8,.5],[.2,.8],[.5,.8],[.8,.8]]) { gl.readPixels(Math.floor(W * x), Math.floor(H * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); s += (0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]) / 255; }
      const f = fadeLum(); const l = (s / 9) * (1 - f.a) + f.l * f.a; const po = +getComputedStyle(g.hud.panel).opacity, so = +getComputedStyle(g.hud.story).opacity; __lum.push([+g.time.toFixed(2), g.mode, +l.toFixed(3), +f.a.toFixed(2), po, so, g.seq.i ?? -1]); };
  })()`);
  const mark = async (label) => { const n = await ev('__lum.length'); console.log('--', label, 'frame', n); };
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 1`);
  await page.waitForTimeout(9000); for (let i = 0; i < 160 && (await ev("__game.mode")) !== "play"; i++) { await page.waitForTimeout(200); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await mark('opening done');
  await ev(`(() => { const g = __game; g.give('read-letter'); g.give('chapter1-complete'); g.player.hasDrop = true; const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(150, 1)); g.rig.snap(); g.boardRaft(); g.player.raftT = 0.97; })()`);
  await page.waitForTimeout(2500); await shot('edge-prompt');
  console.log('prompt', await ev(`document.querySelector('.prompt').textContent`), 'mode', await ev('__game.mode'));
  await mark('raft at edge');
  await ev(`__game.input.pressed.add('KeyR')`);
  for (let i = 0; i < 200 && (await ev('__game.mode')) === 'ride'; i++) await page.waitForTimeout(300);
  await page.waitForTimeout(2500); await mark('arrived'); await shot('arrived');
  console.log('after ride', await ev(`JSON.stringify({ mode: __game.mode, cur: __game.cur, toast: document.querySelector('.toast')?.textContent })`));
  await ev(`__game.openTab('worlds')`); await page.waitForTimeout(800); await shot('worlds-tab');
  await page.click('button[data-a="go"]');
  for (let i = 0; i < 60 && (await ev('__game.mode')) !== 'play'; i++) await page.waitForTimeout(300);
  await page.waitForTimeout(2000); await mark('flown back'); await shot('back-home');
  console.log('after flight', await ev(`JSON.stringify({ mode: __game.mode, cur: __game.cur })`));
  const L = await ev('__lum');
  let pops = 0, jumps = 0;
  for (let i = 1; i < L.length - 1; i++) {
    const [t, m, l] = L[i], a = L[i - 1][2], b = L[i + 1][2];
    if (l < Math.min(a, b) - 0.18) { pops++; if (pops < 15) console.log('POP', i, t, m, l, 'between', a, b, 'fade', L[i][3], 'panel', L[i][4], 'story', L[i][5], 'beat', L[i][6]); }
    if (a - l > 0.3) { jumps++; if (jumps < 15) console.log('DROP', i, t, m, a, '->', l, 'fade', L[i][3], 'panel', L[i][4], 'story', L[i][5], 'beat', L[i][6]); }
  }
  const mins = L.reduce((x, r) => Math.min(x, r[2]), 1);
  console.log('frames', L.length, 'pops', pops, 'drops', jumps, 'darkest', mins);
};
