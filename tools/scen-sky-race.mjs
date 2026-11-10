// Sky Isles phases 5-7: the qualifier, the race (lose, then win), the finish, the goodbye and the whale ride.
//   VW=1600 VH=900 node tools/play.mjs sky-race   (STEP=qual,lose,win,goodbye; SKYSHOTS=dir)
import { mkdirSync } from 'fs';
export default async ({ page, ev }) => {
  const dir = process.env.SKYSHOTS ?? '/home/user/sky-shots/phase5';
  mkdirSync(dir, { recursive: true });
  const snap = async (name) => { await ev(`document.querySelectorAll('.notify, .toast').forEach(e => e.remove())`); await page.screenshot({ path: `${dir}/${name}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}.png`); };
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game, p = g.planets[1]; g.saveOff = true; for (const f of ['sky:arrived', 'sky:quest-kite', 'letter:2', 'map:sky', 'form:glider', 'power:glide', 'sky:part-frame', 'sky:part-cloth', 'sky:part-string', 'sky:parts-all', 'sky:kite-built', 'fox-joined']) g.flags.add(f); for (const n of g.contents[1].npcs) g.flags.add('met:' + n.id); g.enterWorld(1, false); g.player.placeAt(p, g.arrivalDir(1)); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; })()`);
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; window.__noon = () => { if (g.mode !== 'cut') g.day.setLocal(g.player.up, 0.5); };
    window.__go = (ll) => { const c = g.ch2, p = g.planets[1]; g.player.placeAt(p, c.dir(ll)); g.rig.smoothUp.copy(g.player.up); g.rig.snap(); };
    window.__it = (id) => g.contents[1].interactables.find(i => i.id === id);
    // autopilot: steer at the next ring, and hold the ring's height (a test of the flow, not of flying)
    window.__pilot = null;
    window.__fly = (via) => { window.__pilot = () => { const R = g.ch2.race, pl = g.player; if (!R.mode || !pl.glider || !pl.glider.open || g.mode !== 'play') return;
      const c = R.course, i = R.passed.findIndex((x, k) => !x && !R.notes.includes(k)); if (i < 0) return; const gt = c.gates[i];
      let tgt = gt.center.clone().addScaledVector(gt.normal, 1.5);
      if (via && via.length && pl.pos.distanceTo(via[0]) < 4) via.shift();
      if (via && via.length && R.passed[via[0].after]) tgt = via[0].clone();
      const up = pl.up; const h = tgt.clone().sub(pl.pos).projectOnPlane(up).normalize(); pl.glider.heading.lerp(h, 0.25).projectOnPlane(up).normalize();
      const dh = tgt.distanceTo(g.planets[1].center) - pl.pos.distanceTo(g.planets[1].center); pl.pos.addScaledVector(up, Math.max(-0.25, Math.min(0.25, dh * 0.12)));
      g.input.down.add('Space'); }; }; })()`);
  const run = async (ms, draw = true) => { const n = Math.max(1, Math.round(ms / 50)); await ev(`(() => { const g = __game; for (let i = 0; i < ${n}; i++) { g.renderEvery = i === ${n} - 1 && ${draw} ? 1 : 100000; __noon(); window.__pilot?.(); g.frame(); } g.renderEvery = 1; })()`); };
  const beat = () => ev('__game.seq.running ? __game.seq.i : -1');
  const toBeat = async (b, extra = 0) => { for (let i = 0; i < 400 && (await beat()) < b && (await beat()) !== -1; i++) await run(100, false); if (extra) await run(extra); };
  const endCut = async () => { for (let i = 0; i < 200 && (await beat()) !== -1; i++) { await ev(`__game.input.pressed.add('Space')`); await run(300, false); } };
  const state = () => ev(`JSON.stringify({ mode: __game.mode, world: __game.cur, goal: __game.worldTask(), meter: __game.ch2.meter(), race: __game.ch2.race.mode, prog: Math.round(__game.ch2.race.progress), len: Math.round(__game.ch2.race.course?.length ?? 0), passed: __game.ch2.race.passed.map(Number).join(''), flags: [...__game.flags].filter(f => f.startsWith('sky:') || f.startsWith('chapter2')).slice(-6) })`);
  const steps = (process.env.STEP ?? 'qual,lose,win,goodbye').split(',');

  if (steps.includes('dbg')) {
    await ev(`(() => { __game.flags.add('sky:zephy-showed'); __go([96, 4]); __it('skyQualStart').act(); })()`);
    await ev('__fly([])');
    for (let k = 0; k < 3; k++) {
      await run(600);
      console.log(await ev(`(() => { const g = __game, pl = g.player, c = g.camera.position, o = g.rig.override; const P = v => v ? [v.x, v.y, v.z].map(x => x.toFixed(1)).join(',') : 'null';
        return JSON.stringify({ cam: P(c), pl: P(pl.pos), ov: o && P(o.pos), look: o && P(o.look), up: o && P(o.up), head: P(pl.glider?.heading), open: pl.glider?.open, mode: g.mode, fade: document.querySelector('.fade')?.style.opacity, rp: g.renderer.getPixelRatio() }); })()`));
    }
    await snap('dbg');
    await ev('__game.player.glider.boost = 12'); await run(300); console.log(await ev('document.querySelector(".speedlines").className + " " + getComputedStyle(document.querySelector(".speedlines")).backgroundImage.slice(0,80)')); await snap('dbg2');
  }
  if (steps.includes('qual')) {
    await ev(`(() => { __go([96, 4]); __it('skyQualStart').act(); })()`);
    await toBeat(1, 3000);
    await snap('1-zephy-showoff');
    await endCut();
    await ev('__fly([])');
    await run(2500);
    await snap('2-qualifier');
    if (process.env.DBG) {
      await ev(`(() => { const g = __game, R = g.renderer; window.__scan = () => { g.composer.render(); const rt = g.bloom.renderTargetBright, w = rt.width, h = rt.height, buf = new Uint16Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
          let n = 0, x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) if ((buf[i * 4 + c] & 0x7C00) === 0x7C00) { n++; const x = (i % w) / w, y = Math.floor(i / w) / h; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); break; } return { n, box: [x0, y0, x1, y1].map(v => +v.toFixed(3)) }; }; })()`);
      console.log('NAN0', await ev('JSON.stringify(__scan())'));
      const nm = await ev(`(() => { const set = new Set(); __game.scene.traverseVisible(o => { if (o.material) for (const m of [].concat(o.material)) set.add(m); }); window.__mats = [...set]; return __mats.length; })()`);
      console.log('mats', nm);
      for (let k = 0; k < nm; k += 8) console.log('m', k, await ev(`(() => { const ms = __mats.slice(${k}, ${k} + 8); ms.forEach(m => m.visible = false); const r = __scan(); ms.forEach(m => m.visible = true);
        if (r.n) return r.n; const out = []; for (const m of ms) { m.visible = false; const q = __scan(); m.visible = true; if (!q.n) { let who = ''; __game.scene.traverse(o => { if (!who && o.material && [].concat(o.material).includes(m)) { let a = [], z = o; while (z && a.length < 5) { a.push(z.name || z.type); z = z.parent; } who = a.join('<'); } }); out.push(m.type + ':' + (m.name || '') + ' ' + who); } } return 'FOUND ' + JSON.stringify(out); })()`));
      return; }

    console.log(await ev(`(() => { const g = __game, pl = g.player, c = g.camera.position, o = g.rig.override; const P = v => v ? [v.x, v.y, v.z].map(x => x.toFixed(1)).join(',') : 'null';
      return JSON.stringify({ cam: P(c), pl: P(pl.pos), ov: o && P(o.pos), head: P(pl.glider?.heading), open: pl.glider?.open, mode: g.mode, fade: g.hud.fadeEl?.style?.opacity, z: P(g.ch2.npc('zephy').person.root.getWorldPosition(c.clone())) }); })()`));
    for (let i = 0; i < 40 && (await ev('__game.ch2.race.mode')); i++) await run(500, false);
    console.log('qual end', await state());
    await endCut();
    await ev('window.__pilot = null; __game.input.down.clear()');
    console.log('qual', await state());
  }
  if (steps.includes('lose')) {
    await ev(`(() => { const g = __game; g.flags.add('sky:ribbon'); __go([66, 10]); __it('skyRaceStart').act(); })()`);
    await toBeat(1, 1500);
    await snap('3-race-start');
    await endCut();
    await ev('__fly([])');
    await run(4000);
    await snap('4-race-chase');
    for (let i = 0; i < 80 && (await ev('__game.ch2.race.mode')); i++) await run(500, false);
    console.log('race end', await state());
    await ev('window.__pilot = null; __game.input.down.clear()');
    await toBeat(1, 1500);
    await snap('5-lost-granwren');
    await endCut();
  }
  if (steps.includes('win')) {
    await ev(`(() => { const g = __game; g.flags.add('sky:ribbon'); __go([66, 10]); __it('skyRaceStart').act(); })()`);
    await endCut();
    await ev(`(() => { const R = __game.ch2.race; __fly([Object.assign(R.fallsAt.clone(), { after: 4 })]); })()`);
    for (let i = 0; i < 80 && (await ev('__game.ch2.race.mode')); i++) { await run(500, false); await ev(`(() => { const R = __game.ch2.race; if (R.progress > R.course.length * 0.85) R.gust = true; })()`); }
    console.log('win end', await state());
    await ev('window.__pilot = null; __game.input.down.clear()');
    await toBeat(0, 2500);
    await snap('6-finish-chimes');
    await endCut();
    console.log('won', await state());
  }
  if (steps.includes('goodbye')) {
    await ev(`(() => { const g = __game; g.flags.add('sky:ribbon'); g.flags.add('sky:won'); __go([170, 21]); })()`);
    for (let i = 0; i < 40 && (await ev('__game.mode')) !== 'cut'; i++) await run(200, false);
    await toBeat(2, 4500);
    await snap('7-whale-rises');
    await toBeat(8, 1500);
    await snap('8-lark-scarf');
    await toBeat(12, 2500);
    await snap('9-whale-dive');
    await endCut();
    await run(1500);
    await snap('10-world3');
    console.log('after', await state());
  }
};
