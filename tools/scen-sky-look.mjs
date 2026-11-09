// The Sky Isles look-book: real-game shots of World 2 at 1600x900, to set next to Oscar's pictures, and one fixed
// shot of World 1 (to compare before and after any Sky Isles work).
//   VW=1600 VH=900 node tools/play.mjs sky-look
// Shots go to SKYSHOTS (default /home/user/sky-shots/phase1/round-1). ONLY=w1 takes only the World 1 shot
// (name it with W1NAME, e.g. world1-before).
import { mkdirSync } from 'fs';

export default async ({ page, ev }) => {
  const dir = process.env.SKYSHOTS ?? '/home/user/sky-shots/phase1/round-1';
  mkdirSync(dir, { recursive: true });
  const snap = async (name) => { await page.screenshot({ path: `${dir}/${name}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}.png`); };

  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`document.querySelectorAll('.notify, .toast').forEach(e => e.remove())`);

  // ---- World 1: a fixed high look down the valley from above the spring, at a fixed time of day
  const w1 = async () => {
    await ev(`(() => { const g = __game, p = g.planets[0]; g.enterWorld(0, false); g.player.placeAt(p, g.arrivalDir(0)); g.meet = null; g.cutCam = null; g.mode = "play";
      const a = p.dirRiver(16, 0), look = p.surfacePoint(p.dirRiver(30, 0)), up = a.clone();
      const pos = p.center.clone().addScaledVector(a, p.R + 34).addScaledVector(p.dirRiver(-14, 0).sub(a).normalize(), 26);
      g.rig.override = { pos, look, up }; })()`);
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(300); await ev(`(() => { const g = __game; g.day.setLocal(g.player.up, 0.5); })()`); }
    await snap(process.env.W1NAME ?? '8-world1');
  };
  if (process.env.ONLY === 'w1') { await w1(); return; }

  // ---- into World 2, standing where you arrive
  await ev(`(() => { const g = __game, p = g.planets[1]; g.enterWorld(1, false); g.player.placeAt(p, g.arrivalDir(1)); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; })()`);
  // page helpers: S = the sky world; P(id, lat, off, h) = a world point h metres over that island's ground there
  await ev(`(() => {
    const g = __game, p = g.planets[1], S = g.contents[1].refs.skyWorld;
    const V = p.center.constructor;
    window.__sky = {
      g, p, S,
      isle: id => S.isles.find(i => i.def.id === id),
      P(id, lat, off, h = 0) { const is = this.isle(id), d = is.dirOff(lat, off); return d.multiplyScalar(p.R + p.height(d) + h).add(p.center); },
      W(o) { return o.getWorldPosition(new V()); },
      cam(pos, look) { g.rig.override = { pos, look, up: pos.clone().sub(p.center).normalize() }; },
      noon() { g.day.setLocal(g.player.up, 0.5); },
    };
  })()`);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.includes(String(n));
  const settle = async (ms = 3500) => { for (let t = 0; t < ms; t += 350) { await page.waitForTimeout(350); await ev('__sky.noon()'); } };
  const info = await ev(`(() => { const { g, p, S } = __sky; return { active: S.isActive, isles: S.isles.length, decks: p.decks.length, solids: p.solids.length, npcs: g.contents[1].npcs.length }; })()`);
  console.log('sky', JSON.stringify(info));

  // 1. Arrival on Landing Isle, looking downriver toward the islands (picture 1)
  if (want(1)) {
    await ev(`(() => { const { g, p } = __sky; g.player.facing.copy(p.surfacePoint(p.dirRiver(40, 0)).sub(g.player.pos).projectOnPlane(g.player.up).normalize()); g.rig.faceDir(g.player.up, g.player.facing); g.rig.snap(); })()`);
    await settle(4500);
    await snap('1-arrival');
    await ev(`(() => { const s = __sky; s.cam(s.P('landing', 15, -6, 4.5), s.P('sailtown', 50, 0, 4)); })()`);
    await settle();
    await snap('1b-arrival-wide');
  }

  // 2. A Sailtown lane, close (picture 2)
  if (want(2)) {
    await ev(`(() => { const s = __sky, R = s.S.dressing.refs; const c = s.W(R.cottage), q = s.W(R.sailSquare); const up = q.clone().sub(s.p.center).normalize();
      const eye = q.clone().addScaledVector(up, 2.0).addScaledVector(q.clone().sub(c).projectOnPlane(up).normalize(), 3.5);
      s.cam(eye, c.clone().addScaledVector(up, 1.6)); })()`);
    await settle();
    await snap('2-sailtown-lane');
    await ev(`(() => { const s = __sky, R = s.S.dressing.refs; const st = s.W(R.stall ?? R.cottage), b = s.W(R.footbridge ?? R.cottage); const up = b.clone().sub(s.p.center).normalize();
      s.cam(st.clone().addScaledVector(up, 3.2).addScaledVector(st.clone().sub(b).projectOnPlane(up).normalize(), 6), b.clone().addScaledVector(up, 1)); })()`);
    await settle();
    await snap('2b-sailtown-stream');
  }

  // 3. High over the islands: falls, aqueducts and the cloud sea
  if (want(3)) {
    await ev(`(() => { const s = __sky, p = s.p; const a = p.dirRiver(4, -34); const pos = a.clone().multiplyScalar(p.R + 74).add(p.center);
      s.cam(pos, s.P('sailtown', 70, 0, 0)); })()`);
    await settle();
    await snap('3-high-view');
  }

  // 4. An island's underside, from below and beside Sailtown
  if (want(4)) {
    await ev(`(() => { const s = __sky, p = s.p, is = s.isle('sailtown'); const top = p.R + is.def.top;
      const side = is.e2.clone(); const pos = is.up.clone().multiplyScalar(top - 14).add(p.center).addScaledVector(side, is.maxR + 45);
      s.cam(pos, is.up.clone().multiplyScalar(top - 12).add(p.center)); })()`);
    await settle();
    await snap('4-underside');
  }

  // 5. The Chime Garden: its ring chimes on their poles, the workshop beyond
  if (want(5)) {
    await ev(`(() => { const s = __sky; s.cam(s.P('chime', 90, 3, 4.2), s.P('chime', 107, -7, 3)); })()`);
    await settle();
    await snap('5-chime-garden');
  }

  // 6. Whale's Rest, at the edge, a whale out in the cloud
  if (want(6)) {
    await ev(`(() => { const s = __sky, p = s.p; const eye = s.P('whales', 166, 12, 2.4), up = eye.clone().sub(p.center).normalize();
      let best = null, bd = Infinity; for (const w of s.S.whales) { const q = s.W(w.whale.root); const k = q.distanceTo(eye); if (k < bd) { bd = k; best = q; } }
      const out = s.P('whales', 166, 40, 0).sub(eye).projectOnPlane(up).normalize();
      s.cam(eye, best && best.clone().sub(eye).normalize().dot(out) > 0.2 ? best : eye.clone().addScaledVector(out, 40).addScaledVector(up, -12)); })()`);
    await settle();
    await snap('6-whales-rest');
    await ev(`(() => { const s = __sky, e = s.g.contents[1].refs.edge; const a = s.W(e), up = a.clone().sub(s.p.center).normalize();
      s.cam(a.clone().addScaledVector(up, 3).add(s.p.dirRiver(168, 0).multiplyScalar(s.p.R).add(s.p.center).sub(a).projectOnPlane(up).normalize().multiplyScalar(9)), a.clone().addScaledVector(up, 1.5)); })()`);
    await settle();
    await snap('6b-edge');
  }

  // 7. The far castle ruin over the cloud sea, from the island that faces it best
  if (want(7)) {
    await ev(`(() => { const s = __sky, p = s.p, sea = s.S.sea; if (!sea?.castle) return; const c = s.W(sea.castle); const cd = c.clone().sub(p.center).normalize();
      let best = null, bd = -2; for (const is of s.S.isles) { const k = is.up.dot(cd); if (k > bd) { bd = k; best = is; } }
      const pos = best.up.clone().multiplyScalar(p.R + best.def.top + 4).add(p.center);
      s.cam(pos, c); })()`);
    await settle();
    await snap('7-far-castle');
  }

  await ev(`__sky.g.rig.override = null`);
  if (want(8)) await w1();
  await ev(`__game.rig.override = null`);
};
