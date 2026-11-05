// Step 6 done-check: walls stop Nilo, every door answers, and the bridge carries you up and over.
// Setup moves Nilo to a start point near each thing; from there the test only presses keys (W, E).
export default async ({ page, shot, ev }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.renderEvery = 40; g.meet = null; g.cutCam = null; g.rig.override = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); window.THREE = { Vector3: g.player.pos.constructor };
    const inp = g.input;
    window.__hold = (k, on) => { if (on) { if (!inp.down.has(k)) inp.pressed.add(k); inp.down.add(k); } else inp.down.delete(k); };
    window.__tap = k => inp.pressed.add(k);
    // stand at a point (world position) and look along dir
    window.__stand = (p, look) => { const pl = g.player, P = g.planet; const d = p.clone().sub(P.center).normalize(); pl.placeAt(P, d);
      const f = look.clone().projectOnPlane(pl.up).normalize(); pl.facing.copy(f); g.rig.faceDir(pl.up, f); g.rig.pitch = 0.12; g.rig.snap(); g.mode = 'play'; };
  })()`);
  // waits count game seconds: the test browser draws slowly, so wall time would mean nothing
  const gwait = async sec => { const t0 = await ev('__game.time'); for (let i = 0; i < 2000 && (await ev('__game.time')) < t0 + sec; i++) await page.waitForTimeout(60); };
  const walk = async (ms, run = false) => { await ev(`__hold('KeyW', true); __hold('ShiftLeft', ${run})`); await gwait(ms / 1000); await ev(`__hold('KeyW', false); __hold('ShiftLeft', false)`); };
  const look = async () => { await ev('__game.renderEvery = 1'); await page.waitForTimeout(600); };
  const back = () => ev('__game.renderEvery = 40');
  const report = [];

  // ---- 1. bridge: probe the deck against the banks, then walk over it
  const probe = await ev(`(() => { const g = __game, P = g.planet, d = P.decks[0], br = d.obj;
    const up = br.position.clone().sub(P.center).normalize(), ax = new THREE.Vector3(1,0,0).applyQuaternion(br.quaternion).projectOnPlane(up).normalize();
    const out = [];
    for (let x = -7; x <= 7; x += 1) { const q = br.position.clone().addScaledVector(ax, x); const n = q.clone().sub(P.center).normalize();
      const ground = P.surfaceRadius(n) - br.position.distanceTo(P.center) * n.dot(up); out.push(x + ':' + (Math.abs(x) <= 5 ? d.top(x).toFixed(2) : '-') + '/' + ground.toFixed(2)); }
    return out.join(' '); })()`).catch(e => 'probe failed ' + e.message);
  console.log('bridge deck/ground by x:', probe);
  await ev(`(() => { const g = __game, P = g.planet, br = P.decks[0].obj;
    const up = br.position.clone().sub(P.center).normalize(), ax = new THREE.Vector3(1,0,0).applyQuaternion(br.quaternion).projectOnPlane(up).normalize();
    window.__brAx = ax; __stand(br.position.clone().addScaledVector(ax, -8.5), ax);
    window.__track = { maxH: -9, onDeck: 0, side: 0 };
    window.__trk = setInterval(() => { const pl = g.player; const v = pl.pos.clone().sub(br.position); const h = v.dot(up); const T = window.__track;
      if (h > T.maxH) T.maxH = h; if (pl.onDeck) T.onDeck++; const s = Math.abs(v.dot(new THREE.Vector3(0,0,1).applyQuaternion(br.quaternion).projectOnPlane(up).normalize())); if (pl.onDeck && s > T.side) T.side = s; }, 30);
  })()`);
  await gwait(0.4); await look(); await shot('bridge-approach'); await back();
  await walk(1500);
  await ev(`(() => { const g = __game; g.rig.pitch = 0.05; })()`);
  // stop at the top and look back along the deck
  for (let i = 0; i < 40; i++) { const x = await ev(`__game.player.pos.clone().sub(__game.planet.decks[0].obj.position).dot(__brAx)`); if (x > -0.6) break; await walk(120); }
  await ev(`(() => { const g = __game, pl = g.player; g.rig.faceDir(pl.up, __brAx.clone().negate().add(new THREE.Vector3(0,0,0))); g.rig.yaw += 2.2; g.rig.pitch = 0.25; g.rig.snap(); })()`).catch(() => {});
  await gwait(0.4); await look(); await shot('bridge-top'); await back();
  const top = await ev(`(() => { const g = __game, br = g.planet.decks[0].obj; return { onDeck: g.player.onDeck, h: +g.player.pos.clone().sub(br.position).dot(br.position.clone().sub(g.planet.center).normalize()).toFixed(2) }; })()`);
  report.push('bridge top: ' + JSON.stringify(top));
  // try to walk off the side: hold D (strafe) for a second
  await ev(`(() => { const g = __game; g.rig.faceDir(g.player.up, __brAx); g.rig.snap(); __hold('KeyD', true); })()`); await gwait(1.2); await ev(`__hold('KeyD', false)`);
  await walk(2500);
  report.push('bridge crossing: ' + JSON.stringify(await ev(`(() => { clearInterval(__trk); const g = __game, br = g.planet.decks[0].obj; return { ...__track, endX: +g.player.pos.clone().sub(br.position).dot(__brAx).toFixed(1) }; })()`)));

  // ---- 2. walls: run straight at Tor's house side wall from 6 m away
  await ev(`(() => { const g = __game, h = g.ch1.R.houses.tor; const side = new THREE.Vector3(1,0,0).applyQuaternion(h.quaternion);
    __stand(h.position.clone().addScaledVector(side, 7.5).add(new THREE.Vector3(0,0,0)), side.clone().negate()); })()`);
  await walk(2200, true);
  report.push('wall: ' + JSON.stringify(await ev(`(() => { const g = __game, h = g.ch1.R.houses.tor; const v = g.player.pos.clone().sub(h.position); const side = new THREE.Vector3(1,0,0).applyQuaternion(h.quaternion); return { fromCenter: +v.dot(side).toFixed(2), halfWidth: 2.1 }; })()`)));
  await ev(`(() => { const g = __game; g.rig.yaw += 0.9; g.rig.pitch = 0.2; g.rig.snap(); })()`);
  await gwait(0.4); await look(); await shot('stopped-at-wall'); await back();
  // windmill and Hollo too
  for (const [name, expr, r] of [['windmill', "g.planet.solids.find(s => s.id === 'windmill').obj", 1.45], ['hollo', 'g.ch1.hollo.root', 2.6 * 1.45]]) {
    const res = await ev(`(() => { const g = __game, o = ${expr}; if (!o) return 'missing'; const up = o.position.clone().sub(g.planet.center).normalize(); const f = new THREE.Vector3(0,0,1).projectOnPlane(up).normalize();
      __stand(o.position.clone().addScaledVector(f, 9), f.clone().negate()); return 'ok'; })()`);
    if (res !== 'ok') { report.push(name + ': ' + res); continue; }
    await walk(2000, true);
    report.push(name + ': ' + JSON.stringify(await ev(`(() => { const g = __game, o = ${expr}; const up = o.position.clone().sub(g.planet.center).normalize(); return { dist: +g.player.pos.clone().sub(o.position).projectOnPlane(up).length().toFixed(2), radius: ${r} }; })()`)));
    if (name === 'hollo') { await ev(`(() => { const g = __game; g.rig.yaw += 0.8; g.rig.pitch = 0.1; g.rig.snap(); })()`); await gwait(0.4); await look(); await shot('stopped-at-hollo'); await back(); }
  }

  // ---- 3. every door: walk up, press E
  for (const who of ['tor', 'ysolde', 'nima', 'bram', 'empty', 'odo']) {
    await ev(`(() => { const g = __game, h = '${who}' === 'odo' ? g.ch1.R.boathouse : g.ch1.R.houses['${who}'];
      const door = h.localToWorld(h.userData.doorAt.clone()); const out = new THREE.Vector3(0,0,1).applyQuaternion(h.quaternion);
      __stand(door.clone().addScaledVector(out, 4), out.clone().negate()); })()`);
    await walk(900);
    const near = await ev(`__game.nearest?.key ?? null`);
    await ev(`__tap('KeyE')`); await gwait(0.15);
    const m = await mode();
    if (m === 'inside') {
      for (let i = 0; i < 200 && (await ev('__game.room?.phase')) !== 'stay'; i++) await page.waitForTimeout(100);
      await gwait(0.4); await look(); await shot('inside-' + who);
      await gwait(0.7); await ev(`__tap('KeyE')`);
      for (let i = 0; i < 200 && (await mode()) !== 'play'; i++) await page.waitForTimeout(100);
      report.push(`door ${who}: near=${near} went inside, back to ${await mode()}`);
    } else {
      const note = await ev(`__game.hud.toast.textContent`);
      report.push(`door ${who}: near=${near} mode=${m} note="${note}"`);
      if (who === 'bram') { await gwait(0.4); await look(); await shot('locked-bram'); }
    }
  }
  console.log(report.join('\n'));
};
