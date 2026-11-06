// Nilo's movement, shot side-on in slow motion: a strip of frames per move.
// ONLY=pose,walk,run,start,stop,skid,turn,slope,jump,land,roll picks moves; FRAMES and GAP (game seconds) set the strip.
// Make contact sheets afterwards with: python3 tools/sheet.py motion
export default async ({ page, shot, ev }) => {
  const only = (process.env.ONLY ?? 'pose,walk,run,start,stop,skid,turn,slope,jump,land,roll').split(',').filter(Boolean);
  const FR = Number(process.env.FRAMES ?? 8);
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id);
    for (const a of ['spring','village','terraces','ridge','meadow','cliffs','bridge','edge']) g.flags.add('area:' + a);
    window.V3 = g.player.pos.constructor; g.renderEvery = 1;
    const inp = g.input;
    window.__key = (k, on) => { if (on) { if (!inp.down.has(k)) inp.pressed.add(k); inp.down.add(k); } else inp.down.delete(k); };
    window.__clear = () => { for (const k of [...inp.down]) inp.down.delete(k); };
    // stand at (lat, lon) facing toward (lat2, lon2), camera behind so W walks that way
    g.grass.update = () => {}; g.grass.group.visible = false; // the tall grass hides the feet in these close shots
    // an open, flat spot on the meadow path, walking along it
    window.__place = (a, b) => { const p = g.planets[0]; const d = typeof a === 'number' ? p.pathPoint(a).clone().normalize() : p.dirRiver(a[0], a[1]); const d2 = typeof b === 'number' ? p.pathPoint(b).clone().normalize() : p.dirRiver(b[0], b[1]); g.player.placeAt(p, d); a = d; b = d2; const f = p.surfacePoint(b).sub(g.player.pos).projectOnPlane(g.player.up).normalize(); g.player.facing.copy(f); g.rig.faceDir(g.player.up, f); g.rig.snap(); g.mode = 'play'; g.cutCam = null; g.rig.override = null; };
    // find a flat, open run of meadow: no river, no houses or trees within reach, gentle ground for 14 m
    window.__findOpen = () => { const p = g.planets[0], S = p.solids;
      for (let la = 20; la < 150; la += 1.7) for (let lo = -90; lo < 90; lo += 1.7) {
        const a = p.dirRiver(la, lo), b = p.dirRiver(la + 10, lo);
        let ok = true;
        for (let k = 0; k <= 6 && ok; k++) { const d = a.clone().lerp(b, k / 6).normalize(); const w = p.surfacePoint(d);
          if (p.riverNearest(d).dist < 7 || p.slope(d) > 0.3) ok = false;
          else for (const s of S) if (s.obj.position.distanceTo(w) < 3.5) { ok = false; break; } }
        if (ok) return [[la, lo], [la + 10, lo]];
      } return null; };
    // a fixed side direction for the camera, taken once per move so the strip reads left to right
    window.__side = null;
    window.__sideCam = (d = 3.4, h = 0.75) => { const pl = g.player; if (!window.__side) window.__side = new V3().crossVectors(pl.up, pl.facing).normalize().negate();
      const s = window.__side.clone().projectOnPlane(pl.up).normalize();
      g.cutCam = { pos: pl.pos.clone().addScaledVector(s, d).addScaledVector(pl.up, h), look: pl.pos.clone().addScaledVector(pl.up, 0.62), up: pl.up.clone() }; };
  })()`);
  const gtime = () => ev('__game.time');
  const gwait = async sec => { const t0 = await gtime(); for (let i = 0; i < 4000 && (await gtime()) < t0 + sec; i++) await page.waitForTimeout(15); };
  const until = async (js, max = 10) => { const t0 = await gtime(); while ((await gtime()) < t0 + max) { if (await ev(js)) return true; await page.waitForTimeout(20); } return false; };
  // a strip: FR frames, `gap` game seconds apart, the camera kept side-on
  const strip = async (name, gap = 0.06, n = FR) => {
    for (let i = 0; i < n; i++) { await ev('__sideCam()'); await page.waitForTimeout(60); await shot(`${name}-${String(i).padStart(2, '0')}`); await ev('__sideCam()'); await gwait(gap); }
  };
  const begin = async (a, b, scale = 0.25) => { await ev(`(() => { __clear(); __game.timeScale = 1; __side = null; __place(${JSON.stringify(a)}, ${JSON.stringify(b)}); })()`); await gwait(0.4); await until('__game.player.grounded', 4); await gwait(0.5); await ev(`__game.timeScale = ${scale}`); };
  const end = () => ev(`(() => { __clear(); const g = __game; g.timeScale = 1; g.cutCam = null; g.rig.override = null; })()`);
  const open = await ev('__findOpen()'); const A = open[0], B = open[1]; console.log('open run at', JSON.stringify(open));
  const report = [];

  if (only.includes('pose')) {
    await begin(A, B, 0.0001); await gwait(0.0001);
    await ev(`(() => { const g = __game, pl = g.player; g.cutCam = { pos: pl.pos.clone().addScaledVector(pl.facing, 2.6).addScaledVector(pl.up, 0.8), look: pl.pos.clone().addScaledVector(pl.up, 0.7), up: pl.up.clone() }; })()`);
    await page.waitForTimeout(400); await shot('pose-front');
    await ev(`__sideCam(2.6, 0.8)`); await page.waitForTimeout(400); await shot('pose-side');
    await ev(`(() => { const g = __game, pl = g.player; g.cutCam = { pos: pl.pos.clone().addScaledVector(pl.facing, -2.6).addScaledVector(pl.up, 0.9), look: pl.pos.clone().addScaledVector(pl.up, 0.7), up: pl.up.clone() }; })()`);
    await page.waitForTimeout(400); await shot('pose-back');
    await end();
  }
  if (only.includes('walk')) {
    // a gentle walk: the speed the keys give is a jog, so cap it for this strip
    await begin(A, B); await ev(`(() => { __game.player.maxSpeed = 2.2; __key('KeyW', true); })()`); await gwait(0.8);
    await strip('walk', 0.07); await ev(`__game.player.maxSpeed = null`); await end();
  }
  if (only.includes('jog')) { await begin(A, B); await ev(`__key('KeyW', true)`); await gwait(0.8); await strip('jog', 0.05); await end(); }
  if (only.includes('run')) { await begin(A, B); await ev(`(() => { __key('KeyW', true); __key('ShiftLeft', true); })()`); await gwait(0.9); await strip('run', 0.04); await end(); }
  if (only.includes('start')) { await begin(A, B); await ev(`__key('KeyW', true)`); await strip('start', 0.05); await end(); }
  if (only.includes('stop')) { await begin(A, B); await ev(`__key('KeyW', true)`); await gwait(0.8); await ev(`__key('KeyW', false)`); await strip('stop', 0.08, FR + 2); await end(); }
  if (only.includes('skid')) {
    await begin(A, B); await ev(`(() => { __key('KeyW', true); __key('ShiftLeft', true); })()`); await gwait(0.9);
    await ev(`(() => { __key('KeyW', false); __key('KeyS', true); })()`); await strip('skid', 0.06, FR + 2); await end();
  }
  if (only.includes('turn')) {
    // standing still, turn round on the spot (tap the opposite way for a moment)
    await begin(A, B); await ev(`__key('KeyS', true)`); await gwait(0.06); await ev(`__key('KeyS', false)`); await strip('turn', 0.08); await end();
  }
  if (only.includes('slope')) {
    const ok = await ev(`(() => { const g = __game, p = g.planets[0]; let best = null;
      for (let la = 30; la < 110 && !best; la += 1.5) for (let lo = -40; lo < 40; lo += 1.5) { const d = p.dirRiver(la, lo); const s = p.slope(d); if (s > 0.38 && s < 0.6 && p.riverNearest(d).dist > 8) { best = [la, lo]; break; } }
      if (!best) return false; const d = p.dirRiver(best[0], best[1]);
      // face uphill
      g.player.placeAt(p, d); const dn = g.player.downhill(p); const f = dn.clone().negate(); g.player.facing.copy(f); g.rig.faceDir(g.player.up, f); g.rig.snap(); g.mode = 'play'; return best.join(','); })()`);
    report.push('slope at ' + ok);
    if (ok) { await ev(`(() => { __side = null; __clear(); __key('KeyW', true); __game.timeScale = 0.25; })()`); await gwait(0.5); await strip('slope', 0.06); }
    await end();
  }
  if (only.includes('jump')) { await begin(A, B); await ev(`__key('KeyW', true)`); await gwait(0.7); await ev(`__key('Space', true)`); await strip('jump', 0.07, FR + 4); await end(); }
  if (only.includes('land')) {
    await begin(A, B); await ev(`(() => { const pl = __game.player; pl.pos.addScaledVector(pl.up, 4.5); pl.vel.set(0, 0, 0); pl.grounded = false; pl.sync(); })()`);
    await until('__game.player.pos.distanceTo(__game.planet.center) - __game.planet.surfaceRadius(__game.player.up) < 1.2', 6);
    await strip('land', 0.06, FR + 2); await end();
  }
  if (only.includes('roll')) { await begin(A, B); await ev(`__key('KeyW', true)`); await gwait(0.7); await ev(`__key('KeyC', true)`); await strip('roll', 0.06, FR + 2); await end(); }
  if (only.includes('diag')) {
    await begin(A, B, 1); await ev(`(() => { __game.player.motion.debug = true; __key('KeyW', true); })()`); await gwait(0.8);
    const r = await ev(`new Promise(res => { const g = __game, m = g.player.motion, out = []; let n = 0;
      const tick = () => { out.push(JSON.stringify(m.dbg) + ' v=' + g.player.vel.length().toFixed(1) + ' ph=' + m.phase.toFixed(2)); if (++n < 25) requestAnimationFrame(tick); else res(out.join('\\n')); }; tick(); })`);
    console.log(r); await end();
  }
  if (only.includes('slide')) {
    // measure how far a planted foot slides while it carries weight, at three speeds
    for (const [name, keys, cap] of [['walk', ['KeyW'], 2.2], ['jog', ['KeyW'], null], ['run', ['KeyW', 'ShiftLeft'], null]]) {
      await begin(A, B, 1); await ev(`(() => { __game.player.maxSpeed = ${cap}; ${keys.map(k => `__key('${k}', true);`).join('')} })()`); await gwait(0.8);
      const r = await ev(`new Promise(res => { const g = __game, m = g.player.motion; if (!m) return res('no motion'); let worst = 0, n = 0; const last = [null, null], seq = [-1, -1]; const air0 = m.airFrames; const log = []; m.debug = true; let plants = 0;
        const tick = () => { for (let i = 0; i < 2; i++) { const f = m.feet[i]; if (f.seq !== seq[i]) { last[i] = null; seq[i] = f.seq; plants++; } if (f.planted) { const w = g.player.person.ankles[i].getWorldPosition(new V3()); if (last[i]) { const dd = w.distanceTo(last[i]); worst = Math.max(worst, dd); if (dd > 0.02 && log.length < 12) log.push(['f'+n, 'leg'+i, (dd*100).toFixed(1)+'cm', 'gr='+g.player.grounded, 'airT='+m.airT.toFixed(2), 'ph='+m.phase.toFixed(2), 'rel='+f.released, 'D='+(m.dbg[i]&&m.dbg[i].D), 'v='+g.player.vel.length().toFixed(1)].join(' ')); } last[i] = w; } else last[i] = null; } if (++n < 90) requestAnimationFrame(tick); else res(worst + ' air ' + (m.airFrames - air0) + ' plants ' + plants + ' | ' + log.join(' | ')); }; tick(); })`);
      report.push(`${name}: worst planted-ankle drift per frame ${r}`);
      await ev(`__game.player.maxSpeed = null`); await end();
    }
  }
  console.log(report.join('\n'));
};
