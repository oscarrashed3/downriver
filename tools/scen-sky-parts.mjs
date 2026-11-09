// Sky Isles phase 4: the kite parts (sail ride + Fold's wing, laundry, the sour chime), the fox, the kite built.
//   VW=1600 VH=900 node tools/play.mjs sky-parts   (STEP=sail|laundry|chime|fox|build|people, comma separated)
import { mkdirSync } from 'fs';
export default async ({ page, ev }) => {
  const dir = process.env.SKYSHOTS ?? '/home/user/sky-shots/phase4';
  mkdirSync(dir, { recursive: true });
  const snap = async (name) => { await ev(`document.querySelectorAll('.notify, .toast').forEach(e => e.remove())`); await page.screenshot({ path: `${dir}/${name}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}.png`); };
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game, p = g.planets[1]; g.saveOff = true; for (const f of ['sky:arrived', 'sky:quest-kite', 'letter:2', 'map:sky']) g.flags.add(f); for (const n of g.contents[1].npcs) g.flags.add('met:' + n.id); g.enterWorld(1, false); g.player.placeAt(p, g.arrivalDir(1)); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; })()`);
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; window.__noon = () => g.day.setLocal(g.player.up, 0.5);
    window.__go = (ll) => { const c = g.ch2, p = g.planets[1]; if (g.skyMove.rescue) g.skyMove.endRescue(); g.player.glider && (g.player.glider.open = false); g.player.placeAt(p, c.dir(ll)); g.rig.smoothUp.copy(g.player.up); g.rig.snap(); };
    window.__it = (id) => g.contents[1].interactables.find(i => i.id === id); })()`);
  const run = async (ms, draw = true) => { const n = Math.max(1, Math.round(ms / 50)); await ev(`(() => { const g = __game; for (let i = 0; i < ${n}; i++) { g.renderEvery = i === ${n} - 1 && ${draw} ? 1 : 100000; __noon(); g.frame(); } g.renderEvery = 1; })()`); };
  const beat = () => ev('__game.seq.running ? __game.seq.i : -1');
  const toBeat = async (b, extra = 0) => { for (let i = 0; i < 400 && (await beat()) < b && (await beat()) !== -1; i++) await run(100, false); if (extra) await run(extra); };
  const endCut = async () => { for (let i = 0; i < 200 && (await beat()) !== -1; i++) { await ev(`__game.input.pressed.add('Space')`); await run(300, false); } };
  const state = () => ev(`JSON.stringify({ mode: __game.mode, goal: __game.worldTask(), meter: __game.ch2.meter(), flags: [...__game.flags].filter(f => f.startsWith('sky:') || f.startsWith('form') || f === 'fox-joined') })`);
  const steps = (process.env.STEP ?? 'sail,laundry,chime,fox,build,people').split(',');

  if (steps.includes('sail')) {
    await ev(`(() => { const g = __game, it = __it('skySail'); const p = g.planets[1]; g.player.placeAt(p, it.pos.clone().sub(p.center).normalize()); g.rig.snap(); it.act(); })()`);
    for (let i = 0; i < 120 && (await ev('__game.mode')) !== 'cut'; i++) await run(200, false);
    await toBeat(1, 2500);
    await snap('1-fold-wing');
    await endCut();
    await run(1500);
    await snap('2-first-glide');
    console.log('sail', await state());
  }
  if (steps.includes('laundry')) {
    await ev(`(() => { __game.flags.add('sky:quest-cloth'); __go([100, 22]); })()`);
    await run(800);
    await ev(`(() => { const g = __game, c = g.ch2, L = c.parts.laundry; const up = L[0].up; const at = L[0].base.clone();
      g.rig.override = { pos: at.clone().addScaledVector(up, 4).addScaledVector(L[0].t1, -9).addScaledVector(L[0].t2, 9), look: at.clone().addScaledVector(up, 1.5), up }; })()`);
    await run(600);
    await snap('3-laundry');
    await ev('__game.rig.override = null');
    for (let k = 0; k < 3; k++) { await ev(`(() => { const g = __game, l = g.ch2.parts.laundry[${k}], pl = g.player; pl.grounded = false; pl.vel.set(0, 0, 0); pl.pos.copy(l.obj.position).addScaledVector(pl.up, -0.9); })()`); await run(50); }
    await run(1000);
    await ev(`(() => { const g = __game; g.flags.add('sky:part-cloth'); g.ch2.afterTalk('mender'); })()`);
    console.log('laundry', await state());
  }
  if (steps.includes('chime')) {
    await ev(`(() => { const g = __game; g.flags.add('sky:quest-string'); const it = __it('skyChime'), p = g.planets[1]; g.player.placeAt(p, it.pos.clone().sub(p.center).normalize()); })()`);
    await ev(`(() => { const g = __game, it = __it('skyChime'), p = g.planets[1]; const up = it.pos.clone().sub(p.center).normalize(); const side = g.player.facing.clone().projectOnPlane(up).normalize(); g.player.pos.addScaledVector(side, 1.8);
      g.rig.override = { pos: it.pos.clone().addScaledVector(side, 5).addScaledVector(up, 2.2).addScaledVector(new p.center.constructor().crossVectors(up, side), 2), look: it.pos.clone().addScaledVector(up, 1.6), up }; })()`);
    await run(100, false); console.log('chime prompt', await ev('__game.interactPrompt()?.label'));
    for (let k = 0; k < 2; k++) { await ev(`__it('skyChime').act()`); await run(400); }
    await snap('4-sour-chime');
    for (let k = 0; k < 2; k++) { await ev(`__it('skyChime').act()`); await run(400); }
    await ev('__game.rig.override = null');
    await ev(`(() => { const g = __game; g.flags.add('sky:part-string'); g.ch2.afterTalk('chimer'); g.flags.add('sky:part-frame'); g.ch2.parts.partNote(); })()`);
    console.log('chime', await state());
  }
  if (steps.includes('fox')) {
    await ev(`__go([27, 9])`);
    for (let i = 0; i < 40 && (await ev('__game.mode')) !== 'cut'; i++) await run(200, false);
    await toBeat(0, 1800);
    await snap('5-fox-lark');
    await endCut();
    await ev(`(() => { const g = __game; __go([33.6, 16]); __it('fox').act(); })()`);
    await ev(`__go([28, 6])`); await run(2500);
    console.log('fox', await state(), await ev(`__game.fox.f.root.position.distanceTo(__game.player.pos).toFixed(1)`));
  }
  if (steps.includes('build')) {
    await ev(`(() => { const g = __game; for (const f of ['sky:part-frame', 'sky:part-cloth', 'sky:part-string', 'sky:parts-all']) g.flags.add(f); __go([55, 6]); g.ch2.afterTalk('lark'); })()`);
    await toBeat(4, 1500);
    await snap('6-kite-build');
    await endCut();
    console.log('build', await state());
  }
  if (steps.includes('people')) {
    await ev(`(() => { const g = __game, c = g.ch2, p = g.planets[1]; __go([55.5, 4.5]); const L = c.npc('lark').root.position, W = c.npc('granwren').root.position; const up = L.clone().sub(p.center).normalize();
      const cam = c.at([54.5, 3.2], 1.9); g.rig.override = { pos: cam, look: L.clone().lerp(W, 0.35).addScaledVector(up, 1.1), up }; })()`);
    await run(1200);
    await snap('7-sailtown-people');
    await ev('__game.rig.override = null');
  }
};
