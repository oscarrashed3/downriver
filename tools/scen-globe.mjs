// Steps 6 and 7: the globe map and the compass strip.
// node tools/play.mjs globe   (dev server running; shots land in shots/globe-N-*.png)
// Globe: opens on Nilo, then four sides (N, E, S, W), a real click drops your pin, the buttons turn the globe.
// Compass: a task is set; Nilo turns on the spot (marker slides, behind-you arrow), walks (distance counts down),
// and arrives (the pin clears). Your own pin clears the same way.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.renderEvery = 1; g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = 'play';
    for (const a of ['spring','village','ridge','bridge']) g.flags.add('area:' + a);
    for (const n of ['ysolde','tor']) { g.flags.add('talked:' + n); g.flags.add('met:' + n); }
    const P = g.planet;
    // walked: down the river to the bridge, out to the village and the ridge
    for (let la = 10; la < 80; la += 3) g.map.reveal(P, la, 0, 24);
    for (const [la, lo] of [[60, -17], [56, -10], [52, 30], [50, 47], [48, 40]]) g.map.reveal(P, la, lo, 26);
    window.THREE = { Vector3: g.player.pos.constructor };
    window.__stand = (dir, look) => { const pl = g.player; pl.placeAt(P, dir.clone().normalize());
      const f = look.clone().sub(pl.pos).projectOnPlane(pl.up).normalize(); pl.facing.copy(f); g.rig.faceDir(pl.up, f); g.rig.pitch = 0.2; g.rig.snap(); };
    window.__turn = deg => { const pl = g.player, a = deg * Math.PI / 180; const f = pl.facing.clone().applyAxisAngle(pl.up, -a); pl.facing.copy(f); g.rig.faceDir(pl.up, f); g.rig.snap(); };
    // stand on the path below the spring, looking downriver
    __stand(P.dirRiver(30, -4), P.surfacePoint(P.dirRiver(40, -4)));
  })()`);
  const gwait = async sec => { const t0 = await ev('__game.time'); for (let i = 0; i < 3000 && (await ev('__game.time')) < t0 + sec; i++) await page.waitForTimeout(50); };
  await gwait(1.5);
  const report = [];
  // the ground model is built in an idle moment while you walk; give it a moment, as a real walk would
  for (let i = 0; i < 24 && !(await ev(`__game.map.models.has(__game.planet.cfg.id)`)); i++) await page.waitForTimeout(500);
  report.push('model built before opening: ' + (await ev(`__game.map.models.has(__game.planet.cfg.id)`)));

  // ---------------- the globe
  await key('KeyM'); await page.waitForTimeout(2500);
  report.push('globe open ms ' + (await ev('__game.map.openMs.toFixed(1)')) + ' (props ' + (await ev('__game.map.propsMs.toFixed(1)')) + ')' + ', per-frame draw ms ' + (await ev('__game.map.lastDrawMs.toFixed(2)')));
  await shot('globe-on-nilo');
  const side = async (label, lat, off) => { await ev(`(() => { const g = __game, P = g.planet; g.map.look(${lat}, P.lonAtLat(${lat}) + ${off}); })()`); await page.waitForTimeout(900); await shot(label); };
  await side('globe-north-spring', 8, 0);
  await side('globe-east', 70, 90);
  await side('globe-south-edge', 168, 0);
  await side('globe-west', 70, -90);
  // back to Nilo with the button, then a real click a little below him drops your pin
  await page.click('.gbtn[data-g="nilo"]'); await page.waitForTimeout(3000);
  const at = await ev(`(() => { const g = __game, P = g.planet; const d = P.dirRiver(46, 6); return g.map.screenOf(d); })()`);
  await page.mouse.click(at.x, at.y); await page.waitForTimeout(800);
  report.push('pin after click: ' + (await ev(`!!__game.map.customPin(__game.planet.cfg.id)`)));
  await shot('globe-pin-dropped');
  await page.click('.gbtn[data-g="task"]'); await page.waitForTimeout(3000);
  await shot('globe-turned-to-task');
  // dragging turns it
  const box = await page.locator('.globestage').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.65, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(800);
  await shot('globe-dragged');
  report.push('per-frame draw ms ' + (await ev('__game.map.lastDrawMs.toFixed(2)')));
  await key('KeyM'); await page.waitForTimeout(600);

  // ---------------- the compass
  const st = () => ev(`(() => { const s = __game.hud.compass.state; return 'heading ' + s.heading.toFixed(0) + ' task ' + s.taskRel.toFixed(0) + 'deg ' + s.taskDist.toFixed(0) + 'm behind ' + s.taskBehind + ' | pin ' + s.pinRel.toFixed(0) + 'deg ' + s.pinDist.toFixed(0) + 'm behind ' + s.pinBehind; })()`);
  // stand 30 m from the task, facing it
  report.push('mode ' + (await mode()) + ', step ' + (await ev(`(() => { const g = __game; return JSON.stringify([...g.flags].filter(f => f.startsWith('quest:') || f.startsWith('talked:'))) + ' target ' + !!g.ch1.guideTarget(); })()`)));
  await ev(`(() => { const g = __game, P = g.planet, t = g.ch1.guideTarget(); const td = t.clone().sub(P.center).normalize();
    const away = P.dirRiver(30, -4); const ang = 30 / P.R; const axis = new THREE.Vector3().crossVectors(td, away).normalize();
    const d = td.clone().applyAxisAngle(axis, ang); __stand(d, t); })()`);
  await gwait(1); report.push('facing task: ' + await st()); await shot('compass-facing-task');
  await ev('__turn(50)'); await gwait(0.6); report.push('turned 50: ' + await st()); await shot('compass-turned-50');
  await ev('__turn(80)'); await gwait(0.6); report.push('turned 130 (behind): ' + await st()); await shot('compass-task-behind');
  await ev('__turn(-130)'); await gwait(0.4);
  // walk toward it: the distance counts down
  const dists = [];
  for (let i = 0; i < 5; i++) {
    await ev(`(() => { const g = __game, P = g.planet, t = g.ch1.guideTarget(); const pl = g.player; const td = t.clone().sub(P.center).normalize();
      const ang = Math.acos(Math.min(1, td.dot(pl.up))); const step = Math.min(ang, 5 / P.R); const axis = new THREE.Vector3().crossVectors(pl.up, td).normalize();
      __stand(pl.up.clone().applyAxisAngle(axis, step), t); })()`);
    await gwait(0.4); dists.push(await ev('__game.hud.compass.state.taskDist.toFixed(1)'));
  }
  report.push('walking, distance: ' + dists.join(' > '));
  await shot('compass-walking');
  // arrive: within 4 m the gold marker fades
  await ev(`(() => { const g = __game, P = g.planet, t = g.ch1.guideTarget(); const pl = g.player; const td = t.clone().sub(P.center).normalize();
    const axis = new THREE.Vector3().crossVectors(td, pl.up).normalize(); __stand(td.clone().applyAxisAngle(axis, 3 / P.R), t); })()`);
  await gwait(1.2); report.push('arrived: taskGone ' + (await ev('__game.hud.compass.state.taskGone')) + ' marker on ' + (await ev(`document.querySelector('.cmark.task').classList.contains('on')`)));
  await shot('compass-arrived');
  // your pin: walk to it and it clears (drop it again first, in case the walk above already passed over it)
  await ev(`(() => { const g = __game, P = g.planet; if (!g.map.customPin(P.cfg.id)) g.map.setPin(P.cfg.id, P.dirRiver(46, 6)); })()`);
  report.push('pin before: ' + (await ev(`!!__game.map.customPin(__game.planet.cfg.id)`)) + ' ' + await st());
  await ev(`(() => { const g = __game, P = g.planet, pd = g.map.customPin(P.cfg.id); __stand(pd.clone().applyAxisAngle(new THREE.Vector3(1,0,0), 12 / P.R), P.surfacePoint(pd)); })()`);
  await gwait(0.8); await shot('compass-pin-ahead');
  await ev(`(() => { const g = __game, P = g.planet, pd = g.map.customPin(P.cfg.id); __stand(pd.clone().applyAxisAngle(new THREE.Vector3(1,0,0), 1.5 / P.R), P.surfacePoint(pd)); })()`);
  await gwait(1.5); report.push('pin after arriving: ' + (await ev(`!!__game.map.customPin(__game.planet.cfg.id)`)));
  // G hides it; talks hide it
  await key('KeyG'); await gwait(0.3); report.push('G hides: ' + !(await ev(`document.querySelector('.compass').classList.contains('on')`))); await key('KeyG');
  console.log(report.join('\n'));
};
