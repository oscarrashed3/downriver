// The map drawn from the real world: World 1 at the start, after a walk through a few areas, then another world.
// URL=http://localhost:5183/downriver/ node tools/play.mjs realmap   (shots land in shots/realmap-N-*.png)
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]', { noWaitAfter: true, timeout: 120000 });
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.renderEvery = 1; g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = 'play'; g.map.driftMs = 4000; })()`);
  const gwait = async sec => { const t0 = await ev('__game.time'); for (let i = 0; i < 3000 && (await ev('__game.time')) < t0 + sec; i++) await page.waitForTimeout(50); };
  await gwait(1.5);
  const report = [];
  // the model is built in idle moments while you walk; give it a moment, as a real walk would
  const warm = `(() => { const m = __game.map.models.get(__game.planet.cfg.id); return !!m && m.clouds.length === 2 && !!m.parts; })()`;
  for (let i = 0; i < 60 && !(await ev(warm)); i++) await page.waitForTimeout(500);
  report.push('model warmed before opening: ' + (await ev(warm)));
  // nothing of the model may stand outside the globe: the highest prop vertex, in ground-heights above the planet
  const reach = `(() => { const m = __game.map.models.get(__game.planet.cfg.id), R = __game.planet.R; let top = 0;
    for (const c of m.props.children) { const a = c.geometry.attributes.position; for (let i = 0; i < a.count; i++) top = Math.max(top, Math.hypot(a.getX(i), a.getY(i), a.getZ(i))); }
    let g = 0; const t = m.terrain.geometry.attributes.position; for (let i = 0; i < t.count; i++) g = Math.max(g, Math.hypot(t.getX(i), t.getY(i), t.getZ(i)));
    return 'highest prop ' + (top - R).toFixed(1) + ' m above R, highest ground ' + (g - R).toFixed(1) + ' m'; })()`;
  const open = async (label, wait = 2500) => {
    await ev(`__game.openTab('map')`); await page.waitForTimeout(wait);
    report.push(label + ': ' + (await ev(reach)));
    report.push(label + ': open ms ' + (await ev('(__game.map.openMs ?? __game.map.paintMs ?? 0).toFixed(1) + " (model " + (__game.map.modelMs ?? 0).toFixed(1) + ", props " + (__game.map.propsMs ?? 0).toFixed(1) + ")"')) + ', draw ms ' + (await ev('__game.map.lastDrawMs.toFixed(1)')));
    await shot(label);
  };
  const close = async () => { await ev(`__game.closeOverlay()`); await page.waitForTimeout(400); };

  // ---- World 1 at the start: only the spring has been seen
  await open('w1-start');
  await close();

  // ---- after a walk: down the river to the village, the ridge and the bridge
  await ev(`(() => { const g = __game, P = g.planet;
    for (const a of ['spring','village','ridge','bridge']) g.flags.add('area:' + a);
    for (const n of ['ysolde','tor']) { g.flags.add('talked:' + n); g.flags.add('met:' + n); }
    for (let la = 10; la < 80; la += 3) g.map.reveal(P, la, 0, 24);
    for (const [la, lo] of [[60, -17], [56, -10], [52, 30], [50, 47], [48, 40]]) g.map.reveal(P, la, lo, 26);
    const d = P.dirRiver(56, -9); g.player.placeAt(P, d);
    g.map.setPin(P.cfg.id, P.dirRiver(46, 30));
  })()`);
  await gwait(1);
  await open('w1-walked');
  const side = async (label, lat, off, zoom) => { await ev(`(() => { const g = __game, P = g.planet; g.map.look(${lat}, P.lonAtLat(${lat}) + ${off}${zoom ? ', ' + zoom : ''}); })()`); await page.waitForTimeout(1500); await shot(label); };
  if (!process.env.SHORT) {
  await side('w1-north', 20, 0);
  await side('w1-south', 150, 0);
  await side('w1-east', 80, 90);
  }
  await side('w1-zoom-village', 56, -5, 2.4);
  // a drag turns it
  const box = await page.locator('.globestage').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.6, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(1200);
  await shot('w1-dragged');
  await close();

  // ---- another world
  for (const w of (process.env.WORLDS ?? '1').split(',').map(Number)) {
    await ev(`(() => { const g = __game; g.enterWorld(${w}, false); g.player.placeAt(g.planets[${w}], g.arrivalDir(${w})); g.mode = 'play';
      const P = g.planet; for (let la = 10; la < 60; la += 3) g.map.reveal(P, la, 0, 22); })()`);
    await gwait(1);
    await open('world' + w);
    await side('world' + w + '-wide', 70, 30, 99);
    await close();
  }
  console.log(report.join('\n'));
};
