// World 3 (the Walking Town) in the real game: the review shots.
//   TOWNOUT=/dir [ONLY=village,head,...] node tools/play.mjs town
import { mkdirSync } from 'fs';
export default async ({ page, ev, key }) => {
  const dir = process.env.TOWNOUT ?? 'shots/town';
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  mkdirSync(dir, { recursive: true });
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const W = await ev(`__game.planets.findIndex(p => p.cfg.id === 'garden')`);
  await ev(`(() => { const g = __game, p = g.planets[${W}]; g.enterWorld(${W}, false); g.player.placeAt(p, g.arrivalDir(${W})); g.meet = null; g.cutCam = null; g.mode = "play"; g.hud.setFade(0, "#fff8ee", true); })()`);
  const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) { await page.waitForTimeout(300); await ev(`(() => { const g = __game; document.querySelectorAll('.notify, .toast').forEach(e => e.remove()); __game.hud.banner.classList.remove('on'); })()`); }
  };
  await settle(14);
  console.log('state', await ev(`(() => { const g = __game, t = g.townMove; return JSON.stringify({ active: t?.active, onAmble: t?.onAmble, grounded: g.player.grounded, mode: g.mode, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles }); })()`));
  // one whole frame's draw calls and triangles (shadow pass, scene and post passes together)
  const calls = async () => { await ev(`(() => { const i = __game.renderer.info; i.autoReset = false; i.reset(); window.__f0 = __game.frameN; })()`); await page.waitForFunction(() => __game.frameN > window.__f0 + 1, null, { timeout: 120000 }); const r = await ev(`(() => { const i = __game.renderer.info; const r = JSON.stringify({ calls: Math.round(i.render.calls / (__game.frameN - window.__f0)), tris: Math.round(i.render.triangles / (__game.frameN - window.__f0)) }); i.autoReset = true; return r; })()`); return r; };
  const snap = async (name) => { const f = `${dir}/${name}.png`; await page.screenshot({ path: f, timeout: 600000 }); console.log('shot', f, await calls()); };
  // run the game's own frames without drawing them (the test browser draws slowly), at a fixed step
  const sim = (sec) => ev(`(() => { const g = __game; g.fixedDt = 1 / 30; g.renderEvery = 1e9; for (let i = 0; i < ${Math.round(sec * 30)}; i++) g.frame(); g.renderEvery = 1; g.fixedDt = null; })()`);
  const want = (n) => !only || only.includes(n);
  // in Amble's own frame (rest space: +X left, +Z forward, y up from the ground)
  const A = `const g = __game, t = g.townMove, a = t.amble, R = a.root, P = g.planets[${W}]; R.updateMatrixWorld(true); const V = (x, y, z) => R.localToWorld(new P.center.constructor(x, y, z)); const up = R.localToWorld(new P.center.constructor(0, 1, 0)).sub(R.getWorldPosition(new P.center.constructor())).normalize();`;
  const over = (pos, look, fov) => ev(`(() => { ${A} g.rig.override = { pos: ${pos}, look: ${look}, up }; ${fov ? `g.camera.fov = ${fov}; g.camera.updateProjectionMatrix();` : ''} })()`);
  const free = () => ev(`(() => { const g = __game; g.rig.override = null; document.getElementById('shot-css')?.remove(); })()`);
  // (a set-up camera hides the walk-up prompts)
  const quiet = () => ev(`(() => { if (!document.getElementById('shot-css')) { const st = document.createElement('style'); st.id = 'shot-css'; st.textContent = '.prompt{display:none!important}'; document.head.append(st); } })()`);

  if (want('walkway')) {
    // Nilo on the walk, the free game camera behind him looking along it (picture 3); WTH picks the stretch
    for (const th of (process.env.WTH ?? '4.6').split(',').map(Number)) {
      await ev(`(() => { ${A} const ring = t.town.ring, i = Math.max(3, ring.ths.findIndex(x => x > ${th}));
        const at = t.world(ring.P(i, 0.45).add(new P.center.constructor(0, 0.05, 0)), new P.center.constructor()), ahead = t.world(ring.P(i - 2, 0.45), new P.center.constructor());
        const pl = g.player; pl.pos.copy(at); pl.up.copy(at).sub(P.center).normalize(); pl.vel.set(0, 0, 0); pl.grounded = true;
        pl.facing.copy(ahead).sub(at).projectOnPlane(pl.up).normalize(); pl.sync(); t.onAmble = true;
        g.rig.faceDir(pl.up, pl.facing); g.rig.smoothUp.copy(pl.up); g.rig.pitch = ${process.env.WPITCH ?? 0.28}; g.rig.snap(); })()`);
      await sim(0.6);
      await settle(5);
      await snap(`3-walkway${process.env.WTH ? '-' + th : ''}`);
    }
  }
  if (want('village')) {
    await quiet(); await over('V(-62, 8, 48)', 'V(-1, 17, 4)', 48); await settle(8);
    await snap('1-village-threeq');
    // the same frame with the other worlds (far off in the sky) hidden: World 3's own cost
    await ev(`(() => { const g = __game, pc = g.planets.map(p => p.center), w = new pc[0].constructor(); window.__hid = []; for (const c of g.scene.children) { if (!c.visible || c.isLight || c.isCamera) continue; c.getWorldPosition(w); let bi = -1, bd = 1e9; pc.forEach((q, i) => { const d = q.distanceTo(w); if (d < g.planets[i].R + 80 && d < bd) { bd = d; bi = i; } }); if (bi >= 0 && bi !== ${W}) { c.visible = false; window.__hid.push(c); } } })()`);
    console.log('world 3 alone', await calls());
    await ev(`window.__hid.forEach(c => c.visible = true)`);
    await free();
  }
  if (want('head')) {
    await quiet();
    // framed in the head's own frame (it turns and nods), from the front right, a little below the eye
    await ev(`(() => { ${A} const h = a.root.getObjectByName('head'); h.updateMatrixWorld(true); const V3 = P.center.constructor;
      g.rig.override = { pos: h.localToWorld(new V3(${process.env.HPOS ?? '-8.5, -0.3, 10'})), look: h.localToWorld(new V3(${process.env.HLOOK ?? '-0.5, 0.3, 2.6'})), up }; g.camera.fov = 40; g.camera.updateProjectionMatrix(); })()`);
    await settle(6);
    await snap('2-head-close');
    await free();
  }
  if (want('inside')) {
    // stand in Bramble Cottage, the game camera pulled in with him
    await ev(`(() => { ${A} const town = t.town, h = town.houses.find(x => x.walkIn && x.name === 'Bramble Cottage') ?? town.houses.find(x => x.walkIn);
      const loc = (lx, ly, lz) => { const c = Math.cos(h.rot), s = Math.sin(h.rot); return town.group.localToWorld(new P.center.constructor(h.at.x + lx * c + lz * s, h.at.y + ly, h.at.z - lx * s + lz * c)); };
      g.rig.override = { pos: loc(h.w / 2 - 0.55, 1.65, h.d / 2 - 0.55), look: loc(-h.w / 2 + 1.1, 0.75, -h.d / 2 + 0.7), up }; g.camera.fov = 72; g.camera.updateProjectionMatrix(); })()`);
    await settle(8);
    await snap('4-interior');
    await free();
  }
  if (want('climb')) {
    // to the foot of the front-right leg's rope, then up it
    await ev(`(() => { ${A} const L = t.lines.find(l => l.kind === 'rope') ?? t.lines[0]; const foot = t.world(L.curve.getPointAt(1), new P.center.constructor()).addScaledVector(t.dirWorld(L.out, new P.center.constructor()), 1.2);
      const d = foot.clone().sub(P.center).normalize(); g.player.placeAt(P, d); t.onAmble = false; t.climb = null; g.player.grounded = true; t.startClimb(L); })()`);
    await sim(0.8);

    await page.keyboard.down('KeyW'); await sim(2.5);
    await ev(`(() => { const g = __game; document.querySelectorAll('.notify, .toast').forEach(e => e.remove()); __game.hud.banner.classList.remove('on'); })()`);
    await page.keyboard.up('KeyW'); await sim(0.3);
    await settle(2);
    console.log('climb', await ev(`JSON.stringify({ phase: __game.townMove.climb?.phase, s: __game.townMove.climb?.s })`));
    await snap('5-climb-rope');
    // and on up to the top, over onto the walk
    await page.keyboard.down('KeyW'); await sim(12); await page.keyboard.up('KeyW');
    await sim(1.5); await settle(2);
    console.log('after climb', await ev(`JSON.stringify({ climb: !!__game.townMove.climb, onAmble: __game.townMove.onAmble, grounded: __game.player.grounded })`));
    await snap('5b-climb-top');
  }
  if (want('umbrella')) {
    // off the walk's outer edge on Amble's right side: a step out into the air, and the umbrella opens
    await ev(`(() => { ${A} t.dropOnShell(); const ring = t.town.ring, i = Math.max(1, ring.ths.findIndex(x => x > 3.25));
      const out = t.world(ring.P(i, 1.0), new P.center.constructor()), inn = t.world(ring.P(i, 0.0), new P.center.constructor());
      const dirOut = out.clone().sub(inn).projectOnPlane(g.player.up).normalize();
      g.player.pos.copy(out).addScaledVector(dirOut, 3.0); g.player.up.copy(g.player.pos).sub(P.center).normalize(); g.player.facing.copy(dirOut);
      g.player.vel.copy(dirOut).multiplyScalar(2.5).addScaledVector(g.player.up, -4); g.player.grounded = false; t.onAmble = false; g.player.sync(); })()`);
    await sim(1.2); await settle(2);
    await ev(`(() => { const g = __game; document.querySelectorAll('.notify, .toast').forEach(e => e.remove()); __game.hud.banner.classList.remove('on'); })()`);
    console.log('umbrella', await ev(`JSON.stringify({ open: __game.townMove.umbrella.open, k: __game.townMove.umbrella.k, vu: __game.player.vel.dot(__game.player.up) })`));
    await snap('6-umbrella-float');
    await sim(9); await settle(2);
    await snap('6b-umbrella-landed');
    console.log('landed', await ev(`JSON.stringify({ open: __game.townMove.umbrella.open, grounded: __game.player.grounded })`));
  }
};
