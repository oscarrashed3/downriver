// Shots for the fix list: ONLY=rocks,people,lineup,globe,compass
export default async ({ page, shot, ev }) => {
  const only = (process.env.ONLY ?? 'rocks,people,lineup,globe,compass').split(',');
  await page.click('button[data-a="new"]');
  if (only.includes('wake')) {
    // skip the storm panels, then watch the first seconds of waking up
    for (let i = 0; i < 120; i++) { const po = await ev(`+getComputedStyle(__game.hud.panel).opacity`); const story = await ev(`document.querySelector('.story')?.classList.contains('on') ?? false`); if (po < 0.05 && !story && (await ev('__game.time')) > 3) break; await ev(`__game.input.pressed.add('Space')`); await page.waitForTimeout(250); }
    for (let k = 0; k < 4; k++) { await page.waitForTimeout(900); await shot('wake-' + k); }
  }
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); window.V3 = g.player.pos.constructor; })()`);
  const cam = (js) => ev(`(() => { const g = __game; g.mode = 'play'; ${js} })()`);
  if (only.includes('rocks')) {
    for (const [k, t, far] of [[0, 0.47, 0], [1, 0.6, 0], [2, 0.7, 1]]) {
      await cam(`const p = g.planets[0], R = g.contents[0].refs.riverRocks; const r = R.reduce((a, b) => Math.abs(b.t - ${t}) < Math.abs(a.t - ${t}) ? b : a);
        const o = r.obj.position.clone(), up = o.clone().sub(p.center).normalize(); const side = new V3().crossVectors(up, new V3(0.3, 0.2, 0.9)).normalize();
        g.player.placeAt(p, p.dirRiver(150, 30)); g.cutCam = { pos: o.clone().addScaledVector(side, ${far ? 14 : 4.5}).addScaledVector(up, ${far ? 5 : 1.6}), look: o.clone().addScaledVector(up, 0.3), up };`);
      await page.waitForTimeout(1500); await shot('rocks-' + k);
    }
    await ev(`__game.cutCam = null`);
  }
  if (only.includes('people')) {
    for (const id of ['ysolde', 'odo', 'bram', 'tor', 'nima']) {
      await cam(`const p = g.planets[0], n = g.contents[0].npcs.find(n => n.id === '${id}'); const o = n.root.position.clone(), up = o.clone().sub(p.center).normalize();
        const f = new V3(0, 0, 1).applyQuaternion(n.root.quaternion).projectOnPlane(up).normalize(); const side = new V3().crossVectors(up, f).normalize();
        g.player.placeAt(p, o.clone().sub(p.center).normalize().applyAxisAngle(side, 0.02)); g.cutCam = { pos: o.clone().addScaledVector(side, 4.2).addScaledVector(f, 1.2).addScaledVector(up, 1.4), look: o.clone().addScaledVector(up, 0.8), up };`);
      console.log(id, await ev(`(() => { const g = __game, p = g.planets[0], n = g.contents[0].npcs.find(n => n.id === '${id}'); const d = n.root.position.clone().sub(p.center).normalize(); const w = n.root.position;
        let near = 99; for (const s of p.solids) { const r = s.shape.kind === 'circle' ? s.shape.r : Math.hypot(s.shape.hw, s.shape.hd); near = Math.min(near, s.obj.position.distanceTo(w) - r); }
        return 'river ' + (p.riverNearest(d).dist - p.cfg.riverWidth * 1.6).toFixed(1) + ' m past the widest water, nearest solid edge ' + near.toFixed(1) + ' m, bridge ' + g.contents[0].refs.bridge.position.distanceTo(w).toFixed(1) + ' m'; })()`));
      await page.waitForTimeout(1500); await shot('people-' + id);
    }
    await ev(`__game.cutCam = null`);
  }
  if (only.includes('lineup')) {
    // everyone side by side on an open meadow, beside Nilo
    await cam(`const p = g.planets[0]; let base = null;
      for (let la = 25; la < 150 && !base; la += 1.7) for (let lo = -90; lo < 90 && !base; lo += 1.7) { const a = p.dirRiver(la, lo); let ok = p.riverNearest(a).dist > 9 && p.slope(a) < 0.25;
        const w = p.surfacePoint(a); for (const s of p.solids) if (s.obj.position.distanceTo(w) < 12) { ok = false; break; } if (ok) base = a; } g.player.placeAt(p, base); const up = g.player.up.clone();
      const f = new V3(0, 1, 0).projectOnPlane(up).normalize(), side = new V3().crossVectors(up, f).normalize();
      const ids = ['ysolde', 'odo', 'bram', 'tor', 'nima']; window.__lineup = true;
      ids.forEach((id, i) => { const n = g.contents[0].npcs.find(n => n.id === id); const w = g.player.pos.clone().addScaledVector(side, (i + 1) * 1.3); const d = w.sub(p.center).normalize();
        n.place(p.surfacePoint(d, -0.05), d, f.clone()); n.lookAt = null; n.pose = {}; });
      g.grass.update = () => {}; g.grass.group.visible = false; g.day.setLocal(up, 0.55, false);
      g.player.facing.copy(f); g.rig.faceDir(up, f); g.rig.snap();
      const mid = g.player.pos.clone().addScaledVector(side, 3.6);
      g.cutCam = { pos: mid.clone().addScaledVector(f, 7.5).addScaledVector(up, 1.6), look: mid.clone().addScaledVector(up, 0.85), up };`.replace('new THREE_M()', 'new (g.camera.matrix.constructor)()'));
    await page.waitForTimeout(2000); await shot('lineup');
    await ev(`__game.cutCam = null`);
  }
  if (only.includes('lanterns')) {
    await ev(`(() => { const g = __game; g.give('quest:hollo'); g.give('kite-flown'); g.give('talked:tor'); g.give('talked:odo'); })()`);
    // stand by the stones and listen to each
    await cam(`const L = g.ch1.lanterns, p = g.planets[0], st = L.stones[0]; const d = st.position.clone().sub(p.center).normalize(); g.player.placeAt(p, d.clone().applyAxisAngle(new V3(0,1,0).cross(d).normalize(), 3 / p.R)); g.rig.snap();`);
    for (let i = 0; i < 4; i++) await ev(`__game.ch1.lanterns.touchStone(${i})`);
    await page.waitForTimeout(500);
    await cam(`const p = g.planets[0], h = g.contents[0].refs.hollo.root.position, up = h.clone().sub(p.center).normalize(); const L = g.ch1.lanterns; const c = L.stones.reduce((a, s) => a.add(s.position), new V3()).multiplyScalar(0.25);
      const away = c.clone().sub(h).projectOnPlane(up).normalize(); g.cutCam = { pos: c.clone().addScaledVector(away, 9).addScaledVector(up, 4.5), look: h.clone().lerp(c, 0.5).addScaledVector(up, 1), up };`);
    await page.waitForTimeout(1500); await shot('stones-humming');
    for (const i of [0, 2, 1, 3]) { await ev(`__game.ch1.lanterns.humT = -1; __game.ch1.lanterns.touchStone(${i})`); }
    await page.waitForTimeout(1500); await shot('stones-done');
    console.log('stones-done', await ev(`__game.flags.has('stones-done')`), 'goal', await ev(`document.querySelector('.goal .gt').textContent`));
    await ev(`__game.cutCam = null`);
    // Odo's Fold scene
    await cam(`const p = g.planets[0], o = g.contents[0].npcs.find(n => n.id === 'odo'); const d = o.root.position.clone().sub(p.center).normalize(); g.player.placeAt(p, d.clone().applyAxisAngle(new V3(1,0,0).cross(d).normalize(), 2.2 / p.R)); g.rig.snap();`);
    // the talk itself is covered by tests/return-lines.test.ts; here, give what Odo gives and watch Fold change
    await page.waitForTimeout(1500); await ev(`(() => { const g = __game; g.closeTalk?.(); g.mode = 'play'; g.give('quest:ember'); g.give('power:lantern'); g.ch1.lanterns.foldScene(); })()`);
    await page.waitForTimeout(1200); await shot('odo-fold-1');
    for (let k = 0; k < 30 && (await ev('__game.mode')) !== 'play'; k++) { await ev(`__game.input.pressed.add('Space')`); await page.waitForTimeout(400); }
    console.log('quest:ember', await ev(`__game.flags.has('quest:ember')`), 'goal', await ev(`document.querySelector('.goal .gt').textContent`));
    // light it and carry it
    await cam(`const p = g.planets[0], f = g.contents[0].refs.fire.position; const d = f.clone().sub(p.center).normalize(); g.player.placeAt(p, d.clone().applyAxisAngle(new V3(0,0,1).cross(d).normalize(), 2.5 / p.R)); g.rig.snap(); g.ch1.lanterns.lightEmber();`);
    await page.waitForTimeout(1200);
    await cam(`const pl = g.player; const side = new V3().crossVectors(pl.up, pl.facing).normalize(); g.cutCam = { pos: pl.pos.clone().addScaledVector(pl.facing, 2.2).addScaledVector(side, -1.2).addScaledVector(pl.up, 1.3), look: pl.pos.clone().addScaledVector(pl.up, 0.9), up: pl.up.clone() };`);
    await page.waitForTimeout(1200); await shot('ember-carry');
    console.log('meter', await ev(`document.querySelector('.goal .gl').textContent`));
    await ev(`__game.cutCam = null`);
    await cam(`const p = g.planets[0], f = g.contents[0].refs.holloFire.position; const d = f.clone().sub(p.center).normalize(); g.player.placeAt(p, d.clone().applyAxisAngle(new V3(0,0,1).cross(d).normalize(), 2.5 / p.R)); g.rig.faceDir(g.player.up, f.clone().sub(g.player.pos)); g.rig.snap(); g.ch1.lanterns.deliver();`);
    await page.waitForTimeout(4000); await shot('ember-delivered');
    console.log('fire', await ev(`__game.contents[0].refs.holloFire.visible`), 'night', await ev(`__game.flags.has('quest:night')`), 'lit', await ev(`__game.ch1.lanterns.meter() || document.querySelector('.goal .gl').textContent`));
  }
  if (only.includes('globe')) {
    await ev(`__game.openTab('map')`); await page.waitForTimeout(1500); await shot('globe-0');
    for (let k = 1; k < 4; k++) { await ev(`__game.map.spin?.(Math.PI / 2)`); await page.waitForTimeout(900); await shot('globe-' + k); }
    await ev(`__game.map.dropPinAtScreen?.(0.62, 0.42)`); await page.waitForTimeout(800); await shot('globe-pin');
    await ev(`__game.closeOverlay()`);
  }
  if (only.includes('compass')) {
    for (let k = 0; k < 4; k++) {
      await ev(`(() => { const g = __game, pl = g.player; pl.facing.applyAxisAngle(pl.up, Math.PI / 2); g.rig.faceDir(pl.up, pl.facing); g.rig.snap(); })()`);
      await page.waitForTimeout(1200); await shot('compass-' + k);
    }
  }
};
