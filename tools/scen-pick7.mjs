// The willow pickup alone (from scen-step7), for the kneel screenshot.
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
