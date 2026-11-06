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
    await ev(`(() => { __place([22, -4], [13.2, 0]); __cam([24, -5], [13.2, 0], 3.2, 2.4); })()`); await snap('hollo');
    await ev(`(() => { __cam([16, 9], [13.2, 0], 2.4, 2.4); })()`); await snap('hollo-side', 900);
  }
  if (want('village')) {
    await ev(`(() => { __place([52, -15.8], [62.6, -12.6]); __cam([51, -14], [61, -18], 4, 2); })()`); await snap('village');
    await ev(`(() => { __cam([62.5, -21], [65.6, -9.4], 1.8, 2.4); })()`); await snap('house-tor', 900);
    await ev(`(() => { __cam([70, -26], [66, -30], 2.2, 1); })()`); await snap('goats', 900);
  }
  await ev(`(() => { const g = __game; g.cutCam = null; g.rig.override = null; })()`);
  if (want('menu')) { await ev(`__game.openTab('goal')`); await snap('menu', 900); await ev(`__game.closeOverlay()`); }
  if (want('roll')) {
    await ev(`(() => { __place([40, 2], [50, 2]); const g = __game; g.cutCam = null; })()`);
    await page.waitForTimeout(800);
    await ev(`(() => { const g = __game, inp = g.input; inp.down.add('KeyW'); inp.pressed.add('KeyW'); })()`);
    await page.waitForTimeout(500);
    await ev(`(() => { const g = __game, inp = g.input; inp.pressed.add('ShiftLeft'); inp.pressed.add('KeyC'); })()`);
    for (let i = 0; i < 40 && !(await ev('__game.player.rollT > 0.15')); i++) await page.waitForTimeout(30);
    await ev(`(() => { const g = __game, pl = g.player; const side = new V3().crossVectors(pl.up, pl.facing).normalize(); g.cutCam = { pos: pl.pos.clone().addScaledVector(side, 4).addScaledVector(pl.up, 1.2), look: pl.pos.clone().addScaledVector(pl.up, 0.6), up: pl.up.clone() }; g.timeScale = 0.05; })()`);
    await snap('roll', 300);
    await ev(`(() => { const g = __game; g.timeScale = 1; g.cutCam = null; g.rig.override = null; g.input.down.delete('KeyW'); })()`);
  }
};
