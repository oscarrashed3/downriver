// Step 7 done-check: talk to each of the five villagers face to face, sit on a bench, pick up the willow branch.
// Setup puts Nilo a few metres from each one; from there the test only presses keys (E, Space, 1).
export default async ({ page, shot, ev }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.renderEvery = 40; g.meet = null; g.cutCam = null; g.rig.override = null;
    for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id);
    for (const a of ['spring','village','terraces','ridge','meadow','cliffs','bridge','edge']) { g.flags.add('area:' + a); }
    window.THREE = { Vector3: g.player.pos.constructor };
    const inp = g.input;
    window.__hold = (k, on) => { if (on) { if (!inp.down.has(k)) inp.pressed.add(k); inp.down.add(k); } else inp.down.delete(k); };
    window.__tap = k => inp.pressed.add(k);
    window.__stand = (p, look) => { const pl = g.player, P = g.planet; pl.placeAt(P, p.clone().sub(P.center).normalize());
      const f = look.clone().sub(pl.pos).projectOnPlane(pl.up).normalize(); pl.facing.copy(f); g.rig.faceDir(pl.up, f); g.rig.pitch = 0.2; g.rig.snap(); g.mode = 'play'; };
  })()`);
  const gwait = async sec => { const t0 = await ev('__game.time'); for (let i = 0; i < 3000 && (await ev('__game.time')) < t0 + sec; i++) await page.waitForTimeout(50); };
  const until = async (js, max = 30) => { const t0 = await ev('__game.time'); while ((await ev('__game.time')) < t0 + max) { if (await ev(js)) return true; await page.waitForTimeout(50); } return false; };
  const look = async () => { await ev('__game.renderEvery = 1'); await page.waitForTimeout(700); };
  const back = () => ev('__game.renderEvery = 40');
  const report = [];

  for (const id of ['ysolde', 'tor', 'bram', 'nima', 'odo']) {
    const ok = await ev(`(() => { const g = __game, n = g.contents[0].npcs.find(x => x.id === '${id}'); if (!n || !n.root.visible) return false;
      // stand about 2.6 m away, off to one side of where they face, looking at them
      const side = new THREE.Vector3(1, 0, 0).projectOnPlane(n.up).normalize();
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(n.root.quaternion).projectOnPlane(n.up).normalize();
      __stand(n.root.position.clone().addScaledVector(fwd, 2.0).addScaledVector(side, 1.2), n.root.position); return n.root.position.distanceTo(g.player.pos).toFixed(1); })()`);
    if (!ok) { report.push(id + ': not in the world right now'); continue; }
    report.push(id + ' placed ' + ok + ' m away, visible ' + (await ev(`__game.contents[0].npcs.find(x => x.id === '${id}').root.visible`)));
    await gwait(0.4);
    const near = await ev('__game.nearest?.key ?? null');
    await ev(`__tap('KeyE')`);
    await until(`__game.mode !== 'play'`, 3);
    if (id === 'ysolde') { await gwait(0.35); await look(); await shot('ysolde-walking-up'); await back(); }
    const opened = await until(`__game.mode === 'talk' && __game.talkCam?.open`, 8);
    const gap = await ev(`(() => { const g = __game, n = g.convNpc; return n ? +g.player.pos.distanceTo(n.root.position).toFixed(2) : null; })()`);
    // hold Space to let the first line type out, then shoot the two-shot
    await ev(`__hold('Space', true)`);
    await until(`__game.shownChars > 18`, 6);
    await ev(`__hold('Space', false)`);
    await look(); await shot(`talk-${id}`); await back();
    // play the rest through; on a choice, shoot the reverse shot once, then pick the first card
    let reverse = false;
    for (let k = 0; k < 400 && (await mode()) === 'talk'; k++) {
      const cards = await ev(`!!__game.hud.dlg.querySelector('.card')`);
      if (cards && !reverse) { reverse = true; await gwait(0.6); await look(); await shot(`talk-${id}-nilo`); await back(); }
      if (cards) await ev(`__tap('Digit1')`); else await ev(`__hold('Space', true)`);
      await gwait(0.25);
    }
    await ev(`__hold('Space', false)`);
    report.push(`${id}: near=${near} dialogue opened=${opened} standing ${gap} m apart, back to ${await mode()}`);
    await gwait(0.5);
  }

  // A bench: walk to it, then sit
  const bench = await ev(`(() => { const g = __game, b = g.ch1.R.benches.find(b => g.contents[0].npcs.every(n => n.root.position.distanceTo(b.position) > 5) && g.contents[0].interactables.every(it => it.id.startsWith('bench') || it.pos.distanceTo(b.position) > 4.5)); if (!b) return false; const up = b.position.clone().sub(g.planet.center).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.quaternion).projectOnPlane(up).normalize(); const side = new THREE.Vector3().crossVectors(up, fwd);
    __stand(b.position.clone().addScaledVector(fwd, 1.6).addScaledVector(side, 1.3), b.position); return true; })()`);
  if (bench) {
    await gwait(0.3);
    const near = await ev('__game.nearest?.key ?? null');
    await ev(`__tap('KeyE')`); await until(`__game.mode === 'approach'`, 2); await gwait(0.25);
    await look(); await shot('bench-walking'); await back();
    await until(`!!__game.sitting`, 6); await gwait(1.0);
    await ev(`(() => { const g = __game; g.rig.yaw += 2.4; g.rig.snap(); })()`);
    await look(); await shot('bench-sitting'); await back();
    report.push(`bench: near=${near} sat=${await ev('!!__game.sitting')}`);
    await ev(`__hold('KeyW', true)`); await gwait(0.5); await ev(`__hold('KeyW', false)`);
  }

  // The willow branch: walk up, kneel, reach
  await ev(`(() => { const g = __game, s = g.ch1.R.spar; const up = s.position.clone().sub(g.planet.center).normalize();
    const away = new THREE.Vector3(1, 0, 0).projectOnPlane(up).normalize(); const vp = g.contents[0].interactables.find(it => it.id === 'vp-spring'); const awayVp = vp ? s.position.clone().sub(vp.pos).projectOnPlane(up).normalize() : away; __stand(s.position.clone().addScaledVector(awayVp, 1.7), s.position); })()`);
  await gwait(0.3);
  const near = await ev('__game.nearest?.key ?? null');
  await ev(`__tap('KeyE')`);
  await until(`__game.appr?.phase === 'kneel'`, 6); await gwait(0.15);
  // a side view for the screenshot only
  await ev(`(() => { const g = __game, pl = g.player; const side = new THREE.Vector3().crossVectors(pl.up, pl.facing).normalize();
    const P = g.planet, c = pl.pos.clone().addScaledVector(side, 2.6).addScaledVector(pl.up, 1.6).addScaledVector(pl.facing, -2.2); const n = c.clone().sub(P.center).normalize(); const r = Math.max(c.distanceTo(P.center), P.surfaceRadius(n) + 1.2);
    g.cutCam = { pos: n.multiplyScalar(r).add(P.center), look: pl.pos.clone().addScaledVector(pl.up, 0.5).addScaledVector(pl.facing, 0.4), up: pl.up.clone() }; })()`);
  await ev('__game.renderEvery = 1'); await page.waitForTimeout(250); await shot('pickup-kneel'); await ev('__game.cutCam = null; __game.rig.override = null'); await back();
  await gwait(1);
  report.push(`willow: near=${near} picked=${await ev(`__game.flags.has('item:spar')`)}`);
  console.log(report.join('\n'));
};
