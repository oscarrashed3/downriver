// Sky Isles phase 2: moving around (glide, dive, cloud pad, soft fall, windmill sail, landing).
//   VW=1600 VH=900 node tools/play.mjs sky-move      (SKYSHOTS=dir, ONLY=1,3 for some shots)
import { mkdirSync } from 'fs';

export default async ({ page, ev }) => {
  const dir = process.env.SKYSHOTS ?? '/home/user/sky-shots/phase2';
  mkdirSync(dir, { recursive: true });
  const snap = async (name) => { await ev(`document.querySelectorAll('.notify, .toast').forEach(e => e.remove())`); await page.screenshot({ path: `${dir}/${name}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}.png`); };
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]', { timeout: 600000 });
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game, p = g.planets[1]; g.enterWorld(1, false); g.player.placeAt(p, g.arrivalDir(1)); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; g.flags.add('form:glider'); g.hud.setFade(0, "#fff8ee", true); })()`);
  await ev(`(() => {
    const g = __game, p = g.planets[1], S = g.contents[1].refs.skyWorld;
    const V = p.center.constructor;
    window.__sky = {
      g, p, S, V,
      isle: id => S.isles.find(i => i.def.id === id),
      P(id, lat, off, h = 0) { const is = this.isle(id), d = is.dirOff(lat, off); return d.multiplyScalar(p.R + p.height(d) + h).add(p.center); },
      D(id, lat, off) { return this.isle(id).dirOff(lat, off); },
      cam(pos, look) { g.rig.override = { pos, look, up: pos.clone().sub(p.center).normalize() }; },
      free() { g.rig.override = null; },
      noon() { g.day.setLocal(g.player.up, 0.5); },
      hold(...k) { g.input.down.clear(); for (const c of k) g.input.down.add(c); },
      // put Nilo in the air at h metres above R over a direction, gliding toward another direction
      fly(d, h, toward, speed = 11) {
        const pl = g.player; pl.up.copy(d).normalize(); pl.pos.copy(pl.up).multiplyScalar(p.R + h).add(p.center);
        const head = toward.clone().sub(d).projectOnPlane(pl.up).normalize();
        pl.facing.copy(head); pl.grounded = false; pl.vel.copy(head).multiplyScalar(speed).addScaledVector(pl.up, -1);
        g.mode = 'play'; pl.glider = null; g.skyMove.takeOver(0.016);
        Object.assign(pl.glider, { open: true, speed, openT: 1, airT: 1 }); pl.glider.heading.copy(head);
        g.rig.faceDir(pl.up, head); g.rig.smoothUp.copy(pl.up); g.rig.snap();
      },
    };
  })()`);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.includes(String(n));
  // game time, not wall time: fixed 50 ms steps without drawing, then one drawn frame
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; })()`);
  const run = async (ms) => { const n = Math.max(1, Math.round(ms / 50)); await ev(`(() => { const g = __game; for (let i = 0; i < ${n}; i++) { g.renderEvery = i === ${n} - 1 ? 1 : 100000; __sky.noon(); g.frame(); } g.renderEvery = 1; })()`); };
  const state = () => ev(`(() => { const { g, p } = __sky, pl = g.player; return { h: +(pl.pos.distanceTo(p.center) - p.R).toFixed(1), open: !!pl.glider?.open, sp: +(pl.glider?.speed ?? 0).toFixed(1), grounded: pl.grounded, wing: g.skyMove.wingVis.state, rescue: g.skyMove.rescue?.phase ?? null, fps: Math.round(g.fps) }; })()`);

  // 1. gliding from Landing Isle toward Sailtown and the drifting islet (normal follow camera)
  if (want(1)) {
    await ev(`(() => { const s = __sky; s.fly(s.D('landing', 29, 6), 25, s.D('sailtown', 56, 4)); s.hold('Space'); s.g.rig.setDistance(6); s.g.rig.dist = 6; s.g.rig.pitch = 0.16; })()`);
    await run(2200);
    console.log('glide', JSON.stringify(await state()));
    await snap('1-glide');
  }
  // 2. close side view of the prone pose on the paper wing, in a dive (wind lines)
  if (want(2)) {
    await ev(`(() => { const s = __sky; s.fly(s.D('sailtown', 86, -10), 26, s.D('chime', 100, -2), 12); s.hold('Space', 'KeyC'); })()`);
    await run(800);
    await ev(`(() => { const s = __sky, pl = s.g.player; const side = pl.facing.clone().cross(pl.up).normalize();
      s.cam(pl.pos.clone().addScaledVector(side, -4.2).addScaledVector(pl.facing, 2.4).addScaledVector(pl.up, 1.6), pl.pos.clone().addScaledVector(pl.up, 0.4).addScaledVector(pl.facing, -0.6)); })()`);
    await run(50);
    console.log('dive', JSON.stringify(await state()));
    await snap('2-dive-close');
    await ev('__sky.free()');
  }
  // 3. a dive: wind lines, the wing pitched down
  if (want(3)) {
    await ev(`(() => { const s = __sky; s.fly(s.D('sailtown', 84, -6), 22, s.D('chime', 100, 0), 14); s.hold('Space', 'KeyC'); })()`);
    await run(1500);
    console.log('landing', JSON.stringify(await state()));
    await snap('3-landing-run');
  }
  // 4. a cloud pad: drop onto one between Landing Isle and the drifting islet
  if (want(4)) {
    await ev(`(() => { const s = __sky, g = s.g, pad = s.S.pads[1], pl = g.player; s.hold();
      const top = pad.root.position.clone().add(s.p.center); const up = pad.root.position.clone().normalize();
      pl.glider.open = false; pl.up.copy(up); pl.pos.copy(top).addScaledVector(up, pad.topY + 2.2); pl.vel.copy(up).multiplyScalar(-6); pl.grounded = false;
      g.rig.snap(); })()`);
    await run(350);
    await ev(`(() => { const s = __sky, pl = s.g.player, pad = s.S.pads[1]; const up = pad.root.position.clone().normalize(); const at = pad.root.position.clone().add(s.p.center);
      const t = up.clone().cross(new s.V(0,1,0)).normalize(); s.cam(at.clone().addScaledVector(t, 7).addScaledVector(up, 2.5), at.clone().addScaledVector(up, 1.2)); })()`);
    await run(100);
    console.log('pad', JSON.stringify(await state()));
    await snap('4-pad-bounce');
    await ev('__sky.free()');
  }
  // 5. the soft fall: into the cloud sea off Sailtown's edge, a cloud raft carries him back up
  if (want(5)) {
    await ev(`(() => { const s = __sky, g = s.g, pl = g.player; s.hold(); pl.placeAt(s.p, s.D('sailtown', 56, 8)); })()`);
    await run(900);
    await ev(`(() => { const s = __sky, g = s.g, pl = g.player; pl.glider.open = false; const d = s.D('sailtown', 60, 36); pl.up.copy(d); pl.pos.copy(d).multiplyScalar(s.p.R + 6).add(s.p.center); pl.vel.copy(d).multiplyScalar(-8); pl.grounded = false; })()`);
    for (let i = 0; i < 80 && (await ev('__game.skyMove.rescue?.phase ?? null')) !== 'rise'; i++) await run(250);
    await run(1500);
    await ev(`(() => { const s = __sky, pl = s.g.player; const R = s.g.skyMove.rescue; const side = R.face.clone().cross(pl.up).normalize();
      s.cam(pl.pos.clone().addScaledVector(side, 4.5).addScaledVector(R.face, -6.5).addScaledVector(pl.up, 2.2), pl.pos.clone().addScaledVector(pl.up, 0.3).addScaledVector(R.face, 2)); })()`);
    await run(50);
    console.log('rescue', JSON.stringify(await state()));
    await snap('5-cloud-raft');
    await ev('__sky.free()');
    for (let i = 0; i < 120 && (await ev('__game.skyMove.rescue?.phase ?? null')) !== null; i++) await run(250);
    console.log('rescued', JSON.stringify(await state()));
  }
  // 6. the windmill sail ride on Windmill Isle
  if (want(6)) {
    await ev(`(() => { const s = __sky, g = s.g, pl = g.player; s.hold(); if (pl.glider) pl.glider.open = false; const it = g.contents[1].interactables.find(i => i.id === 'skySail'); const d = it.pos.clone().sub(s.p.center).normalize(); pl.placeAt(s.p, d); g.rig.snap(); it.act(); })()`);
    for (let i = 0; i < 80 && (await ev("__game.skyMove.sail?.phase ?? 'none'")) !== 'ride'; i++) await run(200);
    await run(300);
    await ev(`(() => { const s = __sky, pl = s.g.player, m = s.S.dressing.refs.windmill; const mp = m.getWorldPosition(new s.V()); const up = mp.clone().sub(s.p.center).normalize();
      const out = pl.pos.clone().sub(mp).projectOnPlane(up).normalize(); const side = out.clone().cross(up);
      s.cam(pl.pos.clone().addScaledVector(out, 9).addScaledVector(side, 5).addScaledVector(up, -2), pl.pos.clone().addScaledVector(up, -1.5)); })()`);
    await run(50);
    console.log('sail', JSON.stringify(await state()));
    await snap('6-sail-ride');
    await ev('__sky.free()');
    for (let i = 0; i < 10; i++) { await run(500); console.log('after sail', JSON.stringify(await state()), await ev(`(() => { const s = __game.skyMove.sail; return s ? s.phase + ' ' + s.t.toFixed(2) + ' ' + s.peak.toFixed(1) : 'none'; })()`)); }
  }
};
