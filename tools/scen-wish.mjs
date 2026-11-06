// Oscar's list: close looks at the fire spirit, the bunting, Hollo, the menu, Nilo's roll and the village.
// Pass ONLY=fire,hollo,... to take just some of them.
export default async ({ page, shot, ev }) => {
  const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
  const want = k => !only.length || only.includes(k);
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id);
    for (const a of ['spring','village','terraces','ridge','meadow','cliffs','bridge','edge']) g.flags.add('area:' + a);
    window.V3 = g.player.pos.constructor;
    // a camera at (lat, lon) h metres up, looking at (lat, lon) lh metres up
    window.__cam = (a, b, h, lh) => { const p = g.planets[0]; const A = p.surfacePoint(p.dirRiver(a[0], a[1])), B = p.surfacePoint(p.dirRiver(b[0], b[1]));
      const up = A.clone().sub(p.center).normalize(); g.cutCam = { pos: A.addScaledVector(up, h), look: B.addScaledVector(B.clone().sub(p.center).normalize(), lh), up }; };
    window.__at = (o, d, h, lh) => { const p = g.planets[0]; const up = o.position.clone().sub(p.center).normalize(); const side = new V3(1, 0, 0).projectOnPlane(up).normalize();
      g.cutCam = { pos: o.position.clone().addScaledVector(side, d).addScaledVector(up, h), look: o.position.clone().addScaledVector(up, lh), up }; };
    window.__place = (a, b) => { const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(a[0], a[1])); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(b[0], b[1])).sub(g.player.pos)); g.rig.snap(); g.mode = 'play'; };
  })()`);
  const snap = async (name, wait = 1800) => { await page.waitForTimeout(wait); await shot(name); };
  if (want('fire')) {
    await ev(`(() => { __place([57, -17.5], [60.2, -17.5]); __at(__game.ch1.R.fire, 2.4, 1.3, 0.6); })()`); await snap('fire', 6000);
    await ev(`(() => { __at(__game.ch1.R.fire, -2.0, 0.9, 0.7); })()`); await snap('fire-2', 6000);
  }
  if (want('flags')) { await ev(`(() => { __place([57, -17.5], [61, -18]); __cam([56.5, -19], [61, -18], 2.0, 3.2); })()`); await snap('flags'); await snap('flags-later', 700); }
  if (want('hollo')) {
    await ev(`(() => { __place([8, -14], [13.2, 0]); __cam([33, -12], [13.2, 0], 7, 5); })()`); await snap('hollo');
    await ev(`(() => { __cam([28, -10], [13.2, 0], 3.5, 3); })()`); await snap('hollo-face', 900);
    await ev(`(() => { __cam([2, -12], [13.2, 0], 7, 4); })()`); await snap('hollo-back', 900);
  }
  if (want('village')) {
    await ev(`(() => { __place([52, -15.8], [62.6, -12.6]); __cam([51, -14], [61, -18], 4, 2); })()`); await snap('village');
    await ev(`(() => { __cam([62.5, -21], [65.6, -9.4], 1.8, 2.4); })()`); await snap('house-tor', 900);
    await ev(`(() => { const g = __game, p = g.planets[0]; for (const [k, la, lo] of [[1, 37, -16], [2, 38.2, -15]]) { const gt = g.ch1.R.goats[k]; gt.home.copy(p.dirRiver(la, lo)); gt.dir.copy(gt.home); } __place([33, -19], [37, -16]); })()`); await page.waitForTimeout(1500);
    await ev(`(() => { const gt = __game.ch1.R.goats[1].obj; __at(gt, 2.4, 0.9, 0.55); })()`); await snap('goats', 1500);
    await ev(`(() => { const g = __game, gt = g.ch1.R.goats[1].obj; __at(gt, -2.6, 1.3, 0.5); })()`); await snap('goats-2', 2500);
  }
  await ev(`(() => { const g = __game; g.cutCam = null; g.rig.override = null; })()`);
  if (want('menu')) { await ev(`__game.openTab('goal')`); await snap('menu', 900); await ev(`__game.closeOverlay()`); }
  if (want('roll')) {
    await ev(`(() => { __place([36, -16], [44, -16]); const g = __game; g.cutCam = null; g.renderEvery = 1; })()`);
    await page.waitForTimeout(800);
    await ev(`(() => { const g = __game, inp = g.input; inp.down.add('KeyW'); inp.pressed.add('KeyW'); })()`);
    await page.waitForTimeout(600);
    for (let i = 0; i < 100 && !(await ev('__game.player.grounded && __game.mode === "play"')); i++) await page.waitForTimeout(100);
    console.log('mode', await ev('__game.mode'), await ev('__game.player.grounded'));
    await ev(`(() => { const g = __game, inp = g.input; inp.pressed.add('KeyC'); })()`);
    let seen = false;
    for (let i = 0; i < 60; i++) { if (await ev('__game.player.rollT > 0')) { seen = true; break; } await page.waitForTimeout(30); }
    console.log('roll started', seen, await ev('__game.player.grounded'), await ev(`(() => { const g = __game, pl = g.player, P = g.planet; return (pl.pos.distanceTo(P.center) - P.surfaceRadius(pl.up)).toFixed(2); })()`));
    // freeze time and pose the roll at three moments for the shots
    await ev(`(() => { const g = __game, pl = g.player; g.timeScale = 0.0001; g.input.down.delete('KeyW'); const side = new V3().crossVectors(pl.up, pl.facing).normalize(); g.cutCam = { pos: pl.pos.clone().addScaledVector(side, 3.0).addScaledVector(pl.up, 2.1), look: pl.pos.clone().addScaledVector(pl.up, 0.45), up: pl.up.clone() }; })()`);
    for (const k of [0.75, 0.5, 0.25]) { await ev(`(() => { const pl = __game.player; pl.rollT = ${k} * 0.55; for (let i = 0; i < 12; i++) pl.animate(0.02, 6, false); pl.rollT = ${k} * 0.55; pl.animate(0.0001, 6, false); })()`); await snap('roll-' + k, 400); }
    await ev(`(() => { const pl = __game.player; pl.rollT = 0; pl.flipT = 0.31; for (let i = 0; i < 12; i++) { pl.flipT = 0.31; pl.animate(0.02, 9, false); } })()`); await snap('flip-mid', 400);
    await ev(`(() => { const g = __game; g.timeScale = 1; g.cutCam = null; g.rig.override = null; })()`);
  }

};
